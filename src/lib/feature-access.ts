import {transaction,requireProject,authorizeProject} from './organizations';
import {assertFeature} from './entitlements';
import type {FeatureId} from './entitlements/registry';
import type {ProjectScope} from './workspace/postgres';
import {engagementService} from './engagements';
import type {AccountUser} from './organization-contracts';

export async function assertProjectFeature(scope:ProjectScope,feature:FeatureId){
 return transaction(async client=>{
  const actual=await authorizeProject(scope.user.id,scope.projectId,false,client);
  if(actual.organizationId!==scope.organizationId)throw new Error('Project scope mismatch');
  await client.query("SELECT set_config('borderless.organization_id',$1,true),set_config('borderless.user_id',$2,true)",[scope.organizationId,scope.user.id]);
  await assertFeature(client,scope.organizationId,feature);
 });
}
export async function requireProjectFeature(request:Request,feature:FeatureId,write=false){
 const scope=await requireProject(request,write);await assertProjectFeature(scope,feature);return scope;
}
export async function requireEngagementFeature(user:AccountUser,id:string){
 // Resolve party/grant authorization before looking up any organization flags.
 const engagement=await engagementService.get(user,id);
 await transaction(async client=>{
  await client.query("SELECT set_config('borderless.organization_id',$1,true),set_config('borderless.user_id',$2,true)",[engagement.organizationId,user.id]);
  await client.query("SELECT set_config('borderless.entitlement_read_org',$1,true),set_config('borderless.entitlement_read_engagement',$2,true)",[engagement.organizationId,engagement.id]);
  await assertFeature(client,engagement.organizationId,'expert_collaboration');
 });
 return engagement;
}
