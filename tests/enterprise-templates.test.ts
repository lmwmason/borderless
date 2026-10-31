import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {registerAdmin,ownerProject,scopedRequest} from './helpers';
import {templateService} from '../src/lib/admin/templates';
import {adminService} from '../src/lib/admin/service';
import {withPlatformActor} from '../src/lib/billing/inquiries';
import {PLAN_PRESETS,ContractInputSchema} from '../src/lib/entitlements';
import {GET as templateList} from '../src/app/api/admin/subscription-templates/route';
const code=(expected:string)=>(error:any)=>error?.code===expected;
const templateInput=()=>({name:'Synthetic template '+randomUUID(),description:'Explicit example configuration, never a commercial contract.',features:{...PLAN_PRESETS.Business.features},limits:{members:25,projects:15,monthlyDeepReviews:50},defaultDurationDays:365,notes:'Synthetic internal template notes.'});
async function proposed(admin:any,organizationId:string,template:any,overrides:any={}){
 return adminService.previewContract(admin.user,organizationId,{kind:'production',startsAt:new Date(Date.now()-86400000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),contractReference:'SYNTHETIC-TEMPLATE-'+randomUUID(),notes:'Isolated test approval; not an actual commercial agreement.',features:{...template.features},limits:{...template.limits},templateSource:{id:template.id,version:template.version},...overrides});
}

test('admin-only templates seed examples without subscriptions and support immutable versions, search, clone and archival',async()=>{
 const admin=await registerAdmin('template-admin'),owner=await ownerProject('template-nonadmin');
 const before=await withPlatformActor(admin.user,async client=>(await client.query('SELECT count(*)::int AS count FROM enterprise_contracts')).rows[0].count);
 const initial=await templateService.list(admin.user,{});for(const name of ['Enterprise Standard','Legal Operations','Enterprise Plus'])assert.ok(initial.templates.some(item=>item.name===name));
 const after=await withPlatformActor(admin.user,async client=>(await client.query('SELECT count(*)::int AS count FROM enterprise_contracts')).rows[0].count);assert.equal(before,after,'example templates never assign contracts');
 assert.equal((await templateList(scopedRequest('/api/admin/subscription-templates','GET',owner.cookie,owner.project.id))).status,401);
 await assert.rejects(templateService.create(owner.user,templateInput()),(error:any)=>error.status===403);
 const input=templateInput(),created=await templateService.create(admin.user,input);assert.equal(created.version,1);assert.equal(created.status,'Active');
 const updated=await templateService.update(admin.user,created.id,{...input,name:input.name+' revised',expectedVersion:1,limits:{...input.limits,monthlyDeepReviews:75}});assert.equal(updated.version,2);
 await assert.rejects(templateService.update(admin.user,created.id,{...input,expectedVersion:1}),(error:any)=>error.status===409);
 const detail=await templateService.get(admin.user,created.id);assert.equal(detail.versions.length,2);assert.equal(detail.versions.find(v=>v.version===1)?.payload.limits.monthlyDeepReviews,50);
 const found=await templateService.list(admin.user,{q:input.name});assert.ok(found.templates.some(item=>item.id===created.id));
 const cloned=await templateService.clone(admin.user,created.id,{name:input.name+' copied'});assert.notEqual(cloned.id,created.id);assert.equal(cloned.version,1);assert.equal(cloned.limits.monthlyDeepReviews,75);
 await templateService.setStatus(admin.user,cloned.id,{status:'Inactive',reason:'Synthetic template pause'});await templateService.setStatus(admin.user,cloned.id,{status:'Archived',reason:'Synthetic archive preserves history'});
 assert.equal((await templateService.get(admin.user,cloned.id)).template.status,'Archived');
 const bad={...templateInput(),features:{...input.features,expert_marketplace:false}};await assert.rejects(templateService.create(admin.user,bad));
 await withPlatformActor(admin.user,async client=>{
  await assert.rejects(client.query('UPDATE enterprise_contract_template_versions SET payload=payload WHERE template_id=$1',[created.id]),(error:any)=>error.code==='42501');
 });
});

test('template application is a copied contract draft; later versions require explicit reapplication and approval',async()=>{
 const admin=await registerAdmin('template-apply-admin'),owner=await ownerProject('template-company');
 const input=templateInput(),firstTemplate=await templateService.create(admin.user,input);
 const customized={...firstTemplate.features,deep_legal_review:false};
 const preview=await proposed(admin,owner.organization.id,firstTemplate,{features:customized,limits:{...firstTemplate.limits,monthlyDeepReviews:3}});
 const approved=await adminService.approveContract(admin.user,owner.organization.id,preview.proposalId,{attested:true,reason:'Synthetic explicit initial approval'});
 assert.equal(approved.contract.features.deep_legal_review,false);assert.equal(approved.contract.limits.monthlyDeepReviews,3);
 const secondTemplate=await templateService.update(admin.user,firstTemplate.id,{...input,features:{...input.features,priority_support:false},limits:{...input.limits,monthlyDeepReviews:80},expectedVersion:1});
 let history=await adminService.contractHistory(admin.user,owner.organization.id);assert.equal(history.contracts.length,1);assert.equal(history.contracts[0].features.deep_legal_review,false);assert.equal(history.contracts[0].limits.monthlyDeepReviews,3);assert.equal(history.contracts[0].templateSource?.version,1);
 const applications=(await templateService.get(admin.user,firstTemplate.id)).applications;assert.ok(applications.some(item=>item.contractId===approved.contract.id&&item.templateVersion===1));
 const reapplied=await proposed(admin,owner.organization.id,secondTemplate,{limits:{...secondTemplate.limits,monthlyDeepReviews:7}});
 history=await adminService.contractHistory(admin.user,owner.organization.id);assert.equal(history.contracts.length,1,'new template preview is not activation');
 await adminService.approveContract(admin.user,owner.organization.id,reapplied.proposalId,{attested:true,reason:'Synthetic explicit version two reapplication'});
 history=await adminService.contractHistory(admin.user,owner.organization.id);assert.equal(history.contracts.length,2);assert.equal(history.contracts[0].templateSource?.version,2);assert.equal(history.contracts[0].limits.monthlyDeepReviews,7);assert.equal(history.contracts[1].limits.monthlyDeepReviews,3);
 const pending=await proposed(admin,owner.organization.id,secondTemplate);
 await templateService.setStatus(admin.user,firstTemplate.id,{status:'Archived',reason:'Synthetic archive blocks new application'});
 await assert.rejects(proposed(admin,owner.organization.id,secondTemplate),code('TEMPLATE_UNAVAILABLE'));
 await assert.rejects(adminService.approveContract(admin.user,owner.organization.id,pending.proposalId,{attested:true,reason:'Cannot approve archived source'}),code('TEMPLATE_UNAVAILABLE'));
 assert.equal((await adminService.contractHistory(admin.user,owner.organization.id)).contracts.length,2);
 const detail=await templateService.get(admin.user,firstTemplate.id);assert.equal(detail.versions.length,2);assert.equal(detail.applications.length,2,'archival preserves existing contract references');
 await withPlatformActor(admin.user,async client=>{
  const audit=(await client.query("SELECT action FROM audit_logs WHERE action LIKE 'enterprise.template_%' AND actor_id=$1",[admin.user.id])).rows;assert.ok(audit.length>=3);
 });
});
