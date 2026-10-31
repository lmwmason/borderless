import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import type {AccountUser} from '../organization-contracts';
import type {Engagement,SharedResource,CollaborationEntry} from '../expert-contracts';
import {withExpertActor} from '../experts/context';
import {authorizeProject,audit} from '../organizations';
import {ApiError} from '../http';

const idInput=z.string().min(1).max(160);
const resourcesInput=z.array(z.object({kind:z.enum(['assessment','finding','document']),id:idInput}).strict()).max(30);
const quoteInput=z.object({scope:z.string().trim().min(1).max(12000),priceMinor:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),currency:z.enum(['USD','KRW','EUR','GBP','CAD','JPY']),conditions:z.string().max(12000)}).strict();
const actionInput=z.object({action:z.enum(['submit','accept','decline','quote','agree','conflict','activate','complete','cancel','revoke_access','update_sharing']),quote:quoteInput.optional(),conflictStatus:z.enum(['Pending','Cleared','Conflict Found']).optional(),resources:resourcesInput.optional(),expiresAt:z.string().optional(),evidenceRefs:z.array(z.string().trim().min(1).max(1000)).max(30).optional(),notes:z.string().max(5000).optional(),attested:z.boolean().optional()}).strict();
export type EngagementActionInput=z.infer<typeof actionInput>;
const terminal=(e:Engagement)=>['Completed','Canceled','Declined'].includes(e.status);
const iso=(value:unknown)=>value instanceof Date?value.toISOString():String(value);
function fromRow(row:Record<string,any>):Engagement{return {...row.payload,id:row.id,organizationId:row.organization_id,projectId:row.project_id,expertId:row.expert_id,expertUserId:row.expert_user_id,status:row.status,accessExpiresAt:row.access_expires_at?iso(row.access_expires_at):null,revokedAt:row.revoked_at?iso(row.revoked_at):null,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)};}
type Access={engagement:Engagement;side:'company'|'expert'|'reviewer';role?:string};
async function load(client:PoolClient,user:AccountUser,id:string,write=false,reviewer=false):Promise<Access>{
 const row=(await client.query('SELECT * FROM engagements WHERE id=$1'+(write?' FOR UPDATE':''),[idInput.parse(id)])).rows[0];
 if(!row)throw new ApiError(404,'NOT_FOUND','Engagement not found.');
 const engagement=fromRow(row);
 if(reviewer)return {engagement,side:'reviewer'};
 if(engagement.expertUserId===user.id){
  if(engagement.status==='Canceled'||engagement.revokedAt||(engagement.accessExpiresAt&&new Date(engagement.accessExpiresAt).getTime()<=Date.now()))throw new ApiError(403,'ENGAGEMENT_ACCESS','This expert request no longer provides access.');
  const profile=(await client.query('SELECT status FROM expert_profiles WHERE id=$1 AND user_id=$2',[engagement.expertId,user.id])).rows[0];
  if(engagement.status==='Draft'||!profile||!['Pending Verification','Verified'].includes(profile.status))throw new ApiError(403,'ENGAGEMENT_ACCESS','This expert request is not available.');
  return {engagement,side:'expert'};
 }
 const scope=await authorizeProject(user.id,engagement.projectId,write,client);
 if(scope.organizationId!==engagement.organizationId)throw new ApiError(403,'FORBIDDEN','Engagement project scope mismatch.');
 return {engagement,side:'company',role:scope.role};
}
function company(access:Access,admin=false){
 if(access.side!=='company'||access.role==='Viewer'||(admin&&!['Owner','Admin'].includes(access.role!)))throw new ApiError(403,'FORBIDDEN',admin?'Organization Owner or Admin approval is required.':'An approved company member with write access is required.');
}
function expert(access:Access){if(access.side!=='expert')throw new ApiError(403,'FORBIDDEN','Only the assigned expert can perform this action.');}
function status(access:Access,allowed:Engagement['status'][]){if(!allowed.includes(access.engagement.status))throw new ApiError(409,'ENGAGEMENT_STATE','This action is unavailable in the current engagement state.');}
async function activeExpert(client:PoolClient,access:Access){
 const e=access.engagement;
 if(!['Active','Completed'].includes(e.status)||e.revokedAt||!e.accessExpiresAt||new Date(e.accessExpiresAt).getTime()<=Date.now()||e.contractStatus!=='Confirmed'||!e.companyAgreed||!e.expertAgreed||e.conflictStatus!=='Cleared')throw new ApiError(403,'CONTRACT_REQUIRED','Active, unexpired and unrevoked reviewed contract access is required.');
 const profile=(await client.query('SELECT status FROM expert_profiles WHERE id=$1 AND user_id=$2',[e.expertId,e.expertUserId])).rows[0];
 if(profile?.status!=='Verified')throw new ApiError(403,'EXPERT_VERIFICATION_REQUIRED','Verified expert status is required for shared workspace access.');
}
async function persist(client:PoolClient,e:Engagement){
 e.updatedAt=new Date().toISOString();
 await client.query('UPDATE engagements SET status=$1,payload=$2,access_expires_at=$3,revoked_at=$4,updated_at=$5 WHERE id=$6',[e.status,e,e.accessExpiresAt,e.revokedAt,e.updatedAt,e.id]);
}
async function event(client:PoolClient,user:AccountUser,e:Engagement,action:string,payload:Record<string,unknown>={},auditDetails:Record<string,unknown>=payload){
 await client.query('INSERT INTO engagement_events(id,engagement_id,organization_id,project_id,actor_id,action,payload,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())',[randomUUID(),e.id,e.organizationId,e.projectId,user.id,action,payload]);
 await audit(client,user.id,e.organizationId,action,{engagementId:e.id,...auditDetails},e.projectId);
}
async function snapshots(client:PoolClient,user:AccountUser,projectId:string,input:SharedResource[]){
 const scope=await authorizeProject(user.id,projectId,true,client);
 await client.query("SELECT set_config('borderless.organization_id',$1,true),set_config('borderless.project_id',$2,true)",[scope.organizationId,scope.projectId]);
 const seen=new Set<string>(),result:{kind:SharedResource['kind'];id:string;snapshot:unknown}[]=[];
 const tables={assessment:'assessments',finding:'findings',document:'documents'} as const;
 for(const resource of resourcesInput.parse(input)){
  const key=resource.kind+':'+resource.id;if(seen.has(key))continue;seen.add(key);
  const row=(await client.query('SELECT payload FROM '+tables[resource.kind]+' WHERE id=$1 AND organization_id=$2 AND project_id=$3',[resource.id,scope.organizationId,scope.projectId])).rows[0];
  if(!row)throw new ApiError(404,'RESOURCE_NOT_FOUND','A selected project resource was not found.');
  const {_order,...snapshot}=row.payload;
  result.push({kind:resource.kind,id:resource.id,snapshot});
 }
 return {scope,resources:result};
}
async function availableTarget(client:PoolClient,expertId:string,serviceId:string){
 const target=(await client.query("SELECT e.user_id FROM expert_directory e JOIN expert_service_directory s ON s.expert_id=e.id WHERE e.id=$1 AND s.id=$2 AND e.status='Verified' AND e.payload->>'available'='true'",[expertId,serviceId])).rows[0];
 if(!target)throw new ApiError(404,'EXPERT_UNAVAILABLE','An available verified public expert with a published service is required.');
 return target as {user_id:string};
}
async function replaceResources(client:PoolClient,e:Engagement,resources:{kind:SharedResource['kind'];id:string;snapshot:unknown}[]){
 await client.query('DELETE FROM engagement_resources WHERE engagement_id=$1',[e.id]);
 for(const resource of resources)await client.query('INSERT INTO engagement_resources(id,engagement_id,organization_id,project_id,resource_kind,resource_id,payload,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())',[randomUUID(),e.id,e.organizationId,e.projectId,resource.kind,resource.id,resource.snapshot]);
 e.resources=resources.map(({kind,id})=>({kind,id}));
}

export const engagementService={
 async list(user:AccountUser,input:{projectId?:string}={}){
  return withExpertActor(user,async client=>{
   if(input.projectId){await authorizeProject(user.id,idInput.parse(input.projectId),false,client);return (await client.query('SELECT * FROM engagements WHERE project_id=$1 ORDER BY created_at DESC',[input.projectId])).rows.map(fromRow);}
   return (await client.query("SELECT * FROM engagements WHERE expert_user_id=$1 AND status NOT IN ('Draft','Canceled') AND revoked_at IS NULL AND (access_expires_at IS NULL OR access_expires_at>now()) ORDER BY created_at DESC",[user.id])).rows.map(fromRow);
  });
 },
 async create(user:AccountUser,input:{projectId:string;expertId:string;serviceId:string;title:string;description:string;resources:SharedResource[]}){
  const value=z.object({projectId:idInput,expertId:idInput,serviceId:idInput,title:z.string().trim().min(1).max(200),description:z.string().trim().min(1).max(12000),resources:resourcesInput}).strict().parse(input);
  return withExpertActor(user,async client=>{
   const {scope,resources}=await snapshots(client,user,value.projectId,value.resources);
   const target=await availableTarget(client,value.expertId,value.serviceId);
   if(target.user_id===user.id)throw new ApiError(409,'SELF_ENGAGEMENT','An expert cannot engage themselves as the requesting company.');
   const now=new Date().toISOString();
   const e:Engagement={id:randomUUID(),organizationId:scope.organizationId,projectId:scope.projectId,expertId:value.expertId,expertUserId:target.user_id,serviceId:value.serviceId,status:'Draft',title:value.title,description:value.description,resources:[],quote:null,companyAgreed:false,expertAgreed:false,conflictStatus:'Pending',contractStatus:'Pending',accessExpiresAt:null,revokedAt:null,createdAt:now,updatedAt:now};
   await client.query('INSERT INTO engagements(id,organization_id,project_id,expert_id,expert_user_id,created_by,status,payload,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)',[e.id,e.organizationId,e.projectId,e.expertId,e.expertUserId,user.id,e.status,e,now]);
   await replaceResources(client,e,resources);await persist(client,e);
   await event(client,user,e,'engagement.created',{from:null,to:'Draft',resourceCount:resources.length});return e;
  });
 },
 async get(user:AccountUser,id:string){return withExpertActor(user,async client=>(await load(client,user,id)).engagement);},
 async action(user:AccountUser,id:string,input:EngagementActionInput){
  const value=actionInput.parse(input),reviewer=value.action==='activate';
  return withExpertActor(user,async client=>{
   const access=await load(client,user,id,true,reviewer),e=access.engagement,from=e.status;
   let action='';let extra:Record<string,unknown>=value.notes?{notes:value.notes}:{};
   switch(value.action){
    case 'submit':{
     company(access);status(access,['Draft']);const target=await availableTarget(client,e.expertId,e.serviceId);
     if(target.user_id!==e.expertUserId)throw new ApiError(409,'EXPERT_UNAVAILABLE','The assigned service is no longer available.');
     e.status='Submitted';action='engagement.submitted';break;
    }
    case 'accept':expert(access);status(access,['Submitted']);e.status='Accepted';action='engagement.accepted';break;
    case 'decline':expert(access);status(access,['Submitted','Accepted','Agreement Pending']);e.status='Declined';action='engagement.declined';break;
    case 'quote':expert(access);status(access,['Accepted','Agreement Pending']);if(!value.quote)throw new ApiError(400,'QUOTE_REQUIRED','An explicit expert quote is required.');e.quote=value.quote;e.companyAgreed=false;e.expertAgreed=false;e.contractStatus='Pending';e.status='Agreement Pending';action='engagement.quoted';extra={...extra,quote:value.quote};break;
    case 'agree':
     status(access,['Agreement Pending']);if(!e.quote)throw new ApiError(409,'QUOTE_REQUIRED','Review the explicit expert quote first.');
     if(access.side==='expert')e.expertAgreed=true;else{company(access,true);e.companyAgreed=true;}action='engagement.agreed';break;
    case 'conflict':
     expert(access);status(access,['Accepted','Agreement Pending','Active']);if(!value.conflictStatus)throw new ApiError(400,'CONFLICT_STATUS_REQUIRED','An explicit conflict check status is required.');
     e.conflictStatus=value.conflictStatus;
     if(from==='Active'&&e.conflictStatus!=='Cleared'){e.status='Agreement Pending';e.companyAgreed=false;e.expertAgreed=false;}
     action='engagement.conflict_updated';extra={...extra,conflictStatus:e.conflictStatus};break;
    case 'activate':{
     status(access,['Agreement Pending']);
     if(e.expertUserId===user.id)throw new ApiError(403,'SELF_REVIEW','An expert cannot confirm their own engagement contract.');
     if(value.attested!==true||!value.evidenceRefs?.length)throw new ApiError(400,'CONTRACT_EVIDENCE_REQUIRED','Manual attestation and executed agreement references are required.');
     const entitlement=(await client.query('SELECT o.status,o.plan,s.plan AS subscription_plan,s.status AS subscription_status,s.expires_at FROM organizations o JOIN subscriptions s ON s.organization_id=o.id WHERE o.id=$1',[e.organizationId])).rows[0];
     if(!entitlement||entitlement.status!=='Active'||entitlement.subscription_status!=='Active'||entitlement.plan!==entitlement.subscription_plan||(entitlement.plan!=='Free'&&!entitlement.expires_at)||(entitlement.expires_at&&new Date(entitlement.expires_at).getTime()<=Date.now()))throw new ApiError(403,'ORGANIZATION_INACTIVE','Company project entitlement must be active before contract access is activated.');
     const profile=(await client.query('SELECT status FROM expert_profiles WHERE id=$1',[e.expertId])).rows[0];
     if(profile?.status!=='Verified'||!e.companyAgreed||!e.expertAgreed||e.conflictStatus!=='Cleared'||!e.quote||e.quote.priceMinor===null)throw new ApiError(409,'CONTRACT_NOT_READY','Verified credentials, a confirmed numeric quote, a cleared conflict check and separate company/expert agreements are required.');
     const now=Date.now(),expires=value.expiresAt?new Date(value.expiresAt).getTime():now+30*86400000;
     if(!Number.isFinite(expires)||expires<=now||expires>now+365*86400000)throw new ApiError(400,'ACCESS_EXPIRY','Access expiry must be in the future and within the internal one-year access policy.');
     e.accessExpiresAt=new Date(expires).toISOString();e.contractStatus='Confirmed';e.status='Active';e.revokedAt=null;
     action='engagement.activated';extra={attested:true,evidenceRefs:value.evidenceRefs,notes:value.notes??'',expiresAt:e.accessExpiresAt};break;
    }
    case 'complete':
     status(access,['Active']);if(access.side==='expert')await activeExpert(client,access);else company(access,true);e.status='Completed';action='engagement.completed';break;
    case 'cancel':
     if(terminal(e))throw new ApiError(409,'ENGAGEMENT_STATE','This request is already terminal.');
     if(access.side!=='expert')company(access);e.status='Canceled';action='engagement.canceled';break;
    case 'revoke_access':company(access,true);e.revokedAt=new Date().toISOString();e.status='Canceled';action='engagement.access_revoked';break;
    case 'update_sharing':{
     company(access);if(terminal(e))throw new ApiError(409,'ENGAGEMENT_STATE','Terminal engagement sharing cannot be changed.');
     if(!value.resources)throw new ApiError(400,'SHARING_REQUIRED','Explicit selected project resources are required.');
     const selected=await snapshots(client,user,e.projectId,value.resources);await replaceResources(client,e,selected.resources);action='engagement.sharing_updated';extra={...extra,resourceCount:selected.resources.length,resources:e.resources};break;
    }
   }
   // Expert completion/cancellation events must be inserted while the row still
   // has its previous permitted state; the transaction makes the change atomic.
   if(access.side==='expert')await event(client,user,e,action,{from,to:e.status},{from,to:e.status,...extra});
   if(access.side==='expert'&&value.action==='cancel'){
    const canceled=(await client.query('SELECT public.cancel_assigned_engagement($1) AS canceled',[e.id])).rows[0]?.canceled;
    if(!canceled)throw new ApiError(403,'ENGAGEMENT_ACCESS','This expert request no longer permits cancellation.');
    e.updatedAt=new Date().toISOString();e.revokedAt=e.updatedAt;
   }else await persist(client,e);
   if(access.side!=='expert')await event(client,user,e,action,{from,to:e.status}, {from,to:e.status,...extra});
   return e;
  },reviewer?{reviewer:true,engagementId:id}:undefined);
 },
 async workspace(user:AccountUser,id:string){
  return withExpertActor(user,async client=>{
   const access=await load(client,user,id),e=access.engagement;
   if(!['Active','Completed'].includes(e.status))throw new ApiError(403,'CONTRACT_REQUIRED','Collaboration workspace access begins only after confirmed contract activation.');
   if(access.side==='expert')await activeExpert(client,access);
   const resources=(await client.query('SELECT resource_kind,resource_id,payload FROM engagement_resources WHERE engagement_id=$1 ORDER BY created_at,id',[id])).rows.map(row=>({kind:row.resource_kind,id:row.resource_id,snapshot:row.payload}));
   const entries=(await client.query('SELECT payload FROM engagement_entries WHERE engagement_id=$1 ORDER BY created_at,id',[id])).rows.map(row=>row.payload as CollaborationEntry);
   const activity=(await client.query('SELECT id,actor_id,action,payload,created_at FROM engagement_events WHERE engagement_id=$1 ORDER BY created_at,id',[id])).rows.map(row=>({id:row.id,actorId:row.actor_id,action:row.action,...row.payload,createdAt:iso(row.created_at)}));
   return {engagement:e,resources,entries,activity};
  });
 },
 async addEntry(user:AccountUser,id:string,input:{kind:CollaborationEntry['kind'];body:string;assigneeId?:string|null;status?:CollaborationEntry['status']}){
  const value=z.object({kind:z.enum(['message','information_request','expert_opinion','task']),body:z.string().trim().min(1).max(20000),assigneeId:idInput.nullable().optional(),status:z.enum(['open','in_progress','done']).optional()}).strict().parse(input);
  return withExpertActor(user,async client=>{
   const access=await load(client,user,id,true),e=access.engagement;status(access,['Active']);
   if(access.side==='expert')await activeExpert(client,access);else company(access);
   if(value.kind==='expert_opinion')expert(access);
   if(value.assigneeId&&value.assigneeId!==e.expertUserId){
    const eligible=(await client.query("SELECT user_id FROM memberships WHERE organization_id=$1 AND user_id=$2 AND role<>'Pending'",[e.organizationId,value.assigneeId])).rows[0];
    if(!eligible)throw new ApiError(400,'ASSIGNEE_INVALID','Assign collaboration work only to the expert or an approved company member.');
   }
   const entry:CollaborationEntry={id:randomUUID(),kind:value.kind,authorId:user.id,body:value.body,assigneeId:value.assigneeId??null,status:value.status??'open',createdAt:new Date().toISOString()};
   await client.query('INSERT INTO engagement_entries(id,engagement_id,organization_id,project_id,author_id,kind,payload,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[entry.id,e.id,e.organizationId,e.projectId,user.id,entry.kind,entry,entry.createdAt]);
   await event(client,user,e,'collaboration.entry_created',{entryId:entry.id,kind:entry.kind});return entry;
  });
 },
 async updateEntry(user:AccountUser,id:string,entryId:string,input:{status:CollaborationEntry['status']}){
  const value=z.object({status:z.enum(['open','in_progress','done'])}).strict().parse(input);
  return withExpertActor(user,async client=>{
   const access=await load(client,user,id,true),e=access.engagement;status(access,['Active']);
   if(access.side==='expert')await activeExpert(client,access);else company(access);
   const row=(await client.query('SELECT payload,kind FROM engagement_entries WHERE id=$1 AND engagement_id=$2',[idInput.parse(entryId),id])).rows[0];
   if(!row)throw new ApiError(404,'NOT_FOUND','Collaboration entry not found.');
   if(row.kind!=='task')throw new ApiError(409,'ENTRY_IMMUTABLE','Only collaboration task status can be updated. Expert opinions and messages remain separate records.');
   const entry:CollaborationEntry={...row.payload,status:value.status};
   await client.query('UPDATE engagement_entries SET payload=$1 WHERE id=$2 AND engagement_id=$3',[entry,entryId,id]);
   await event(client,user,e,'collaboration.task_updated',{entryId,status:entry.status});return entry;
  });
 }
};
