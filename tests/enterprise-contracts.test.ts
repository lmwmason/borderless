import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {ownerProject,register,registerAdmin,scopedRequest} from './helpers';
import {adminService} from '../src/lib/admin/service';
import {withPlatformActor} from '../src/lib/billing/inquiries';
import {billingService} from '../src/lib/billing';
import {organizationService} from '../src/lib/organizations';
import {getPool} from '../src/lib/db';
import {createProjectRepository} from '../src/lib/workspace/postgres';
import {ContractInputSchema,FEATURE_IDS,PLAN_PRESETS,EMPTY_FEATURES,resolveEntitlements,reserveDeepReview,type ContractInput} from '../src/lib/entitlements';
import {POST as startDeep} from '../src/app/api/reviews/route';
import {POST as scenario} from '../src/app/api/scenarios/route';
import {GET as marketplace} from '../src/app/api/experts/route';
import {GET as costs} from '../src/app/api/cost-review/route';
import {GET as auditExport} from '../src/app/api/audit-export/route';
import {POST as support} from '../src/app/api/support/route';
import {GET as orgEntitlements} from '../src/app/api/organizations/[id]/entitlements/route';
const hasCode=(code:string)=>(error:any)=>error?.code===code;
export const contractInput=(overrides:Partial<ContractInput>={}):ContractInput=>({kind:'production',startsAt:new Date(Date.now()-86400000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),contractReference:'SYNTHETIC-QA-'+randomUUID(),notes:'Isolated synthetic contract fixture; no commercial agreement or payment.',features:{...PLAN_PRESETS.Business.features},limits:{members:10,projects:10,monthlyDeepReviews:10},...overrides});
async function approve(admin:Awaited<ReturnType<typeof registerAdmin>>,orgId:string,input:ContractInput){const preview=await adminService.previewContract(admin.user,orgId,input);return adminService.approveContract(admin.user,orgId,preview.proposalId,{attested:true,reason:'Synthetic isolated test approval only'});}
async function snapshot(userId:string,orgId:string){const client=await getPool().connect();try{await client.query('BEGIN');await client.query("SELECT set_config('borderless.user_id',$1,true),set_config('borderless.organization_id',$2,true)",[userId,orgId]);const value=await resolveEntitlements(client,orgId);await client.query('ROLLBACK');return value;}finally{client.release();}}
const facts=()=>({id:randomUUID(),name:'Synthetic contract company',homeCountry:'KR' as const,industry:'b2b_saas' as const,targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote' as const,customerType:'b2b' as const,annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()});

test('central feature registry validates dependencies and retains existing plan presets',()=>{
 assert.deepEqual(FEATURE_IDS,['deep_legal_review','scenario_comparison','expert_collaboration','expert_marketplace','cost_review','audit_log_export','priority_support']);
 assert.equal(PLAN_PRESETS.Free.features.deep_legal_review,true);assert.equal(PLAN_PRESETS.Free.features.expert_marketplace,true);assert.equal(PLAN_PRESETS.Free.features.audit_log_export,false);
 assert.equal(PLAN_PRESETS.Startup.features.audit_log_export,true);assert.equal(PLAN_PRESETS.Business.features.priority_support,true);
 assert.throws(()=>ContractInputSchema.parse(contractInput({features:{...EMPTY_FEATURES,expert_collaboration:true}})));
 assert.throws(()=>ContractInputSchema.parse(contractInput({features:{...EMPTY_FEATURES,cost_review:true}})));
 assert.throws(()=>ContractInputSchema.parse({...contractInput(),features:{...EMPTY_FEATURES,invented_flag:true}}));
});

test('contract preview and explicit approval isolate organizations and gate direct API calls for every feature',async()=>{
 const admin=await registerAdmin('contract-admin'),owner=await ownerProject('contract-owner'),outside=await ownerProject('contract-outside');
 const input=contractInput({features:{...EMPTY_FEATURES}}),preview=await adminService.previewContract(admin.user,owner.organization.id,input);
 assert.equal((await snapshot(owner.user.id,owner.organization.id)).plan,'Free','preview alone never assigns Enterprise');
 await assert.rejects(adminService.grantEnterprise(admin.user,owner.organization.id,{}),hasCode('CONTRACT_BUILDER_REQUIRED'));
 await assert.rejects(adminService.approveContract(admin.user,outside.organization.id,preview.proposalId,{attested:true,reason:'Wrong organization'}),hasCode('NOT_FOUND'));
 await assert.rejects(adminService.approveContract(admin.user,owner.organization.id,preview.proposalId,{attested:false,reason:'Unconfirmed'} as any));
 await adminService.approveContract(admin.user,owner.organization.id,preview.proposalId,{attested:true,reason:'Synthetic approval without any external payment'});
 await assert.rejects(adminService.approveContract(admin.user,owner.organization.id,preview.proposalId,{attested:true,reason:'Duplicate approval'}),hasCode('PROPOSAL_USED'));
 const current=await snapshot(owner.user.id,owner.organization.id);assert.equal(current.plan,'Enterprise');assert.equal(current.active,true);assert.deepEqual(current.features,EMPTY_FEATURES);
 await assert.rejects(billingService.selectPlan(owner.user,owner.organization.id,'Free'),hasCode('HUMAN_REVIEW_REQUIRED'));
 assert.equal((await snapshot(outside.user.id,outside.organization.id)).plan,'Free');
 for(const [path,method,body,route] of [
  ['/api/reviews','POST',{scenarioId:'synthetic',consent:true},startDeep],
  ['/api/scenarios','POST',{},scenario],
  ['/api/experts','GET',undefined,marketplace],
  ['/api/cost-review','GET',undefined,costs],
  ['/api/audit-export','GET',undefined,auditExport],
  ['/api/support','POST',{message:'Synthetic support request'},support]
 ] as const){const response=await route(scopedRequest(path,method,owner.cookie,owner.project.id,body));assert.equal(response.status,403,path);assert.equal((await response.json()).error.code,'FEATURE_DISABLED',path);}
 const denied=await orgEntitlements(scopedRequest('/api/organizations/'+owner.organization.id+'/entitlements','GET',outside.cookie,outside.project.id),{params:Promise.resolve({id:owner.organization.id})});assert.equal(denied.status,403);
 await assert.rejects(adminService.previewContract(outside.user,owner.organization.id,input),hasCode('ADMIN_REQUIRED'));
 await approve(admin,owner.organization.id,contractInput());
 assert.equal((await marketplace(scopedRequest('/api/experts','GET',owner.cookie,owner.project.id))).status,200);
 assert.equal((await costs(scopedRequest('/api/cost-review','GET',owner.cookie,owner.project.id))).status,200);
 assert.equal((await auditExport(scopedRequest('/api/audit-export','GET',owner.cookie,owner.project.id))).status,200);
 assert.equal((await support(scopedRequest('/api/support','POST',owner.cookie,owner.project.id,{message:'Synthetic recorded request; do not send externally.'}))).status,200);
});

test('monthly Deep Review reservation is atomic across projects, idempotent and keeps prior data after lower limits',async()=>{
 const admin=await registerAdmin('quota-admin'),owner=await ownerProject('quota-owner');
 await approve(admin,owner.organization.id,contractInput({limits:{members:10,projects:10,monthlyDeepReviews:1}}));
 const projects=[owner.project];for(let i=0;i<3;i++)projects.push(await organizationService.createProject(owner.user,owner.organization.id,{name:'Concurrent scoped review '+i}));
 const attempts=await Promise.all(projects.map(async project=>{
  const repository=createProjectRepository({user:owner.user,organizationId:owner.organization.id,projectId:project.id,role:'Owner'});await repository.saveCompany(facts());const selected=(await repository.getWorkspace()).scenarios[0];
  const now=new Date().toISOString(),job={id:randomUUID(),scenarioId:selected.id,status:'queued' as const,assessmentId:null,result:null,completedTopics:[],currentTopic:null,createdAt:now,updatedAt:now,error:null};
  try{await repository.createReviewJob(job,selected.company);return {ok:true,jobId:job.id,projectId:project.id};}catch(error){assert.equal((error as any).code,'QUOTA_EXCEEDED');return {ok:false,jobId:job.id,projectId:project.id};}
 }));
 assert.equal(attempts.filter(item=>item.ok).length,1);const winning=attempts.find(item=>item.ok)!;
 assert.equal((await snapshot(owner.user.id,owner.organization.id)).usage.monthlyDeepReviews,1);
 const client=await getPool().connect();try{await client.query('BEGIN');await client.query("SELECT set_config('borderless.user_id',$1,true),set_config('borderless.organization_id',$2,true)",[owner.user.id,owner.organization.id]);await reserveDeepReview(client,owner.organization.id,winning.jobId);await client.query('COMMIT');}finally{client.release();}
 assert.equal((await snapshot(owner.user.id,owner.organization.id)).usage.monthlyDeepReviews,1);
 const lowered=contractInput({limits:{members:0,projects:0,monthlyDeepReviews:0}}),preview=await adminService.previewContract(admin.user,owner.organization.id,lowered);assert.ok(preview.warnings.length>=3);
 await adminService.approveContract(admin.user,owner.organization.id,preview.proposalId,{attested:true,reason:'Synthetic lower limits preserve all existing data'});
 await assert.rejects(organizationService.createProject(owner.user,owner.organization.id,{name:'Beyond reduced limit'}),hasCode('QUOTA_EXCEEDED'));
 const saved=await createProjectRepository({user:owner.user,organizationId:owner.organization.id,projectId:winning.projectId,role:'Owner'}).getWorkspace();assert.ok(saved.company);assert.ok(saved.reviewJobs?.some(item=>item.id===winning.jobId));
});

test('contract stale approval, suspension, revocation and expiry immediately restrict features without deleting data',async()=>{
 const admin=await registerAdmin('lifecycle-admin'),owner=await ownerProject('lifecycle-owner'),input=contractInput();
 const first=await approve(admin,owner.organization.id,input);const a=await adminService.previewContract(admin.user,owner.organization.id,input),b=await adminService.previewContract(admin.user,owner.organization.id,input);
 await adminService.approveContract(admin.user,owner.organization.id,a.proposalId,{attested:true,reason:'Synthetic new revision'});
 await assert.rejects(adminService.approveContract(admin.user,owner.organization.id,b.proposalId,{attested:true,reason:'Stale revision'}),hasCode('STALE_PROPOSAL'));
 await assert.rejects(adminService.mutateContract(admin.user,owner.organization.id,first.contract.id,{action:'revoke',reason:'Old version'}),hasCode('CONTRACT_NOT_CURRENT'));
 let current=(await snapshot(owner.user.id,owner.organization.id)).contract!;
 await adminService.mutateContract(admin.user,owner.organization.id,current.id,{action:'suspend',reason:'Synthetic suspension'});assert.equal((await snapshot(owner.user.id,owner.organization.id)).active,false);
 await assert.rejects(adminService.updateOrganization(admin.user,owner.organization.id,{action:'resume',reason:'Cannot bypass suspended contract'}),hasCode('ENTITLEMENT_INVALID'));
 await approve(admin,owner.organization.id,input);current=(await snapshot(owner.user.id,owner.organization.id)).contract!;
 await adminService.mutateContract(admin.user,owner.organization.id,current.id,{action:'revoke',reason:'Synthetic revocation'});assert.equal((await snapshot(owner.user.id,owner.organization.id)).features.deep_legal_review,false);
 await approve(admin,owner.organization.id,input);
 const databaseOwner=new Pool({connectionString:process.env.DIRECT_DATABASE_URL,max:1});
 try{await databaseOwner.query("UPDATE enterprise_contracts SET ends_at=now()-interval '1 second' WHERE organization_id=$1",[owner.organization.id]);}finally{await databaseOwner.end();}
 assert.equal((await snapshot(owner.user.id,owner.organization.id)).active,false);
 assert.equal((await getPool().query('SELECT count(*)::int AS count FROM projects WHERE organization_id=$1',[owner.organization.id])).rows[0].count,1);
 const audits=(await getPool().query("SELECT action,detail FROM audit_logs WHERE organization_id=$1 AND action LIKE 'enterprise.contract_%'",[owner.organization.id])).rows;assert.ok(audits.some(item=>item.action==='enterprise.contract_approved'&&item.detail.attested===true));assert.ok(audits.some(item=>item.action==='enterprise.contract_revoke'));
});


test('member and project capacity limits serialize simultaneous additions without deleting existing records',async()=>{
 const admin=await registerAdmin('capacity-admin'),owner=await ownerProject('capacity-company');
 await approve(admin,owner.organization.id,contractInput({limits:{members:2,projects:2,monthlyDeepReviews:1}}));
 const projects=await Promise.allSettled(Array.from({length:5},(_,i)=>organizationService.createProject(owner.user,owner.organization.id,{name:'Capacity race '+i})));
 assert.equal(projects.filter(item=>item.status==='fulfilled').length,1);assert.ok(projects.filter(item=>item.status==='rejected').every(item=>item.status==='rejected'&&item.reason.code==='QUOTA_EXCEEDED'));
 const applicants=await Promise.all([register('capacity-applicant-a'),register('capacity-applicant-b')]),invite=await organizationService.createInvite(owner.user,owner.organization.id,{});
 for(const applicant of applicants)await organizationService.join(applicant.user,invite.code);
 const requests=(await organizationService.detail(owner.user,owner.organization.id)).requests;
 const approved=await Promise.allSettled(requests.filter(request=>applicants.some(applicant=>applicant.user.id===request.userId)).map(request=>organizationService.decideRequest(owner.user,owner.organization.id,request.id,{decision:'approve',role:'Member'})));
 assert.equal(approved.filter(item=>item.status==='fulfilled').length,1);assert.ok(approved.some(item=>item.status==='rejected'&&item.reason.code==='QUOTA_EXCEEDED'));
 const current=await snapshot(owner.user.id,owner.organization.id);assert.equal(current.usage.members,2);assert.equal(current.usage.projects,2);
});
