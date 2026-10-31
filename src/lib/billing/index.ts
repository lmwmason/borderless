import {createHash} from 'node:crypto';
import {z} from 'zod';
import {enqueueNotification} from '../notifications';
import type {AccountUser,Plan} from '../organization-contracts';
import {getPool} from '../db';
import {ApiError} from '../http';
import {audit,organizationAccess,transaction,uuid,type QueryClient} from '../organizations';

export const TERMS_VERSION='borderless-mvp-v1';
export const TERMS_TEXT='Borderless MVP provides scoped regulatory preparation and collaborative workflow support, not legal advice or compliance certification. Human professional review is required before reliance or external actions. Quick Assessment uses curated rules. Sending company facts for NVIDIA Deep Review requires separate explicit consent. Do not enter sensitive personal data or secrets. Free pilot access does not create a paid subscription or an enterprise contract. Paid service and enterprise agreements require separate verified arrangements.';
export const TERMS_HASH=createHash('sha256').update(TERMS_TEXT).digest('hex');
const PlanSchema=z.enum(['Free','Startup','Business','Enterprise']);
const configurationMessage='Groble checkout and webhook authenticity are not verified or configured. No charges or paid activation are available. Enterprise agreements require separate human approval.';

async function snapshot(client:QueryClient,userId:string,orgId:string){
 const org=await organizationAccess(client,userId,orgId);
 if(org.status!=='Active'&&!['Owner','Admin'].includes(org.role))throw new ApiError(403,'ORGANIZATION_INACTIVE','Organization activation is required.');
 const subscription=(await client.query('SELECT status,expires_at FROM subscriptions WHERE organization_id=$1',[orgId])).rows[0];
 const acceptance=(await client.query('SELECT id FROM contract_acceptances WHERE organization_id=$1 AND terms_version=$2 AND terms_hash=$3 LIMIT 1',[orgId,TERMS_VERSION,TERMS_HASH])).rows[0];
 const enterprise=(await client.query('SELECT id,status,created_at,notes,company_snapshot FROM enterprise_requests WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 1',[orgId])).rows[0];
 return {plan:org.plan as Plan,organizationStatus:org.status,subscription:{status:subscription?.status??'Pending',expiresAt:subscription?.expires_at?new Date(subscription.expires_at).toISOString():null},termsVersion:TERMS_VERSION,termsText:TERMS_TEXT,accepted:Boolean(acceptance),checkoutAvailable:false,configurationMessage,enterpriseRequest:enterprise?{id:enterprise.id,status:enterprise.status,notes:enterprise.notes,companyInfo:enterprise.company_snapshot,createdAt:new Date(enterprise.created_at).toISOString()}:null};
}

export const billingService={
 async get(user:AccountUser,orgId:string){return snapshot(getPool(),user.id,orgId);},
 async selectPlan(user:AccountUser,orgId:string,input:Plan){
  const plan=PlanSchema.parse(input);
  return transaction(async client=>{
   const org=await organizationAccess(client,user.id,orgId,{admin:true,lock:true});
   const existing=(await client.query('SELECT status FROM subscriptions WHERE organization_id=$1',[orgId])).rows[0];
   if(org.plan!==plan||!['Pending','Active'].includes(existing?.status)){
    // A plan request never manufactures a verified paid entitlement.
    await client.query("UPDATE organizations SET plan=$1,status='Draft' WHERE id=$2",[plan,orgId]);
    await client.query("UPDATE subscriptions SET plan=$1,status='Pending',provider=NULL,provider_ref=NULL,expires_at=NULL,updated_at=now() WHERE organization_id=$2",[plan,orgId]);
    await audit(client,user.id,orgId,'billing.plan_requested',{plan});
   }
   return snapshot(client,user.id,orgId);
  });
 },
 async acceptTerms(user:AccountUser,orgId:string,input:{termsVersion:string;accepted:true}){
  z.object({termsVersion:z.literal(TERMS_VERSION),accepted:z.literal(true)}).strict().parse(input);
  return transaction(async client=>{
   await organizationAccess(client,user.id,orgId,{admin:true,lock:true});
   const existing=await client.query('SELECT id FROM contract_acceptances WHERE organization_id=$1 AND actor_id=$2 AND terms_version=$3 AND terms_hash=$4 LIMIT 1',[orgId,user.id,TERMS_VERSION,TERMS_HASH]);
   if(!existing.rows[0]){
    await client.query('INSERT INTO contract_acceptances(id,organization_id,actor_id,terms_version,terms_hash,accepted_at) VALUES($1,$2,$3,$4,$5,now())',[uuid(),orgId,user.id,TERMS_VERSION,TERMS_HASH]);
    await audit(client,user.id,orgId,'terms.accepted',{termsVersion:TERMS_VERSION,termsHash:TERMS_HASH});
   }
   return snapshot(client,user.id,orgId);
  });
 },
 async activateFree(user:AccountUser,orgId:string){
  return transaction(async client=>{
   const org=await organizationAccess(client,user.id,orgId,{admin:true,lock:true});
   if(org.plan!=='Free')throw new ApiError(409,'FREE_PLAN_REQUIRED','Only the Free pilot plan can be activated locally. Paid activation requires verified payment or human-approved enterprise provisioning.');
   const accepted=await client.query('SELECT id FROM contract_acceptances WHERE organization_id=$1 AND terms_version=$2 AND terms_hash=$3 LIMIT 1',[orgId,TERMS_VERSION,TERMS_HASH]);
   if(!accepted.rows[0])throw new ApiError(409,'TERMS_REQUIRED','Accept the current service terms before activation.');
   await client.query("UPDATE subscriptions SET plan='Free',status='Active',provider=NULL,provider_ref=NULL,expires_at=NULL,updated_at=now() WHERE organization_id=$1",[orgId]);
   await client.query("UPDATE organizations SET status='Active' WHERE id=$1",[orgId]);
   await audit(client,user.id,orgId,'billing.free_activated',{plan:'Free',termsVersion:TERMS_VERSION});
   return snapshot(client,user.id,orgId);
  });
 },
 async checkout(user:AccountUser,orgId:string):Promise<never>{
  await transaction(async client=>{
   await organizationAccess(client,user.id,orgId,{admin:true,lock:true});
   await audit(client,user.id,orgId,'billing.checkout_unavailable',{});
  });
  throw new ApiError(503,'CONFIG_REQUIRED',configurationMessage);
 },
 async cancel(user:AccountUser,orgId:string){
  return transaction(async client=>{
   await organizationAccess(client,user.id,orgId,{admin:true,lock:true});
   const subscription=(await client.query('SELECT status FROM subscriptions WHERE organization_id=$1 FOR UPDATE',[orgId])).rows[0];
   if(subscription?.status==='Active')throw new ApiError(409,'HUMAN_REVIEW_REQUIRED','Active subscription changes require human review. This action only cancels pending local requests.');
   await client.query("UPDATE subscriptions SET status='Canceled',updated_at=now() WHERE organization_id=$1",[orgId]);
   await client.query("UPDATE organizations SET status='Draft' WHERE id=$1",[orgId]);
   await audit(client,user.id,orgId,'billing.request_canceled',{});
   return snapshot(client,user.id,orgId);
  });
 },
 async requestEnterprise(user:AccountUser,orgId:string,input:{notes:string;idempotencyKey?:string}){
  const value=z.object({notes:z.string().trim().min(1).max(5000),idempotencyKey:z.string().uuid().optional()}).strict().parse(input);
  const notes=value.notes,fingerprint=createHash('sha256').update(notes).digest('hex');
  return transaction(async client=>{
   const organization=await organizationAccess(client,user.id,orgId,{admin:true,lock:true});
   if(organization.plan!=='Enterprise')throw new ApiError(409,'ENTERPRISE_PLAN_REQUIRED','Select Enterprise before submitting an introduction inquiry.');
   if(value.idempotencyKey){
    const prior=(await client.query('SELECT id,request_fingerprint FROM enterprise_requests WHERE organization_id=$1 AND request_key=$2',[orgId,value.idempotencyKey])).rows[0];
    if(prior){if(prior.request_fingerprint!==fingerprint)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','This request key was used for different inquiry content.');return snapshot(client,user.id,orgId);}
   }
   const pending=(await client.query("SELECT id,notes FROM enterprise_requests WHERE organization_id=$1 AND status in ('Pending','In Review') LIMIT 1",[orgId])).rows[0];
   if(pending){if(pending.notes===notes)return snapshot(client,user.id,orgId);throw new ApiError(409,'REQUEST_PENDING','An enterprise request is already pending.');}
   const id=uuid();
   await client.query("INSERT INTO enterprise_requests(id,organization_id,requested_by,status,notes,company_snapshot,request_key,request_fingerprint,created_at) VALUES($1,$2,$3,'Pending',$4,$5,$6,$7,now())",[id,orgId,user.id,notes,{organizationId:orgId,companyName:organization.name,requesterId:user.id,requesterName:user.name,requesterEmail:user.email,requestedPlan:'Enterprise'},value.idempotencyKey??null,fingerprint]);
   await enqueueNotification(client,{inquiryId:id,companyName:organization.name,inquiryType:'Enterprise introduction',createdAt:new Date().toISOString()});
   await audit(client,user.id,orgId,'billing.enterprise_requested',{requestId:id});
   return snapshot(client,user.id,orgId);
  });
 }
};
