import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {AccountUser} from '../organization-contracts';
import {requireUser} from '../auth';
import {ApiError} from '../http';
import {audit,limit,transaction} from '../organizations';
import {notificationRecord} from '../notifications';
export type InquiryStatus='Pending'|'In Review'|'Closed'|'Approved'|'Rejected';
export type SalesStatus='New'|'Contacted'|'Negotiating'|'Won'|'Lost';
export type OperatorInquiry={id:string;organizationId:string;companyName:string;requesterName:string;requesterEmail:string;notes:string;status:InquiryStatus;createdAt:string;reviewedAt:string|null;reviewNotes:string;salesStatus:SalesStatus;assigneeId:string|null;assigneeName:string|null;updatedAt:string};
const Status=z.enum(['Pending','In Review','Closed','Approved','Rejected']);
const Sales=z.enum(['New','Contacted','Negotiating','Won','Lost']);
const Review=z.object({status:z.enum(['In Review','Closed','Rejected']),notes:z.string().trim().min(1).max(5000)}).strict();
const idInput=z.string().min(1).max(160);
const configuredOperators=()=>[...new Set((process.env.BORDERLESS_PLATFORM_ADMIN_IDS||'').split(',').map(id=>id.trim()).filter(Boolean))];
export function isPlatformAdmin(user:Pick<AccountUser,'id'>|null|undefined):boolean{return Boolean(user?.id&&configuredOperators().includes(user.id));}
function assertPlatformAdmin(user:AccountUser){if(!isPlatformAdmin(user))throw new ApiError(403,'PLATFORM_ADMIN_REQUIRED','An explicitly configured platform operator is required. Organization roles do not grant platform inquiry access.');}

/** Server-environment authority only; never invoked from signup or a role body.
 * Startup can call this even for an empty allowlist so the last removal is
 * persisted and audited. Configuration authorship is unknown: audit actor null.
 */
export async function syncPlatformOperators():Promise<void>{
 const ids=configuredOperators();
 await transaction(async client=>{
  await client.query("SELECT set_config('borderless.platform_provisioner','on',true)");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('borderless:platform-operator-allowlist'))");
  const existing=(await client.query('SELECT user_id,active FROM platform_operator_grants FOR UPDATE')).rows;
  const actual=(await client.query('SELECT id FROM account_public WHERE id=ANY($1::text[])',[ids])).rows.map(row=>row.id as string);
  const wanted=new Set(actual);
  for(const row of existing.filter(row=>row.active&&!wanted.has(row.user_id))){
   await client.query('UPDATE platform_operator_grants SET active=false,revoked_at=now(),updated_at=now() WHERE user_id=$1',[row.user_id]);
   await client.query('INSERT INTO audit_logs(id,actor_id,action,detail) VALUES($1,NULL,$2,$3)',[randomUUID(),'platform.allowlist_revoked',{userId:row.user_id,source:'server_environment'}]);
   const affected=(await client.query('UPDATE enterprise_requests SET assignee_id=NULL,updated_at=now() WHERE assignee_id=$1 RETURNING id,organization_id',[row.user_id])).rows;
   for(const inquiry of affected){
    const detail={previousAssigneeId:row.user_id,source:'server_environment'};
    await client.query("INSERT INTO sales_inquiry_activity(id,inquiry_id,actor_id,action,detail) VALUES($1,$2,NULL,'sales.assignee_unassigned',$3)",[randomUUID(),inquiry.id,detail]);
    await client.query("INSERT INTO audit_logs(id,organization_id,actor_id,action,detail) VALUES($1,$2,NULL,'sales.assignee_unassigned',$3)",[randomUUID(),inquiry.organization_id,{inquiryId:inquiry.id,...detail}]);
   }
  }
  for(const userId of actual){
   if(existing.some(row=>row.user_id===userId&&row.active))continue;
   await client.query("INSERT INTO platform_operator_grants(user_id,active,source,provisioned_at,updated_at) VALUES($1,true,'server_environment',now(),now()) ON CONFLICT(user_id) DO UPDATE SET active=true,source='server_environment',revoked_at=NULL,provisioned_at=now(),updated_at=now()",[userId]);
   await client.query("INSERT INTO audit_logs(id,actor_id,action,detail) VALUES($1,NULL,'platform.allowlist_granted',$2)",[randomUUID(),{userId,source:'server_environment'}]);
  }
 });
}
export async function withPlatformActor<T>(user:AccountUser,run:(client:PoolClient)=>Promise<T>):Promise<T>{
 await syncPlatformOperators();assertPlatformAdmin(user);
 return transaction(async client=>{
  assertPlatformAdmin(user);
  await client.query("SELECT set_config('borderless.user_id',$1,true),set_config('borderless.platform_actor','on',true)",[user.id]);
  const result=await run(client);assertPlatformAdmin(user);return result;
 });
}
export async function requirePlatformAdmin(request:Request):Promise<AccountUser>{
 const user=await requireUser(request);await syncPlatformOperators();assertPlatformAdmin(user);return user;
}
const selectInquiry=`SELECT r.id,r.organization_id,
 coalesce(nullif(r.company_snapshot->>'companyName',''),o.name) AS company_name,
 coalesce(nullif(r.company_snapshot->>'requesterName',''),a.name,'') AS requester_name,
 coalesce(nullif(r.company_snapshot->>'requesterEmail',''),a.email,'') AS requester_email,
 r.notes,r.status,r.created_at,r.reviewed_at,coalesce(r.review_notes,'') AS review_notes,
 r.sales_status,r.assignee_id,assignee.name AS assignee_name,r.updated_at
 FROM enterprise_requests r JOIN organizations o ON o.id=r.organization_id
 LEFT JOIN account_public a ON a.id=r.requested_by
 LEFT JOIN account_public assignee ON assignee.id=r.assignee_id`;
const iso=(value:unknown)=>value instanceof Date?value.toISOString():String(value);
function record(row:Record<string,any>):OperatorInquiry{return {id:row.id,organizationId:row.organization_id,companyName:row.company_name,requesterName:row.requester_name,requesterEmail:row.requester_email,notes:row.notes,status:row.status,createdAt:iso(row.created_at),reviewedAt:row.reviewed_at?iso(row.reviewed_at):null,reviewNotes:row.review_notes,salesStatus:row.sales_status,assigneeId:row.assignee_id??null,assigneeName:row.assignee_name??null,updatedAt:iso(row.updated_at)};}
async function inquiry(client:PoolClient,id:string,lock=false){
 const row=(await client.query('SELECT id,organization_id,status,sales_status,assignee_id FROM enterprise_requests WHERE id=$1'+(lock?' FOR UPDATE':''),[idInput.parse(id)])).rows[0];
 if(!row)throw new ApiError(404,'NOT_FOUND','Introduction inquiry not found.');return row;
}
async function crmEvent(client:PoolClient,user:AccountUser,row:{id:string;organization_id:string},action:string,detail:Record<string,unknown>){
 await client.query('INSERT INTO sales_inquiry_activity(id,inquiry_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),row.id,user.id,action,detail]);
 await audit(client,user.id,row.organization_id,action,{inquiryId:row.id,...detail,contractExecuted:false,subscriptionActivated:false});
}
async function fullRecord(client:PoolClient,id:string){const row=(await client.query(selectInquiry+' WHERE r.id=$1',[id])).rows[0];if(!row)throw new ApiError(404,'NOT_FOUND','Introduction inquiry not found.');return record(row);}
export const inquiryService={
 async list(user:AccountUser,input:{status?:string;salesStatus?:string;q?:string;assigneeId?:string}={}){
  const fields=z.object({status:Status.optional(),salesStatus:Sales.optional(),q:z.string().trim().max(200).optional(),assigneeId:idInput.optional()}).strict().parse(input);
  return withPlatformActor(user,async client=>{
   const values:unknown[]=[],where:string[]=[];const bind=(v:unknown)=>{values.push(v);return '$'+values.length;};
   if(fields.status)where.push('r.status='+bind(fields.status));
   if(fields.salesStatus)where.push('r.sales_status='+bind(fields.salesStatus));
   if(fields.assigneeId==='unassigned')where.push('r.assignee_id IS NULL');
   else if(fields.assigneeId)where.push('r.assignee_id='+bind(fields.assigneeId));
   if(fields.q){
    const pattern='%'+fields.q.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')+'%',param=bind(pattern);
    where.push("(coalesce(r.company_snapshot->>'companyName',o.name) ILIKE "+param+" OR coalesce(r.company_snapshot->>'requesterName',a.name) ILIKE "+param+" OR coalesce(r.company_snapshot->>'requesterEmail',a.email) ILIKE "+param+" OR r.notes ILIKE "+param+" OR EXISTS(SELECT 1 FROM sales_inquiry_notes n WHERE n.inquiry_id=r.id AND n.body ILIKE "+param+"))");
   }
   const rows=await client.query(selectInquiry+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY r.updated_at DESC,r.id LIMIT 200',values);
   const assignees=(await client.query('SELECT a.id,a.name,a.email FROM platform_operator_grants g JOIN account_public a ON a.id=g.user_id WHERE g.active ORDER BY a.name,a.id')).rows as {id:string;name:string;email:string}[];
   await audit(client,user.id,null,'enterprise.inquiries_viewed',{status:fields.status??'all',salesStatus:fields.salesStatus??'all',count:rows.rows.length});
   return {inquiries:rows.rows.map(record),assignees};
  });
 },
 async get(user:AccountUser,id:string){
  idInput.parse(id);return withPlatformActor(user,async client=>{
   const row=await inquiry(client,id);
   const notes=(await client.query('SELECT n.id,n.author_id,a.name,n.body,n.created_at FROM sales_inquiry_notes n JOIN account_public a ON a.id=n.author_id WHERE n.inquiry_id=$1 ORDER BY n.created_at DESC,n.id LIMIT 200',[id])).rows.map(n=>({id:n.id,authorId:n.author_id,authorName:n.name,body:n.body,createdAt:iso(n.created_at)}));
   const activity=(await client.query('SELECT e.id,e.actor_id,a.name,e.action,e.detail,e.created_at FROM sales_inquiry_activity e LEFT JOIN account_public a ON a.id=e.actor_id WHERE e.inquiry_id=$1 ORDER BY e.created_at DESC,e.id LIMIT 200',[id])).rows.map(e=>({id:e.id,actorId:e.actor_id,actorName:e.name??'Server configuration',action:e.action,detail:e.detail,createdAt:iso(e.created_at)}));
   const notifications=(await client.query('SELECT * FROM notification_outbox WHERE aggregate_id=$1 ORDER BY created_at DESC,id',[id])).rows.map(notificationRecord);
   await audit(client,user.id,row.organization_id,'enterprise.inquiry_viewed',{inquiryId:id});
   return {inquiry:await fullRecord(client,id),notes,activity,notifications};
  });
 },
 async update(user:AccountUser,id:string,input:{salesStatus?:SalesStatus;assigneeId?:string|null}){
  const fields=z.object({salesStatus:Sales.optional(),assigneeId:idInput.nullable().optional()}).strict().refine(v=>v.salesStatus!==undefined||v.assigneeId!==undefined).parse(input);
  return withPlatformActor(user,async client=>{
   const row=await inquiry(client,id,true),changes:Record<string,unknown>={};
   if(fields.assigneeId!==undefined&&fields.assigneeId!==null){
    if(!configuredOperators().includes(fields.assigneeId)||(await client.query('SELECT user_id FROM platform_operator_grants WHERE user_id=$1 AND active',[fields.assigneeId])).rowCount!==1)throw new ApiError(400,'ASSIGNEE_INVALID','Assign inquiries only to a currently configured platform operator.');
   }
   if(fields.salesStatus!==undefined&&fields.salesStatus!==row.sales_status)changes.salesStatus={before:row.sales_status,after:fields.salesStatus};
   if(fields.assigneeId!==undefined&&fields.assigneeId!==row.assignee_id)changes.assigneeId={before:row.assignee_id,after:fields.assigneeId};
   if(Object.keys(changes).length){
    await client.query('UPDATE enterprise_requests SET sales_status=$1,assignee_id=$2,updated_at=now() WHERE id=$3',[fields.salesStatus??row.sales_status,fields.assigneeId===undefined?row.assignee_id:fields.assigneeId,id]);
    await crmEvent(client,user,row,'sales.inquiry_updated',changes);
   }
   return fullRecord(client,id);
  });
 },
 async addNote(user:AccountUser,id:string,input:{body:string}){
  const fields=z.object({body:z.string().trim().min(1).max(10000)}).strict().parse(input);
  return withPlatformActor(user,async client=>{
   const row=await inquiry(client,id,true),noteId=randomUUID();
   const saved=(await client.query('INSERT INTO sales_inquiry_notes(id,inquiry_id,author_id,body) VALUES($1,$2,$3,$4) RETURNING created_at',[noteId,id,user.id,fields.body])).rows[0];
   await client.query('UPDATE enterprise_requests SET updated_at=now() WHERE id=$1',[id]);
   await crmEvent(client,user,row,'sales.note_added',{noteId});
   return {id:noteId,authorId:user.id,authorName:user.name,body:fields.body,createdAt:iso(saved.created_at)};
  });
 },
 async review(user:AccountUser,id:string,input:{status:'In Review'|'Closed'|'Rejected';notes:string}):Promise<OperatorInquiry>{
  const value=Review.parse(input);idInput.parse(id);
  // The limiter borrows its own pooled connection. Complete it before holding
  // a platform transaction, including when the full five-client pool is busy.
  await syncPlatformOperators();assertPlatformAdmin(user);await limit(user.id,'approvals');
  return withPlatformActor(user,async client=>{
   const row=await inquiry(client,id,true);
   const allowed=row.status==='Pending'?['In Review','Closed','Rejected']:row.status==='In Review'?['Closed','Rejected']:[];
   if(!allowed.includes(value.status))throw new ApiError(409,'INQUIRY_STATE','This inquiry transition is not available. Closed, rejected and legacy approved inquiries are terminal.');
   await client.query('UPDATE enterprise_requests SET status=$1,reviewed_by=$2,reviewed_at=now(),review_notes=$3,updated_at=now() WHERE id=$4',[value.status,user.id,value.notes,id]);
   await crmEvent(client,user,row,'enterprise.inquiry_reviewed',{from:row.status,to:value.status});
   return fullRecord(client,id);
  });
 }
};
