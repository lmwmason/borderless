import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {AccountUser,OrganizationLogoMetadata} from '../organization-contracts';
import {getPool} from '../db';
import {ApiError} from '../http';
import {organizationAccess,audit,transaction} from '../organizations';
import {withPlatformActor} from '../billing/inquiries';
import {isEnabledAdminUser} from '../admin/auth';
import {getObjectStorage,type ObjectStorage} from '../storage';
import {encodeLogo} from './image';
export {encodeLogo,LOGO_MAX_BYTES,LOGO_MAX_DIMENSION,LOGO_MAX_PIXELS} from './image';
const OrgId=z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/);
type LogoRow={id:string;organization_id:string;storage_key:string;mime_type:'image/webp';bytes:number;width:number;height:number;uploaded_at:Date};
function metadata(row:LogoRow):OrganizationLogoMetadata{return {id:row.id,mimeType:'image/webp',bytes:row.bytes,width:row.width,height:row.height,uploadedAt:new Date(row.uploaded_at).toISOString()};}
async function context(client:PoolClient,userId:string,orgId:string){await client.query("SELECT set_config('borderless.user_id',$1,true),set_config('borderless.organization_id',$2,true)",[userId,orgId]);}
async function workerContext(client:PoolClient){await client.query("SELECT set_config('borderless.logo_cleanup_worker','on',true)");}
async function worker<T>(run:(client:PoolClient)=>Promise<T>){return transaction(async client=>{await workerContext(client);return run(client);});}
async function enqueue(client:PoolClient,orgId:string,key:string,delaySeconds=0){
 await workerContext(client);const row=(await client.query("INSERT INTO organization_logo_cleanup(id,organization_id,storage_key,next_attempt_at) VALUES($1,$2,$3,now()+($4*interval '1 second')) ON CONFLICT(storage_key) DO UPDATE SET status=CASE WHEN organization_logo_cleanup.status='Processing' THEN 'Processing' ELSE 'Pending' END,next_attempt_at=now()+($4*interval '1 second'),updated_at=now() RETURNING id",[randomUUID(),orgId,key,delaySeconds])).rows[0];return row.id as string;
}
async function uploadLimit(userId:string){const row=(await getPool().query("INSERT INTO request_limits(key,count,reset_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN request_limits.reset_at<=now() THEN 1 ELSE request_limits.count+1 END,reset_at=CASE WHEN request_limits.reset_at<=now() THEN now()+interval '1 minute' ELSE request_limits.reset_at END RETURNING count",[userId+':organization-logo-upload'])).rows[0];if(row.count>10)throw new ApiError(429,'RATE_LIMIT','Too many logo uploads. Try again in a minute.');}
export function createOrganizationLogoService(options:{storage?:ObjectStorage}={}){
 const storage=()=>options.storage??getObjectStorage();
 async function rowForUser(user:AccountUser,orgId:string,write=false,lock=false){OrgId.parse(orgId);return transaction(async client=>{await organizationAccess(client,user.id,orgId,{admin:write,lock});await context(client,user.id,orgId);return (await client.query('SELECT * FROM organization_logos WHERE organization_id=$1',[orgId])).rows[0] as LogoRow|undefined;});}
 async function admin(user:AccountUser){if(!await isEnabledAdminUser(user.id))throw new ApiError(403,'ADMIN_REQUIRED','An enabled administrator account is required.');}
 async function rowForAdmin(user:AccountUser,orgId:string){OrgId.parse(orgId);await admin(user);return withPlatformActor(user,async client=>{if(!(await client.query('SELECT id FROM organizations WHERE id=$1',[orgId])).rowCount)throw new ApiError(404,'NOT_FOUND','Organization not found.');return (await client.query('SELECT * FROM organization_logos WHERE organization_id=$1',[orgId])).rows[0] as LogoRow|undefined;});}
 async function processCleanup(input:{limit?:number;id?:string}={}){
  const maximum=Math.min(Math.max(input.limit??10,1),50);let processed=0,deleted=0,deferred=0;
  for(let i=0;i<maximum;i++){
   const token=randomUUID();const job=await worker(async client=>(await client.query("WITH candidate AS (SELECT id FROM organization_logo_cleanup WHERE ((status='Pending' AND next_attempt_at<=now()) OR (status='Processing' AND lease_expires_at<=now())) AND ($1::text IS NULL OR id=$1) ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE organization_logo_cleanup j SET status='Processing',lease_token=$2,lease_expires_at=now()+interval '60 seconds',attempts=attempts+1,updated_at=now() FROM candidate c WHERE j.id=c.id RETURNING j.*",[input.id??null,token])).rows[0]);
   if(!job)break;processed++;
   try{
    const referenced=await worker(async client=>(await client.query('SELECT id FROM organization_logos WHERE storage_key=$1',[job.storage_key])).rowCount!==0);
    if(!referenced){await storage().delete(job.storage_key);deleted++;}
    await worker(async client=>{await client.query("UPDATE organization_logo_cleanup SET status='Done',lease_token=NULL,lease_expires_at=NULL,error_category=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2",[job.id,token]);});
   }catch{
    deferred++;await worker(async client=>{await client.query("UPDATE organization_logo_cleanup SET status='Pending',lease_token=NULL,lease_expires_at=NULL,next_attempt_at=now()+interval '1 minute',error_category='delete_failed',updated_at=now() WHERE id=$1 AND lease_token=$2",[job.id,token]);}).catch(()=>{});
   }
  }return {processed,deleted,deferred};
 }
 async function bestEffort(id?:string){if(id)await processCleanup({id,limit:1}).catch(()=>{});}
 return {
  async getMetadataForUser(user:AccountUser,orgId:string){const row=await rowForUser(user,orgId);return row?metadata(row):null;},
  async getMetadataForAdmin(user:AccountUser,orgId:string){const row=await rowForAdmin(user,orgId);return row?metadata(row):null;},
  async uploadLogo(user:AccountUser,orgId:string,input:{bytes:Uint8Array;mimeType:string}){
   await rowForUser(user,orgId,true);await uploadLimit(user.id);const encoded=await encodeLogo(input),adapter=storage();const id=randomUUID(),key='organizations/'+OrgId.parse(orgId)+'/logos/'+id+'.webp';
   // Durable intent precedes the object write. A crashed upload can be reclaimed after its grace period.
   const stage=await worker(client=>enqueue(client,orgId,key,15*60));let oldCleanup:string|undefined;
   try{
    await adapter.put(key,encoded.buffer,encoded.mimeType);
    const result=await transaction(async client=>{
     await organizationAccess(client,user.id,orgId,{admin:true,lock:true});await context(client,user.id,orgId);await workerContext(client);
     const intent=(await client.query('SELECT status FROM organization_logo_cleanup WHERE id=$1 FOR UPDATE',[stage])).rows[0];if(intent?.status!=='Pending')throw new ApiError(409,'LOGO_UPLOAD_EXPIRED','The logo upload expired. Upload the image again.');
     const previous=(await client.query('SELECT * FROM organization_logos WHERE organization_id=$1 FOR UPDATE',[orgId])).rows[0] as LogoRow|undefined;
     const row=(await client.query("INSERT INTO organization_logos(id,organization_id,storage_key,mime_type,bytes,width,height,uploaded_by,uploaded_at) VALUES($1,$2,$3,'image/webp',$4,$5,$6,$7,now()) ON CONFLICT(organization_id) DO UPDATE SET id=excluded.id,storage_key=excluded.storage_key,mime_type=excluded.mime_type,bytes=excluded.bytes,width=excluded.width,height=excluded.height,uploaded_by=excluded.uploaded_by,uploaded_at=excluded.uploaded_at RETURNING *",[id,orgId,key,encoded.bytes,encoded.width,encoded.height,user.id])).rows[0] as LogoRow;
     await client.query("UPDATE organization_logo_cleanup SET status='Done',updated_at=now() WHERE id=$1",[stage]);if(previous)oldCleanup=await enqueue(client,orgId,previous.storage_key);
     await audit(client,user.id,orgId,'organization.logo_uploaded',{logoId:id,bytes:encoded.bytes,width:encoded.width,height:encoded.height,replacedLogoId:previous?.id??null});return metadata(row);
    });await bestEffort(oldCleanup);return result;
   }catch(error){
    // Rechecking references in the worker also protects an ambiguously acknowledged COMMIT.
    await worker(client=>enqueue(client,orgId,key)).then(bestEffort).catch(()=>{});
    if(error instanceof ApiError)throw error;throw new ApiError(503,'LOGO_UPLOAD_FAILED','The organization logo could not be saved. Please retry.');
   }
  },
  async deleteLogo(user:AccountUser,orgId:string){OrgId.parse(orgId);let cleanup:string|undefined;await transaction(async client=>{await organizationAccess(client,user.id,orgId,{admin:true,lock:true});await context(client,user.id,orgId);const row=(await client.query('SELECT * FROM organization_logos WHERE organization_id=$1 FOR UPDATE',[orgId])).rows[0] as LogoRow|undefined;if(!row)return;await client.query('DELETE FROM organization_logos WHERE id=$1',[row.id]);cleanup=await enqueue(client,orgId,row.storage_key);await audit(client,user.id,orgId,'organization.logo_deleted',{logoId:row.id});});await bestEffort(cleanup);return {ok:true as const};},
  async readLogo(user:AccountUser,orgId:string){const row=await rowForUser(user,orgId);if(!row)throw new ApiError(404,'NOT_FOUND','Organization logo not found.');let buffer:Buffer;try{buffer=await storage().get(row.storage_key);}catch{throw new ApiError(503,'LOGO_UNAVAILABLE','Organization logo storage is temporarily unavailable.');}await rowForUser(user,orgId);if(buffer.length!==row.bytes)throw new ApiError(503,'LOGO_UNAVAILABLE','Organization logo storage is temporarily unavailable.');return {buffer,mimeType:'image/webp' as const,metadata:metadata(row)};},
  async readLogoForAdmin(user:AccountUser,orgId:string){const row=await rowForAdmin(user,orgId);if(!row)throw new ApiError(404,'NOT_FOUND','Organization logo not found.');let buffer:Buffer;try{buffer=await storage().get(row.storage_key);}catch{throw new ApiError(503,'LOGO_UNAVAILABLE','Organization logo storage is temporarily unavailable.');}await admin(user);if(buffer.length!==row.bytes)throw new ApiError(503,'LOGO_UNAVAILABLE','Organization logo storage is temporarily unavailable.');return {buffer,mimeType:'image/webp' as const,metadata:metadata(row)};},
  processLogoCleanup:processCleanup
 };
}
export const organizationLogoService=createOrganizationLogoService();
export const getMetadataForUser=organizationLogoService.getMetadataForUser;
export const getMetadataForAdmin=organizationLogoService.getMetadataForAdmin;
export const uploadLogo=organizationLogoService.uploadLogo;
export const deleteLogo=organizationLogoService.deleteLogo;
export const readLogo=organizationLogoService.readLogo;
export const readLogoForAdmin=organizationLogoService.readLogoForAdmin;
export const processLogoCleanup=organizationLogoService.processLogoCleanup;

const cleanupGlobal=globalThis as typeof globalThis&{__borderlessLogoCleanupTimer?:ReturnType<typeof setInterval>};
export function startLogoCleanupWorker(){
 if(cleanupGlobal.__borderlessLogoCleanupTimer||!process.env.STORAGE_ENDPOINT||!process.env.STORAGE_BUCKET||!process.env.STORAGE_ACCESS_KEY||!process.env.STORAGE_SECRET_KEY)return;
 let running=false;const tick=async()=>{if(running)return;running=true;try{await processLogoCleanup({limit:5});}catch{/* Durable rows are retried on the next tick; never log credentials or object keys. */}finally{running=false;}};
 void tick();cleanupGlobal.__borderlessLogoCleanupTimer=setInterval(()=>{void tick();},30000);cleanupGlobal.__borderlessLogoCleanupTimer.unref();
}
export function stopLogoCleanupWorker(){if(cleanupGlobal.__borderlessLogoCleanupTimer)clearInterval(cleanupGlobal.__borderlessLogoCleanupTimer);delete cleanupGlobal.__borderlessLogoCleanupTimer;}
