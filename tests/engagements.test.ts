import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerProject,register} from './helpers';
import {expertService} from '../src/lib/experts';
import {withExpertActor} from '../src/lib/experts/context';
import {engagementService} from '../src/lib/engagements';
import {organizationService,authorizeProject} from '../src/lib/organizations';
import {createProjectRepository,saveDocument} from '../src/lib/workspace/postgres';
import {getPool} from '../src/lib/db';
import {quickAssess} from '../src/lib/legal';
import type {Company} from '../src/lib/contracts';
import type {Engagement} from '../src/lib/expert-contracts';
const code=(expected:string)=>(e:unknown)=>Boolean(e&&typeof e==='object'&&'code' in e&&e.code===expected);
const denied=(e:unknown)=>Boolean(e&&typeof e==='object'&&'status' in e&&[403,404].includes(Number(e.status)));

test('real PostgreSQL engagement contracts, explicit sharing and bounded expert collaboration',async t=>{
 const previousReviewers=process.env.BORDERLESS_EXPERT_REVIEWER_IDS;
 const owner=await ownerProject('engagement-company'),expert=await register('engagement-expert'),reviewer=await register('engagement-reviewer'),outsider=await ownerProject('engagement-outsider');
 process.env.BORDERLESS_EXPERT_REVIEWER_IDS=reviewer.user.id;
 try{
  const profile=await expertService.saveProfile(expert.user,{displayName:'Synthetic test professional',visibility:'public',bio:'Synthetic regulatory review fixture, no real credential verification.',specialties:['Market entry'],languages:['English'],credentialType:'Test fixture',licenseNumber:'PRIVATE-TEST-LICENSE',licenseNumberPublic:false,resume:{text:'PRIVATE-TEST-RESUME',url:'',visibility:'private'}});
  await expertService.submit(expert.user);
  await assert.rejects(expertService.review(expert.user,profile.id,{decision:'Verified',notes:'Cannot self verify',evidenceRefs:['test-only:credential'],attested:true}),code('REVIEWER_REQUIRED'));
  await expertService.review(reviewer.user,profile.id,{decision:'Verified',notes:'Synthetic verification fixture, not a real professional credential check.',evidenceRefs:['test-only:credential-attestation'],attested:true});
  const service=await expertService.saveService(expert.user,{title:'Scoped test review',scope:'Review explicitly shared resources only',serviceType:'Legal Assessment Review',pricingType:'quote',priceMinor:null,currency:'USD',published:true});
  const publicProfile=await expertService.detail(owner.user,profile.id);
  assert.ok(!JSON.stringify(publicProfile).includes('PRIVATE-TEST-LICENSE'));assert.ok(!JSON.stringify(publicProfile).includes('PRIVATE-TEST-RESUME'));
  const scope={user:owner.user,...await authorizeProject(owner.user.id,owner.project.id,true)};
  const repo=createProjectRepository(scope);
  const company:Company={id:'engagement-company',name:'UNSHARED-COMPANY-FACTS',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()};
  await repo.saveCompany(company);const scenario=(await repo.getWorkspace()).scenarios[0];const assessed=await quickAssess(company,scenario.id);await repo.saveAssessment(assessed,scenario.company);
  const shared=await saveDocument(scope,{title:'Approved review memo',content:'EXPLICITLY-SHARED-SNAPSHOT'});
  await saveDocument(scope,{title:'Unshared private record',content:'UNSHARED-DOCUMENT-SECRET'});
  const outsideScope={user:outsider.user,...await authorizeProject(outsider.user.id,outsider.project.id,true)};
  const outsideDocument=await saveDocument(outsideScope,{title:'Other organization document',content:'OTHER-ORGANIZATION-SECRET'});
  const request=()=>engagementService.create(owner.user,{projectId:owner.project.id,expertId:profile.id,serviceId:service.id,title:'Explicit scoped review',description:'Request for independently approved human review, not automatic legal certification.',resources:[{kind:'document',id:shared.id},{kind:'assessment',id:assessed.id}]});
  async function agreed():Promise<Engagement>{
   const e=await request();await engagementService.action(owner.user,e.id,{action:'submit'});await engagementService.action(expert.user,e.id,{action:'accept'});
   await engagementService.action(expert.user,e.id,{action:'quote',quote:{scope:'Explicit approved memo and assessment only',priceMinor:25000,currency:'USD',conditions:'Synthetic quote only; no checkout or payment.'}});
   await engagementService.action(expert.user,e.id,{action:'conflict',conflictStatus:'Cleared'});
   await engagementService.action(owner.user,e.id,{action:'agree'});return engagementService.action(expert.user,e.id,{action:'agree'});
  }
  const activation={action:'activate' as const,attested:true,evidenceRefs:['test-only:executed-agreement-reference']};

  await t.test('acceptance does not activate contract or expose resources; parties agree separately and platform reviewer is required',async()=>{
   const e=await request();assert.equal(e.status,'Draft');
   await assert.rejects(engagementService.workspace(owner.user,e.id),code('CONTRACT_REQUIRED'));
   assert.ok(!(await engagementService.list(expert.user)).some(item=>item.id===e.id));
   await assert.rejects(engagementService.get(expert.user,e.id),denied);
   await engagementService.action(owner.user,e.id,{action:'submit'});
   assert.equal((await engagementService.get(expert.user,e.id)).status,'Submitted');
   await assert.rejects(withExpertActor(owner.user,client=>client.query('INSERT INTO engagement_entries(id,engagement_id,organization_id,project_id,author_id,kind,payload) VALUES($1,$2,$3,$4,$5,$6,$7)',['pre-contract-'+e.id,e.id,e.organizationId,e.projectId,owner.user.id,'message',{body:'Forbidden before contract'}])),code('42501'));
   await withExpertActor(expert.user,async client=>assert.equal((await client.query('SELECT id FROM engagement_resources WHERE engagement_id=$1',[e.id])).rows.length,0));
   await assert.rejects(engagementService.workspace(expert.user,e.id),code('CONTRACT_REQUIRED'));
   assert.equal((await engagementService.action(expert.user,e.id,{action:'accept'})).status,'Accepted');
   await assert.rejects(engagementService.workspace(expert.user,e.id),code('CONTRACT_REQUIRED'));
   await assert.rejects(engagementService.action(owner.user,e.id,activation),code('REVIEWER_REQUIRED'));
   await engagementService.action(expert.user,e.id,{action:'quote',quote:{scope:'Explicit scope',priceMinor:null,currency:'USD',conditions:'Await independent agreement'}});
   const companyAgreed=await engagementService.action(owner.user,e.id,{action:'agree'});assert.equal(companyAgreed.companyAgreed,true);assert.equal(companyAgreed.expertAgreed,false);
   await assert.rejects(engagementService.action(reviewer.user,e.id,activation),code('CONTRACT_NOT_READY'));
   await engagementService.action(expert.user,e.id,{action:'agree'});
   await engagementService.action(expert.user,e.id,{action:'conflict',conflictStatus:'Conflict Found'});
   await assert.rejects(engagementService.action(reviewer.user,e.id,activation),code('CONTRACT_NOT_READY'));
   await engagementService.action(expert.user,e.id,{action:'conflict',conflictStatus:'Cleared'});
   await assert.rejects(engagementService.action(reviewer.user,e.id,activation),code('CONTRACT_NOT_READY'));
   await engagementService.action(expert.user,e.id,{action:'quote',quote:{scope:'Final explicit free review',priceMinor:0,currency:'USD',conditions:'Expert explicitly confirms zero fee; no payment processing.'}});
   await engagementService.action(owner.user,e.id,{action:'agree'});await engagementService.action(expert.user,e.id,{action:'agree'});
   await assert.rejects(engagementService.action(reviewer.user,e.id,{action:'activate',attested:true,evidenceRefs:[]}),code('CONTRACT_EVIDENCE_REQUIRED'));
   const active=await engagementService.action(reviewer.user,e.id,activation);assert.equal(active.status,'Active');assert.equal(active.contractStatus,'Confirmed');
   assert.equal((await getPool().query('SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2',[owner.organization.id,expert.user.id])).rows.length,0);
   await assert.rejects(authorizeProject(expert.user.id,owner.project.id),code('FORBIDDEN'));
   const workspace=await engagementService.workspace(expert.user,e.id);assert.equal(workspace.resources.length,2);
   assert.ok(JSON.stringify(workspace.resources).includes('EXPLICITLY-SHARED-SNAPSHOT'));
   assert.ok(!JSON.stringify(workspace).includes('UNSHARED-DOCUMENT-SECRET'));assert.ok(!JSON.stringify(workspace).includes('UNSHARED-COMPANY-FACTS'));
   await assert.rejects(engagementService.workspace(outsider.user,e.id),denied);
   await withExpertActor(expert.user,async client=>{assert.equal((await client.query('SELECT id FROM documents WHERE project_id=$1',[owner.project.id])).rows.length,0);});
  });

  await t.test('decline remains terminal and expert cannot expand sharing or view unapproved requests',async()=>{
   const e=await request();await engagementService.action(owner.user,e.id,{action:'submit'});
   assert.equal((await engagementService.action(expert.user,e.id,{action:'decline'})).status,'Declined');
   await assert.rejects(engagementService.workspace(expert.user,e.id),code('CONTRACT_REQUIRED'));
   await assert.rejects(engagementService.action(expert.user,e.id,{action:'accept'}),code('ENGAGEMENT_STATE'));
   const a=await agreed();
   await assert.rejects(engagementService.action(expert.user,a.id,{action:'update_sharing',resources:[]}),code('FORBIDDEN'));
   await assert.rejects(engagementService.action(owner.user,a.id,{action:'update_sharing',resources:[{kind:'document',id:outsideDocument.id}]}),code('RESOURCE_NOT_FOUND'));
  });

  await t.test('expert opinions are separate, tasks validate participants, and completion makes expert access read-only',async()=>{
   const e=await agreed();await engagementService.action(reviewer.user,e.id,activation);
   const original=await repo.getAssessment(assessed.id);
   await assert.rejects(engagementService.addEntry(owner.user,e.id,{kind:'expert_opinion',body:'Company cannot forge an expert opinion'}),code('FORBIDDEN'));
   const opinion=await engagementService.addEntry(expert.user,e.id,{kind:'expert_opinion',body:'Human expert opinion fixture, not a model result.'});assert.equal(opinion.authorId,expert.user.id);
   const task=await engagementService.addEntry(owner.user,e.id,{kind:'task',body:'Review shared memo',assigneeId:expert.user.id});
   await assert.rejects(engagementService.addEntry(expert.user,e.id,{kind:'task',body:'Invalid assignee',assigneeId:outsider.user.id}),code('ASSIGNEE_INVALID'));
   assert.equal((await engagementService.updateEntry(expert.user,e.id,task.id,{status:'done'})).status,'done');
   await assert.rejects(engagementService.updateEntry(expert.user,e.id,opinion.id,{status:'done'}),code('ENTRY_IMMUTABLE'));
   assert.deepEqual(await repo.getAssessment(assessed.id),original);
   await engagementService.action(expert.user,e.id,{action:'complete'});
   assert.equal((await engagementService.workspace(expert.user,e.id)).entries.length,2);
   await assert.rejects(engagementService.addEntry(expert.user,e.id,{kind:'message',body:'Not editable after completion'}),code('ENGAGEMENT_STATE'));
  });

  await t.test('revocation, cancellation and expiry block expert access while company retains archive',async()=>{
   const canceled=await agreed();await engagementService.action(reviewer.user,canceled.id,activation);
   await engagementService.action(expert.user,canceled.id,{action:'cancel'});
   await assert.rejects(engagementService.workspace(expert.user,canceled.id),denied);
   await assert.rejects(engagementService.workspace(owner.user,canceled.id),code('CONTRACT_REQUIRED'));
   assert.equal((await engagementService.get(owner.user,canceled.id)).status,'Canceled');
   await withExpertActor(owner.user,async client=>assert.equal((await client.query('SELECT id FROM engagement_resources WHERE engagement_id=$1',[canceled.id])).rows.length,2));
   await withExpertActor(expert.user,async client=>assert.equal((await client.query('SELECT id FROM engagements WHERE id=$1',[canceled.id])).rows.length,0));
   assert.ok(!(await engagementService.list(expert.user)).some(item=>item.id===canceled.id));
   const revoked=await agreed();await engagementService.action(reviewer.user,revoked.id,activation);
   await engagementService.action(owner.user,revoked.id,{action:'revoke_access'});
   await assert.rejects(engagementService.workspace(expert.user,revoked.id),denied);
   await assert.rejects(engagementService.workspace(owner.user,revoked.id),code('CONTRACT_REQUIRED'));
   await withExpertActor(owner.user,async client=>assert.equal((await client.query('SELECT id FROM engagement_resources WHERE engagement_id=$1',[revoked.id])).rows.length,2));
   const expired=await agreed();await engagementService.action(reviewer.user,expired.id,activation);
   await withExpertActor(owner.user,client=>client.query("UPDATE engagements SET access_expires_at=now()-interval '1 minute' WHERE id=$1",[expired.id]));
   await assert.rejects(engagementService.workspace(expert.user,expired.id),denied);
   await assert.rejects(engagementService.get(expert.user,expired.id),denied);
   assert.ok(!(await engagementService.list(expert.user)).some(item=>item.id===expired.id));
   assert.equal((await engagementService.workspace(owner.user,expired.id)).resources.length,2);
  });

  await t.test('availability and publication are rechecked before creating or submitting a new request',async()=>{
   const draft=await request();
   const current=(await expertService.me(expert.user)).profile!;
   const {id:_id,userId:_userId,status:_status,updatedAt:_updatedAt,verification:_verification,...fields}=current;
   await expertService.saveProfile(expert.user,{...fields,available:false});await expertService.submit(expert.user);
   await expertService.review(reviewer.user,profile.id,{decision:'Verified',notes:'Synthetic unavailable expert profile fixture.',evidenceRefs:['test-only:availability-review'],attested:true});
   await assert.rejects(request(),code('EXPERT_UNAVAILABLE'));
   await assert.rejects(engagementService.action(owner.user,draft.id,{action:'submit'}),code('EXPERT_UNAVAILABLE'));
   assert.equal((await engagementService.get(owner.user,draft.id)).status,'Draft');
   await expertService.saveProfile(expert.user,{...fields,available:true});await expertService.submit(expert.user);
   await expertService.review(reviewer.user,profile.id,{decision:'Verified',notes:'Synthetic restored availability fixture.',evidenceRefs:['test-only:availability-restored'],attested:true});
   const {expertId:_expertId,...serviceFields}=service;
   await expertService.saveService(expert.user,{...serviceFields,published:false});
   await assert.rejects(engagementService.action(owner.user,draft.id,{action:'submit'}),code('EXPERT_UNAVAILABLE'));
   await expertService.saveService(expert.user,{...serviceFields,published:true});
   assert.equal((await engagementService.action(owner.user,draft.id,{action:'submit'})).status,'Submitted');
  });
  await t.test('Viewer company access is read-only and explicit sharing replacements do not expose general project data',async()=>{
   const viewer=await register('engagement-viewer');const invite=await organizationService.createInvite(owner.user,owner.organization.id,{});await organizationService.join(viewer.user,invite.code);
   const pending=(await organizationService.detail(owner.user,owner.organization.id)).requests.find(r=>r.userId===viewer.user.id)!;
   await organizationService.decideRequest(owner.user,owner.organization.id,pending.id,{decision:'approve',role:'Viewer'});
   const e=await agreed();await engagementService.action(reviewer.user,e.id,activation);
   assert.equal((await engagementService.workspace(viewer.user,e.id)).resources.length,2);
   await assert.rejects(engagementService.addEntry(viewer.user,e.id,{kind:'message',body:'Viewer cannot write'}),denied);
   await engagementService.action(owner.user,e.id,{action:'update_sharing',resources:[{kind:'document',id:shared.id}]});
   const view=await engagementService.workspace(expert.user,e.id);assert.equal(view.resources.length,1);assert.equal(view.resources[0].kind,'document');
   const history=await getPool().query('SELECT action FROM audit_logs WHERE organization_id=$1 AND project_id=$2',[owner.organization.id,owner.project.id]);
   assert.ok(history.rows.some(r=>r.action==='engagement.activated'));assert.ok(history.rows.some(r=>r.action==='engagement.sharing_updated'));
  });
 }finally{if(previousReviewers===undefined)delete process.env.BORDERLESS_EXPERT_REVIEWER_IDS;else process.env.BORDERLESS_EXPERT_REVIEWER_IDS=previousReviewers;}
});
