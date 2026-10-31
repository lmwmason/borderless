import {randomBytes,randomUUID,createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {getPool} from '../db';
import {requireUser} from '../auth';
import {ApiError} from '../http';
import {assertCapacity} from '../entitlements';
import type {AccountUser,Role,OrganizationSummary,OrganizationDetail,AccountOverview,ProjectSummary} from '../organization-contracts';
export type QueryClient=Pick<PoolClient,'query'>;
export const uuid=()=>randomUUID();
const iso=(v:unknown)=>v instanceof Date?v.toISOString():String(v);
export async function transaction<T>(run:(client:PoolClient)=>Promise<T>):Promise<T>{
 const client=await getPool().connect();try{await client.query('BEGIN');const result=await run(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function audit(client:QueryClient,actorId:string,organizationId:string|null,action:string,detail:Record<string,unknown>={},projectId:string|null=null){
 await client.query("INSERT INTO audit_logs(id,organization_id,project_id,actor_id,action,detail,created_at) VALUES($1,$2,$3,$4,$5,$6,now())",[uuid(),organizationId,projectId,actorId,action,JSON.stringify(detail)]);
}
/** Shared DB counters survive process restarts; counting has its own commit. */
export async function limit(userId:string,action:'join'|'invites'|'approvals'){
 const maximum={join:5,invites:10,approvals:20}[action];
 const result=await getPool().query("INSERT INTO request_limits(key,count,reset_at) VALUES($1,1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN request_limits.reset_at<=now() THEN 1 ELSE request_limits.count+1 END,reset_at=CASE WHEN request_limits.reset_at<=now() THEN now()+interval '1 minute' ELSE request_limits.reset_at END RETURNING count",[userId+':'+action]);
 if(result.rows[0].count>maximum)throw new ApiError(429,'RATE_LIMIT','Too many requests. Try again in a minute.');
}
type OrgRow={id:string;name:string;status:string;plan:string;workspaceId:string;role:Role};
export async function organizationAccess(client:QueryClient,userId:string,orgId:string,options:{admin?:boolean;active?:boolean;write?:boolean;lock?:boolean}={}):Promise<OrgRow>{
 // Organization lock comes before membership lock in every mutation.
 const org=await client.query('SELECT id,name,status,plan FROM organizations WHERE id=$1'+(options.lock?' FOR UPDATE':''),[orgId]);
 if(!org.rows[0])throw new ApiError(404,'NOT_FOUND','Organization not found.');
 const member=await client.query('SELECT role FROM memberships WHERE organization_id=$1 AND user_id=$2'+(options.lock?' FOR UPDATE':''),[orgId,userId]);
 const role=member.rows[0]?.role as Role|undefined;
 if(!role||role==='Pending')throw new ApiError(403,'FORBIDDEN','Approved organization membership is required.');
 if(options.admin&&!['Owner','Admin'].includes(role))throw new ApiError(403,'FORBIDDEN','Organization administrator access is required.');
 if(options.write&&role==='Viewer')throw new ApiError(403,'READ_ONLY','Viewer membership is read-only.');
 if(options.active){
  const subscription=await client.query("SELECT plan,status,expires_at FROM subscriptions WHERE organization_id=$1",[orgId]);
  const sub=subscription.rows[0];
  if(org.rows[0].status!=='Active'||sub?.status!=='Active'||sub.plan!==org.rows[0].plan||(org.rows[0].plan!=='Free'&&!sub.expires_at)||(sub.expires_at&&new Date(sub.expires_at).getTime()<=Date.now()))throw new ApiError(403,'ORGANIZATION_INACTIVE','Activate an eligible organization subscription before accessing projects.');
 }
 const workspace=await client.query("SELECT id FROM organization_workspaces WHERE organization_id=$1",[orgId]);
 if(!workspace.rows[0])throw new ApiError(409,'WORKSPACE_MISSING','Organization workspace is unavailable.');
 return {...org.rows[0],workspaceId:workspace.rows[0].id,role};
}
export async function authorizeProject(userId:string,projectId:string,write=false,client:QueryClient=getPool()){
 const project=(await client.query("SELECT id,organization_id,workspace_id FROM projects WHERE id=$1",[projectId])).rows[0];
 if(!project)throw new ApiError(404,'NOT_FOUND','Project not found.');
 const organization=await organizationAccess(client,userId,project.organization_id,{active:true,write,lock:client!==getPool()});
 return {organizationId:organization.id,projectId:project.id,workspaceId:project.workspace_id,role:organization.role as Exclude<Role,'Pending'>};
}
export async function requireProject(req:Request,write=false){
 const user=await requireUser(req);
 const projectId=req.headers.get('x-project-id');
 if(!projectId||projectId.length>128)throw new ApiError(400,'PROJECT_REQUIRED','Select a project first.');
 return {user,...await authorizeProject(user.id,projectId,write)};
}
const nameInput=z.string().trim().min(1).max(160);
const roleInput=z.enum(['Admin','Member','Viewer']);
const projectMap=(p:Record<string,unknown>,role?:Role):ProjectSummary=>({id:String(p.id),organizationId:String(p.organization_id),workspaceId:String(p.workspace_id),name:String(p.name),description:String(p.description),createdAt:iso(p.created_at),role});
const summary=(org:OrgRow)=>({...org,logo:('logo' in org?org.logo:null)}) as OrganizationSummary;
const logoColumns='l.id AS logo_id,l.mime_type AS logo_mime,l.bytes AS logo_bytes,l.width AS logo_width,l.height AS logo_height,l.uploaded_at AS logo_uploaded_at';
const logoSummary=(row:Record<string,unknown>)=>row.logo_id?{id:String(row.logo_id),mimeType:'image/webp' as const,bytes:Number(row.logo_bytes),width:Number(row.logo_width),height:Number(row.logo_height),uploadedAt:iso(row.logo_uploaded_at)}:null;
export const organizationService={
 async account(user:AccountUser):Promise<AccountOverview>{
  return transaction(async client=>{
   await client.query("SELECT set_config('borderless.user_id',$1,true)",[user.id]);
   const organizations=await client.query('SELECT o.id,o.name,o.status,o.plan,w.id AS "workspaceId",m.role,'+logoColumns+" FROM memberships m JOIN organizations o ON o.id=m.organization_id JOIN organization_workspaces w ON w.organization_id=o.id LEFT JOIN organization_logos l ON l.organization_id=o.id WHERE m.user_id=$1 AND m.role<>'Pending' ORDER BY o.created_at",[user.id]);
   const pending=await client.query("SELECT o.id AS \"organizationId\",o.name AS \"organizationName\",r.status FROM join_requests r JOIN organizations o ON o.id=r.organization_id WHERE r.user_id=$1 AND r.status='Pending' ORDER BY r.created_at DESC",[user.id]);
   return {user,organizations:organizations.rows.map(row=>({id:row.id,name:row.name,status:row.status,plan:row.plan,workspaceId:row.workspaceId,role:row.role,logo:logoSummary(row)})),pending:pending.rows};
  });
 },
 async create(user:AccountUser,input:{name:string}){
  const name=nameInput.parse(input.name);
  return transaction(async client=>{
   const id=uuid(),workspaceId=uuid();
   await client.query("INSERT INTO organizations(id,name,status,plan,created_at) VALUES($1,$2,'Draft','Free',now())",[id,name]);
   await client.query("INSERT INTO organization_workspaces(id,organization_id) VALUES($1,$2)",[workspaceId,id]);
   await client.query("INSERT INTO memberships(id,organization_id,user_id,role,created_at) VALUES($1,$2,$3,'Owner',now())",[uuid(),id,user.id]);
   await client.query("INSERT INTO subscriptions(id,organization_id,plan,status,updated_at) VALUES($1,$2,'Free','Pending',now())",[uuid(),id]);
   await audit(client,user.id,id,'organization.created',{name});
   return summary({id,name,status:'Draft',plan:'Free',workspaceId,role:'Owner'});
  });
 },
 async detail(user:AccountUser,orgId:string):Promise<OrganizationDetail>{
  return transaction(async client=>{
   const org=await organizationAccess(client,user.id,orgId,{lock:true});
   await client.query("SELECT set_config('borderless.user_id',$1,true)",[user.id]);
   const logoRow=(await client.query('SELECT '+logoColumns+' FROM organization_logos l WHERE l.organization_id=$1',[orgId])).rows[0];
   const admin=['Owner','Admin'].includes(org.role);
   if(org.status!=='Active'&&!admin)throw new ApiError(403,'ORGANIZATION_INACTIVE','Organization activation is required.');
   const members=await client.query("SELECT m.id,m.user_id AS \"userId\",u.name,u.email,m.role FROM memberships m JOIN account_public u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY m.created_at",[orgId]);
   const requests=admin?await client.query("SELECT r.id,r.user_id AS \"userId\",u.name,u.email,lower(r.status) AS status,r.created_at AS \"createdAt\" FROM join_requests r JOIN account_public u ON u.id=r.user_id WHERE r.organization_id=$1 ORDER BY r.created_at DESC",[orgId]):{rows:[]};
   const invites=admin?await client.query("SELECT id,expires_at AS \"expiresAt\",revoked_at AS \"revokedAt\",created_at AS \"createdAt\" FROM invitations WHERE organization_id=$1 ORDER BY created_at DESC",[orgId]):{rows:[]};
   let canUseProjects=false;
   if(org.status==='Active')try {await organizationAccess(client,user.id,orgId,{active:true});canUseProjects=true;}catch(error){if(!(error instanceof ApiError)||error.code!=='ORGANIZATION_INACTIVE'||!admin)throw error;}
   const projects=canUseProjects?await client.query("SELECT * FROM projects WHERE organization_id=$1 ORDER BY created_at",[orgId]):{rows:[]};
   return {organization:{...summary(org),logo:logoRow?logoSummary(logoRow):null},members:members.rows,requests:requests.rows.map(r=>({...r,createdAt:iso(r.createdAt)})),invites:invites.rows.map(i=>({...i,expiresAt:iso(i.expiresAt),revokedAt:i.revokedAt?iso(i.revokedAt):null,createdAt:iso(i.createdAt)})),projects:projects.rows.map(p=>projectMap(p,org.role))};
  });
 },
 async join(user:AccountUser,code:string){
  await limit(user.id,'join');z.string().min(40).max(128).parse(code);
  const hash=createHash('sha256').update(code).digest('hex');
  return transaction(async client=>{
   const invitation=(await client.query("SELECT id,organization_id FROM invitations WHERE code_hash=$1 AND revoked_at IS NULL AND expires_at>now()",[hash])).rows[0];
   if(!invitation)throw new ApiError(404,'INVITE_INVALID','Invitation is invalid or expired.');
   const orgId=invitation.organization_id;
   await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[orgId]);
   const valid=(await client.query('SELECT id FROM invitations WHERE id=$1 AND code_hash=$2 AND revoked_at IS NULL AND expires_at>now() FOR SHARE',[invitation.id,hash])).rows[0];
   if(!valid)throw new ApiError(404,'INVITE_INVALID','Invitation is invalid or expired.');
   const existing=(await client.query("SELECT role FROM memberships WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",[orgId,user.id])).rows[0];
   if(existing&&existing.role!=='Pending')throw new ApiError(409,'ALREADY_MEMBER','You already belong to this organization.');
   await client.query("INSERT INTO memberships(id,organization_id,user_id,role,created_at) VALUES($1,$2,$3,'Pending',now()) ON CONFLICT(organization_id,user_id) DO NOTHING",[uuid(),orgId,user.id]);
   const request=await client.query("INSERT INTO join_requests(id,organization_id,user_id,status,created_at) VALUES($1,$2,$3,'Pending',now()) ON CONFLICT(organization_id,user_id) DO UPDATE SET status='Pending',decided_at=NULL,created_at=now() RETURNING id",[uuid(),orgId,user.id]);
   await audit(client,user.id,orgId,'membership.requested',{requestId:request.rows[0].id});
   return {organizationId:orgId,status:'pending'};
  });
 },
 async createInvite(user:AccountUser,orgId:string,input:{expiresInHours?:number}={}){
  await limit(user.id,'invites');const hours=z.number().int().min(1).max(168).parse(input.expiresInHours??48);
  return transaction(async client=>{
   await organizationAccess(client,user.id,orgId,{admin:true,lock:true});
   const id=uuid(),code=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(code).digest('hex');
   const result=await client.query("INSERT INTO invitations(id,organization_id,code_hash,created_by,expires_at,created_at) VALUES($1,$2,$3,$4,now()+($5 * interval '1 hour'),now()) RETURNING expires_at",[id,orgId,hash,user.id,hours]);
   await audit(client,user.id,orgId,'invitation.created',{invitationId:id});
   return {id,code,expiresAt:iso(result.rows[0].expires_at)};
  });
 },
 async revokeInvite(user:AccountUser,orgId:string,id:string){
  return transaction(async client=>{
   await organizationAccess(client,user.id,orgId,{admin:true,lock:true});
   const result=await client.query("UPDATE invitations SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND organization_id=$2 RETURNING id",[id,orgId]);
   if(!result.rowCount)throw new ApiError(404,'NOT_FOUND','Invitation not found.');
   await audit(client,user.id,orgId,'invitation.revoked',{invitationId:id});return {ok:true};
  });
 },
 async decideRequest(user:AccountUser,orgId:string,id:string,input:{decision:'approve'|'reject';role:'Member'|'Viewer'|'Admin'}){
  await limit(user.id,'approvals');const decision=z.enum(['approve','reject']).parse(input.decision),role=roleInput.parse(input.role);
  return transaction(async client=>{
   const org=await organizationAccess(client,user.id,orgId,{admin:true,lock:true});
   if(role==='Admin'&&org.role!=='Owner')throw new ApiError(403,'FORBIDDEN','Only the Owner may grant Admin.');
   const request=(await client.query("SELECT user_id,status FROM join_requests WHERE id=$1 AND organization_id=$2 FOR UPDATE",[id,orgId])).rows[0];
   if(!request||request.status!=='Pending')throw new ApiError(409,'REQUEST_UNAVAILABLE','Pending join request not found.');
   const member=(await client.query("SELECT id,role FROM memberships WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",[orgId,request.user_id])).rows[0];
   if(!member||member.role!=='Pending')throw new ApiError(409,'REQUEST_UNAVAILABLE','Membership request is no longer pending.');
   if(decision==='approve'){await client.query("SELECT set_config('borderless.organization_id',$1,true),set_config('borderless.user_id',$2,true)",[orgId,user.id]);await assertCapacity(client,orgId,'members');}
   await client.query("UPDATE join_requests SET status=$1,decided_at=now() WHERE id=$2",[decision==='approve'?'Approved':'Rejected',id]);
   if(decision==='approve')await client.query("UPDATE memberships SET role=$1 WHERE id=$2",[role,member.id]);
   await audit(client,user.id,orgId,'membership.'+decision,{requestId:id,memberId:member.id,role:decision==='approve'?role:'Pending'});
   return {ok:true};
  });
 },
 async changeMemberRole(user:AccountUser,orgId:string,id:string,inputRole:Exclude<Role,'Owner'|'Pending'>){
  const role=roleInput.parse(inputRole);
  return transaction(async client=>{
   const org=await organizationAccess(client,user.id,orgId,{admin:true,lock:true});
   const member=(await client.query("SELECT id,role,user_id FROM memberships WHERE id=$1 AND organization_id=$2 FOR UPDATE",[id,orgId])).rows[0];
   if(!member)throw new ApiError(404,'NOT_FOUND','Membership not found.');
   if(member.role==='Owner'||member.role==='Pending')throw new ApiError(403,'FORBIDDEN','Owner or pending memberships cannot be changed here.');
   if(org.role==='Admin'&&(role==='Admin'||member.role==='Admin'))throw new ApiError(403,'FORBIDDEN','Only the Owner may manage Admin membership.');
   await client.query("UPDATE memberships SET role=$1 WHERE id=$2",[role,id]);
   await audit(client,user.id,orgId,'membership.role_changed',{memberId:id,role});return {ok:true};
  });
 },
 async createProject(user:AccountUser,orgId:string,input:{name:string;description?:string}){
  const name=nameInput.parse(input.name),description=z.string().max(2000).parse(input.description??'');
  return transaction(async client=>{
   const org=await organizationAccess(client,user.id,orgId,{active:true,write:true,lock:true});
   await client.query("SELECT set_config('borderless.organization_id',$1,true),set_config('borderless.user_id',$2,true)",[orgId,user.id]);await assertCapacity(client,orgId,'projects');
   const project=(await client.query("INSERT INTO projects(id,organization_id,workspace_id,name,description,created_at) VALUES($1,$2,$3,$4,$5,now()) RETURNING *",[uuid(),orgId,org.workspaceId,name,description])).rows[0];
   await audit(client,user.id,orgId,'project.created',{name},project.id);return projectMap(project,org.role);
  });
 },
 async getProject(user:AccountUser,projectId:string){
  return transaction(async client=>{const scope=await authorizeProject(user.id,projectId,false,client);const project=(await client.query("SELECT * FROM projects WHERE id=$1 AND organization_id=$2",[projectId,scope.organizationId])).rows[0];return projectMap(project,scope.role);});
 }
};
