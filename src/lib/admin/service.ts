import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {AccountUser} from '../organization-contracts';
import {isEnabledAdminUser,adminIsDemo,adminDemoAllowed,revokeAdminManagedUserSessions} from './auth';
import {ADMIN_EMAIL_DOMAIN} from './identity';
import {withPlatformActor} from '../billing/inquiries';
import {ApiError} from '../http';
import {audit} from '../organizations';
import {ContractInputSchema,FEATURE_IDS,contractMetadata,resolveEntitlements,type ContractInput,type EntitlementSnapshot} from '../entitlements';

const idInput=z.string().min(1).max(160),reasonInput=z.string().trim().min(1).max(5000);
const iso=(value:unknown)=>new Date(value as string|Date).toISOString();
async function enabled(user:AccountUser){if(!await isEnabledAdminUser(user.id))throw new ApiError(403,'ADMIN_REQUIRED','An enabled administrator account is required. Legacy operator configuration does not grant this permission.');}
async function platform<T>(user:AccountUser,run:(client:PoolClient)=>Promise<T>){await enabled(user);return withPlatformActor(user,async client=>{await enabled(user);return run(client);});}
async function organization(client:PoolClient,id:string){const row=(await client.query('SELECT id,name,status,plan FROM organizations WHERE id=$1 FOR UPDATE',[idInput.parse(id)])).rows[0];if(!row)throw new ApiError(404,'NOT_FOUND','Organization not found.');return row;}
function configuration(snapshot:EntitlementSnapshot){return {plan:snapshot.plan,features:snapshot.features,limits:snapshot.limits,contract:snapshot.contract};}
const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function base(client:PoolClient,orgId:string){
 const snapshot=await resolveEntitlements(client,orgId);
 const subscription=(await client.query('SELECT status,plan,expires_at FROM subscriptions WHERE organization_id=$1',[orgId])).rows[0];
 const version=(await client.query('SELECT coalesce(max(version),0)::int AS version FROM enterprise_contracts WHERE organization_id=$1',[orgId])).rows[0].version as number;
 return {snapshot,version,fingerprint:fingerprint({configuration:configuration(snapshot),subscription})};
}
async function contractKind(user:AccountUser,input:ContractInput,client:PoolClient){
 const demo=await adminIsDemo(user.id);
 if(input.kind==='production'&&demo)throw new ApiError(403,'PRODUCTION_ADMIN_REQUIRED','A non-demo administrator must attest production contracts.');
 if(input.kind==='test'&&!adminDemoAllowed())throw new ApiError(403,'TEST_CONTRACT_FORBIDDEN','Test contracts require explicitly enabled local development mode and grant no production rights.');
 await client.query("SELECT set_config('borderless.contract_test_allowed',$1,true)",[input.kind==='test'&&adminDemoAllowed()?'on':'off']);
}
async function templateSource(client:PoolClient,input:ContractInput){
 const source=(input as ContractInput&{templateSource?:{id:string;version:number}}).templateSource;
 if(!source)return null;
 const parent=(await client.query('SELECT status FROM enterprise_contract_templates WHERE id=$1 FOR SHARE',[source.id])).rows[0];
 const row=parent?(await client.query('SELECT payload FROM enterprise_contract_template_versions WHERE template_id=$1 AND version=$2',[source.id,source.version])).rows[0]:null;
 if(!row||parent.status!=='Active')throw new ApiError(409,'TEMPLATE_UNAVAILABLE','The selected template version is no longer available for a new contract approval.');
 return source;
}
export const adminService={
 async overview(user:AccountUser){return platform(user,async client=>{
  const counts=(await client.query("SELECT (SELECT count(*)::int FROM account_public) AS users,(SELECT count(*)::int FROM organizations) AS organizations,(SELECT count(*)::int FROM projects) AS projects,(SELECT count(*)::int FROM enterprise_requests) AS inquiries,(SELECT count(*)::int FROM subscriptions WHERE status='Active' AND (expires_at IS NULL OR expires_at>now())) AS active_subscriptions")).rows[0];
  const users=(await client.query('SELECT id,name,email,created_at FROM account_public ORDER BY created_at DESC,id LIMIT 100')).rows.map(row=>({id:row.id,name:row.name,email:row.email,createdAt:iso(row.created_at),isAdmin:String(row.email).toLowerCase().endsWith('@'+ADMIN_EMAIL_DOMAIN)}));
  const rows=(await client.query(`SELECT o.id,o.name,o.status,o.plan,s.status AS subscription_status,s.expires_at,(SELECT jsonb_build_object('id',l.id,'mimeType',l.mime_type,'bytes',l.bytes,'width',l.width,'height',l.height,'uploadedAt',l.uploaded_at) FROM organization_logos l WHERE l.organization_id=o.id) AS logo FROM organizations o LEFT JOIN subscriptions s ON s.organization_id=o.id ORDER BY o.created_at DESC,o.id LIMIT 100`)).rows;
  const organizations=[];
  for(const row of rows){const head=(await client.query('SELECT * FROM enterprise_contracts WHERE organization_id=$1 ORDER BY version DESC LIMIT 1',[row.id])).rows[0];organizations.push({id:row.id,name:row.name,logo:row.logo??null,status:row.status,plan:row.plan,subscriptionStatus:row.subscription_status??'Unavailable',expiresAt:row.expires_at?iso(row.expires_at):null,currentContract:head?contractMetadata(head):null});}
  const safeKeys=new Set(['organizationId','userId','source','status','from','to','plan','inquiryId','contractId','proposalId','version','kind','subscriptionActivated','contractExecuted']);
  const recentActivity=(await client.query('SELECT a.id,a.actor_id,u.name,a.action,a.detail,a.created_at FROM audit_logs a LEFT JOIN account_public u ON u.id=a.actor_id WHERE a.project_id IS NULL ORDER BY a.created_at DESC,a.id LIMIT 100')).rows.map(row=>({id:row.id,actorId:row.actor_id,actorName:row.name??null,action:row.action,detail:Object.fromEntries(Object.entries(row.detail??{}).filter(([key])=>safeKeys.has(key))),createdAt:iso(row.created_at)}));
  await audit(client,user.id,null,'admin.overview_viewed',{});
  return {stats:{users:counts.users,organizations:counts.organizations,projects:counts.projects,enterpriseInquiries:counts.inquiries,activeSubscriptions:counts.active_subscriptions},users,organizations,recentActivity};
 });},
 async grantEnterprise(user:AccountUser,_orgId:string,_input:unknown):Promise<never>{await enabled(user);throw new ApiError(409,'CONTRACT_BUILDER_REQUIRED','Preview and approve a versioned Enterprise contract. Direct Enterprise grants are disabled.');},
 async updateOrganization(user:AccountUser,orgId:string,input:{action:'suspend'|'resume';reason:string}){
  const value=z.object({action:z.enum(['suspend','resume']),reason:reasonInput}).strict().parse(input);
  return platform(user,async client=>{
   const org=await organization(client,orgId);
   if(value.action==='resume'){
    const sub=(await client.query('SELECT status,plan,expires_at FROM subscriptions WHERE organization_id=$1 FOR UPDATE',[orgId])).rows[0];
    if(!sub||sub.status!=='Active'||sub.plan!==org.plan||(org.plan!=='Free'&&!sub.expires_at)||(sub.expires_at&&new Date(sub.expires_at).getTime()<=Date.now()))throw new ApiError(409,'ENTITLEMENT_INVALID','A valid existing entitlement is required; resuming does not verify payment or create a contract.');
    if(org.plan==='Enterprise'){
     const head=(await client.query('SELECT * FROM enterprise_contracts WHERE organization_id=$1 ORDER BY version DESC LIMIT 1',[orgId])).rows[0];
     if(!head||head.status!=='Approved'||new Date(head.starts_at).getTime()>Date.now()||new Date(head.ends_at).getTime()<=Date.now()||(head.kind==='test'&&!adminDemoAllowed()))throw new ApiError(409,'ENTITLEMENT_INVALID','An effective latest approved Enterprise contract is required.');
    }
   }
   await client.query('UPDATE organizations SET status=$1 WHERE id=$2',[value.action==='resume'?'Active':'Draft',orgId]);
   await audit(client,user.id,orgId,'admin.organization_'+value.action,{reason:value.reason,previousStatus:org.status});return {ok:true as const};
  });
 },
 async revokeUserSessions(user:AccountUser,userId:string,input:{reason:string}){
  const value=z.object({reason:reasonInput}).strict().parse(input);idInput.parse(userId);await enabled(user);
  await platform(user,async client=>{if(!(await client.query('SELECT id FROM account_public WHERE id=$1',[userId])).rowCount)throw new ApiError(404,'NOT_FOUND','User not found.');await audit(client,user.id,null,'admin.user_sessions_revoke_requested',{userId,reason:value.reason});});
  const result=await revokeAdminManagedUserSessions(user,userId);
  await platform(user,client=>audit(client,user.id,null,'admin.user_sessions_revoked',{userId,reason:value.reason,revokedSessions:result.revokedSessions}));return {ok:true as const};
 },
 async contractHistory(user:AccountUser,orgId:string){
  return platform(user,async client=>{
   await organization(client,orgId);
   const rows=(await client.query('SELECT * FROM enterprise_contracts WHERE organization_id=$1 ORDER BY version DESC LIMIT 200',[orgId])).rows;
   await audit(client,user.id,orgId,'enterprise.contract_history_viewed',{});
   return {contracts:rows.map(row=>({...contractMetadata(row),features:row.features,limits:row.limits,notes:row.notes,templateSource:row.template_id?{id:row.template_id,version:row.template_version}:null,approvedBy:row.approved_by,approvedAt:iso(row.approved_at)}))};
  });
 },
 async previewContract(user:AccountUser,orgId:string,input:ContractInput){
  const value=ContractInputSchema.parse(input);
  return platform(user,async client=>{
   await organization(client,orgId);await contractKind(user,value,client);await templateSource(client,value);
   if(Date.parse(value.endsAt)<=Date.now())throw new ApiError(400,'CONTRACT_EXPIRED','The proposed contract end must be in the future.');
   const current=await base(client,orgId),before=configuration(current.snapshot);
   const after={plan:'Enterprise',features:value.features,limits:value.limits,contract:{id:null,version:current.version+1,status:'Approved',kind:value.kind,startsAt:value.startsAt,endsAt:value.endsAt,contractReference:value.contractReference,templateSource:value.templateSource??null}};
   const changes:{field:string;before:unknown;after:unknown}[]=[];
   if(before.plan!=='Enterprise')changes.push({field:'plan',before:before.plan,after:'Enterprise'});
   for(const feature of FEATURE_IDS)if(before.features[feature]!==value.features[feature])changes.push({field:'features.'+feature,before:before.features[feature],after:value.features[feature]});
   for(const metric of ['members','projects','monthlyDeepReviews'] as const)if(before.limits[metric]!==value.limits[metric])changes.push({field:'limits.'+metric,before:before.limits[metric],after:value.limits[metric]});
   changes.push({field:'contract',before:before.contract,after:after.contract});
   const warnings:string[]=[];
   for(const metric of ['members','projects','monthlyDeepReviews'] as const)if(current.snapshot.usage[metric]>value.limits[metric])warnings.push('Current '+metric+' usage exceeds the proposed limit. Existing data will be retained; new additions or review reservations will be blocked.');
   if(value.kind==='test')warnings.push('Test contract: local development only. This does not establish a production commercial agreement.');
   if(Date.parse(value.startsAt)>Date.now())warnings.push('The contract starts in the future. Its features will remain unavailable until the start time.');
   const proposalId=randomUUID(),expiresAt=new Date(Date.now()+15*60000).toISOString();
   await client.query('INSERT INTO enterprise_contract_proposals(id,organization_id,base_version,payload,created_by,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,now())',[proposalId,orgId,current.version,{input:value,baseFingerprint:current.fingerprint},user.id,expiresAt]);
   await audit(client,user.id,orgId,'enterprise.contract_previewed',{proposalId,baseVersion:current.version,kind:value.kind,templateSource:(value as any).templateSource??null});
   return {proposalId,expiresAt,before,after,changes,warnings,currentUsage:current.snapshot.usage};
  });
 },
 async approveContract(user:AccountUser,orgId:string,proposalId:string,input:{attested:true;reason:string}){
  const value=z.object({attested:z.literal(true),reason:reasonInput}).strict().parse(input);idInput.parse(proposalId);
  return platform(user,async client=>{
   await organization(client,orgId);
   const proposal=(await client.query('SELECT * FROM enterprise_contract_proposals WHERE id=$1 AND organization_id=$2 FOR UPDATE',[proposalId,orgId])).rows[0];
   if(!proposal)throw new ApiError(404,'NOT_FOUND','Contract proposal not found for this organization.');
   if(proposal.approved_at)throw new ApiError(409,'PROPOSAL_USED','This proposal was already approved.');
   if(new Date(proposal.expires_at).getTime()<=Date.now())throw new ApiError(409,'PROPOSAL_EXPIRED','Preview the contract again before approval.');
   const contractInput=ContractInputSchema.parse(proposal.payload.input);await contractKind(user,contractInput,client);const source=await templateSource(client,contractInput);
   if(Date.parse(contractInput.endsAt)<=Date.now())throw new ApiError(409,'CONTRACT_EXPIRED','The proposed contract period has expired.');
   const current=await base(client,orgId);
   if(current.version!==proposal.base_version||current.fingerprint!==proposal.payload.baseFingerprint)throw new ApiError(409,'STALE_PROPOSAL','The current contract or entitlement changed. Create and review a fresh preview.');
   const id=randomUUID(),version=current.version+1;
   await client.query("INSERT INTO enterprise_contracts(id,organization_id,version,status,kind,starts_at,ends_at,contract_reference,notes,features,limits,created_by,approved_by,approved_at,created_at,updated_at,template_id,template_version) VALUES($1,$2,$3,'Approved',$4,$5,$6,$7,$8,$9,$10,$11,$11,now(),now(),now(),$12,$13)",[id,orgId,version,contractInput.kind,contractInput.startsAt,contractInput.endsAt,contractInput.contractReference,contractInput.notes,contractInput.features,contractInput.limits,user.id,source?.id??null,source?.version??null]);
   await client.query('UPDATE enterprise_contract_proposals SET approved_at=now() WHERE id=$1',[proposalId]);
   await client.query("INSERT INTO subscriptions(id,organization_id,plan,status,provider,provider_ref,expires_at,updated_at) VALUES($1,$2,'Enterprise','Active','manual_contract',$3,$4,now()) ON CONFLICT(organization_id) DO UPDATE SET plan='Enterprise',status='Active',provider='manual_contract',provider_ref=excluded.provider_ref,expires_at=excluded.expires_at,updated_at=now()",[randomUUID(),orgId,contractInput.contractReference,contractInput.endsAt]);
   await client.query("UPDATE organizations SET plan='Enterprise',status='Active' WHERE id=$1",[orgId]);
   await audit(client,user.id,orgId,'enterprise.contract_approved',{proposalId,contractId:id,version,kind:contractInput.kind,attested:value.attested,reason:value.reason,contractReference:contractInput.contractReference,paymentVerified:false,approvalSource:'human_operator_attestation',templateSource:source});
   const row=(await client.query('SELECT * FROM enterprise_contracts WHERE id=$1',[id])).rows[0];return {ok:true as const,contract:{...contractMetadata(row),features:row.features,limits:row.limits}};
  });
 },
 async mutateContract(user:AccountUser,orgId:string,contractId:string,input:{action:'suspend'|'revoke';reason:string}){
  const value=z.object({action:z.enum(['suspend','revoke']),reason:reasonInput}).strict().parse(input);idInput.parse(contractId);
  return platform(user,async client=>{
   await organization(client,orgId);const head=(await client.query('SELECT * FROM enterprise_contracts WHERE organization_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE',[orgId])).rows[0];
   if(!head||head.id!==contractId)throw new ApiError(409,'CONTRACT_NOT_CURRENT','Only the latest contract for this organization can be suspended or revoked.');
   if(head.status==='Revoked')throw new ApiError(409,'CONTRACT_REVOKED','A revoked contract cannot be resumed. Approve a new version if appropriate.');
   await client.query('UPDATE enterprise_contracts SET status=$1,updated_at=now() WHERE id=$2',[value.action==='suspend'?'Suspended':'Revoked',contractId]);
   await client.query('UPDATE subscriptions SET status=$1,updated_at=now() WHERE organization_id=$2',[value.action==='suspend'?'Pending':'Canceled',orgId]);
   await client.query("UPDATE organizations SET status='Draft' WHERE id=$1",[orgId]);
   await audit(client,user.id,orgId,'enterprise.contract_'+value.action,{contractId,version:head.version,reason:value.reason,dataDeleted:false});return {ok:true as const};
  });
 }
};
