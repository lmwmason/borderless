import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {ApiError} from '../http';
import {adminDemoAllowed} from '../admin/identity';
import {ContractInputSchema,EMPTY_FEATURES,PLAN_PRESETS,type FeatureId,type FeatureFlags,type FeatureLimits} from './registry';
export * from './registry';
export type EntitlementClient=Pick<PoolClient,'query'>;
export type ContractMetadata={id:string;version:number;status:'Approved'|'Suspended'|'Revoked';kind:'test'|'production';startsAt:string;endsAt:string;contractReference:string;templateSource?:{id:string;version:number}|null};
export type EntitlementUsage={members:number;projects:number;monthlyDeepReviews:number;period:string};
export type EntitlementSnapshot={plan:string;features:FeatureFlags;limits:FeatureLimits;usage:EntitlementUsage;contract:ContractMetadata|null;active:boolean};
const iso=(value:unknown)=>new Date(value as string|Date).toISOString();
export function contractMetadata(row:Record<string,any>):ContractMetadata{return {id:row.id,version:row.version,status:row.status,kind:row.kind,startsAt:iso(row.starts_at),endsAt:iso(row.ends_at),contractReference:row.contract_reference,templateSource:row.template_id?{id:row.template_id,version:row.template_version}:null};}
export async function resolveEntitlements(client:EntitlementClient,organizationId:string):Promise<EntitlementSnapshot>{
 const organization=(await client.query('SELECT o.id,o.plan,o.status,s.status AS subscription_status,s.plan AS subscription_plan,s.expires_at FROM organizations o LEFT JOIN subscriptions s ON s.organization_id=o.id WHERE o.id=$1',[organizationId])).rows[0];
 if(!organization)throw new ApiError(404,'NOT_FOUND','Organization not found.');
 await client.query("SELECT set_config('borderless.contract_test_allowed',$1,true)",[adminDemoAllowed()?'on':'off']);
 const period=new Date().toISOString().slice(0,7),now=Date.now();
 const counts=(await client.query("SELECT (SELECT count(*)::int FROM memberships WHERE organization_id=$1 AND role<>'Pending') AS members,(SELECT count(*)::int FROM projects WHERE organization_id=$1) AS projects,(SELECT coalesce(sum(amount),0)::int FROM entitlement_usage WHERE organization_id=$1 AND period=$2 AND metric='monthlyDeepReviews') AS monthly_deep_reviews",[organizationId,period])).rows[0];
 const usage:EntitlementUsage={members:counts.members,projects:counts.projects,monthlyDeepReviews:counts.monthly_deep_reviews,period};
 let features:FeatureFlags={...EMPTY_FEATURES},limits:FeatureLimits={members:0,projects:0,monthlyDeepReviews:0},contract:ContractMetadata|null=null;
 let active=organization.status==='Active'&&organization.subscription_status==='Active'&&organization.plan===organization.subscription_plan&&(organization.plan==='Free'||Boolean(organization.expires_at))&&(!organization.expires_at||new Date(organization.expires_at).getTime()>now);
 if(organization.plan==='Enterprise'){
  // The latest state is authoritative: suspension/revocation never falls back
  // to an older approval, and a legacy paid flag is not a contract.
  const row=(await client.query('SELECT * FROM enterprise_contracts WHERE organization_id=$1 ORDER BY version DESC,id DESC LIMIT 1',[organizationId])).rows[0];
  if(row){
   contract=contractMetadata(row);
   const parsed=ContractInputSchema.safeParse({kind:row.kind,startsAt:iso(row.starts_at),endsAt:iso(row.ends_at),contractReference:row.contract_reference,notes:row.notes,features:row.features,limits:row.limits});
   active=active&&row.status==='Approved'&&Boolean(row.approved_by&&row.approved_at)&&new Date(row.starts_at).getTime()<=now&&new Date(row.ends_at).getTime()>now&&(row.kind==='production'||adminDemoAllowed());
   if(parsed.success){limits=parsed.data.limits;if(active)features=parsed.data.features;}else active=false;
  }else active=false;
 }else{
  const preset=PLAN_PRESETS[organization.plan as keyof typeof PLAN_PRESETS];
  if(preset){limits={...preset.limits};if(active)features={...preset.features};}else active=false;
 }
 return {plan:organization.plan,features,limits,usage,contract,active};
}
export async function assertFeature(client:EntitlementClient,organizationId:string,feature:FeatureId){
 const snapshot=await resolveEntitlements(client,organizationId);
 if(!snapshot.active||!snapshot.features[feature])throw new ApiError(403,'FEATURE_DISABLED','This feature is not enabled by the current plan or approved contract.');
 return snapshot;
}
export async function assertCapacity(client:EntitlementClient,organizationId:string,metric:'members'|'projects',additional=1){
 if(!Number.isSafeInteger(additional)||additional<0)throw new ApiError(400,'VALIDATION','Capacity increments must be non-negative integers.');
 await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
 let snapshot=await resolveEntitlements(client,organizationId);
 if(!snapshot.active&&metric==='members'){
  const onboarding=(await client.query("SELECT 1 FROM organizations o JOIN subscriptions s ON s.organization_id=o.id WHERE o.id=$1 AND o.status='Draft' AND s.status='Pending' AND NOT EXISTS(SELECT 1 FROM enterprise_contracts c WHERE c.organization_id=o.id)",[organizationId])).rowCount===1;
  if(onboarding){
   snapshot={...snapshot,limits:{...snapshot.limits,members:PLAN_PRESETS.Free.limits.members}};
   if(snapshot.usage.members+additional>snapshot.limits.members)throw new ApiError(409,'QUOTA_EXCEEDED','Initial organization onboarding is limited to the Free member allowance. Workspace access remains inactive.');
   return snapshot;
  }
 }
 if(!snapshot.active)throw new ApiError(403,'ENTITLEMENT_INACTIVE','The current organization entitlement is inactive. Existing data is retained.');
 if(snapshot.usage[metric]+additional>snapshot.limits[metric])throw new ApiError(409,'QUOTA_EXCEEDED','The '+metric+' limit has been reached. Existing records are retained; new additions require sufficient capacity.');
 return snapshot;
}
export async function reserveDeepReview(client:EntitlementClient,organizationId:string,jobId:string){
 if(!jobId||jobId.length>160)throw new ApiError(400,'VALIDATION','A review job identifier is required.');
 await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
 const snapshot=await assertFeature(client,organizationId,'deep_legal_review');
 const existing=await client.query("SELECT id FROM entitlement_usage WHERE organization_id=$1 AND metric='monthlyDeepReviews' AND subject_id=$2",[organizationId,jobId]);
 if(existing.rowCount)return snapshot;
 if(snapshot.usage.monthlyDeepReviews>=snapshot.limits.monthlyDeepReviews)throw new ApiError(409,'QUOTA_EXCEEDED','The monthly Deep Review limit has been reached. Existing results are retained.');
 await client.query("INSERT INTO entitlement_usage(id,organization_id,period,metric,subject_id,amount,created_at) VALUES($1,$2,$3,'monthlyDeepReviews',$4,1,now())",[randomUUID(),organizationId,snapshot.usage.period,jobId]);
 return {...snapshot,usage:{...snapshot.usage,monthlyDeepReviews:snapshot.usage.monthlyDeepReviews+1}};
}
