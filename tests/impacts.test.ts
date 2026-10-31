import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerProject,register,scopedRequest} from './helpers';
import {organizationService,authorizeProject} from '../src/lib/organizations';
import {createProjectRepository} from '../src/lib/workspace/postgres';
import {getPool} from '../src/lib/db';
import {quickAssess} from '../src/lib/legal';
import type {Company,Assessment,ChangeImpact} from '../src/lib/contracts';
const company:Company={id:'impact-company',name:'Impact test SaaS',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()};
const context=(id:string)=>({params:Promise.resolve({id})});

test('SQL/API change impacts persist targeted before/after, manual task links and project isolation',async()=>{
 const owner=await ownerProject('impact-api');
 const repo=createProjectRepository({user:owner.user,...await authorizeProject(owner.user.id,owner.project.id,true)});
 const req=(path:string,method='GET',body?:unknown)=>scopedRequest(path,method,owner.cookie,owner.project.id,body);
 const companyApi=await import('../src/app/api/company/route');
 const assessApi=await import('../src/app/api/assessments/route');
 const impactsApi=await import('../src/app/api/impacts/route');
 const impactApi=await import('../src/app/api/impacts/[id]/route');
 const taskApi=await import('../src/app/api/impacts/[id]/tasks/route');
 await companyApi.PUT(req('/api/company','PUT',company));
 const scenario=(await repo.getWorkspace()).scenarios[0];
 const assessed=await assessApi.POST(req('/api/assessments','POST',{scenarioId:scenario.id}));
 assert.equal(assessed.status,200);const original=await assessed.json() as Assessment;
 assert.equal((await companyApi.PUT(req('/api/company','PUT',{...company,usEmployees:1}))).status,200);
 const listed=await impactsApi.GET(req('/api/impacts'));assert.equal(listed.status,200);
 const impact=(await listed.json()).impacts[0] as ChangeImpact;
 assert.equal(impact.kind,'company');assert.equal(impact.before.usEmployees,0);assert.equal(impact.after.usEmployees,1);
 assert.ok(impact.findingRefs.some(f=>f.topic==='California employment'));
 const refreshed=await repo.getAssessment(original.id);
 for(const finding of original.findings){
  const updated=refreshed.findings.find(f=>f.id===finding.id)!;
  if(finding.factKeys.includes('usEmployees'))assert.equal(updated.reviewState,'reassessment_required');
  else assert.deepEqual(updated,finding,'unrelated finding remains unchanged');
 }
 assert.equal((await repo.getWorkspace()).tasks.length,0,'impact creation is not automatic task creation');
 const created=await taskApi.POST(req('/api/impacts/'+impact.id+'/tasks','POST',{title:'Review hiring impact',assignee:'COO'}),context(impact.id));
 assert.equal(created.status,200);const linked=await created.json();
 assert.equal((await taskApi.POST(req('/api/impacts/'+impact.id+'/tasks','POST',{taskId:linked.task.id}),context(impact.id))).status,200);
 assert.equal((await repo.getImpact(impact.id)).taskIds.length,1);
 await repo.updateTask(linked.task.id,{status:'done'});
 assert.equal((await repo.getAssessment(original.id)).findings.find(f=>f.id===linked.task.findingId)?.reviewState,'reassessment_required');
 const second=await organizationService.createProject(owner.user,owner.organization.id,{name:'Isolated impact project'});
 const other=(path:string,method='GET',body?:unknown)=>scopedRequest(path,method,owner.cookie,second.id,body);
 assert.equal((await impactApi.GET(other('/api/impacts/'+impact.id),context(impact.id))).status,404);
 assert.equal((await taskApi.POST(other('/api/impacts/'+impact.id+'/tasks','POST',{taskId:linked.task.id}),context(impact.id))).status,404);
 const records=await getPool().query('SELECT payload FROM change_impacts WHERE project_id=$1',[owner.project.id]);assert.equal(records.rows.length,0,'unscoped runtime RLS denies impacts');
 const audit=await getPool().query('SELECT action FROM audit_logs WHERE organization_id=$1 AND project_id=$2',[owner.organization.id,owner.project.id]);
 assert.ok(audit.rows.some(r=>r.action==='impact.created'));assert.ok(audit.rows.some(r=>r.action==='impact.task_linked'));
 await repo.deleteTask(linked.task.id);assert.deepEqual((await repo.getImpact(impact.id)).taskIds,[]);
});

test('source-check API uses actual registry only, deduplicates provenance changes and rejects Viewer writes',async()=>{
 const owner=await ownerProject('impact-source');
 const scope={user:owner.user,...await authorizeProject(owner.user.id,owner.project.id,true)};
 const repo=createProjectRepository(scope);await repo.saveCompany(company);const scenario=(await repo.getWorkspace()).scenarios[0];
 const assessment=await quickAssess(company,scenario.id);
 assert.ok(assessment.sourceRevisions?.['ca-employer']);
 assessment.sourceRevisions!['ca-employer']={...assessment.sourceRevisions!['ca-employer'],revision:'synthetic-previous-registry-revision'};
 await repo.saveAssessment(assessment,scenario.company);
 const check=await import('../src/app/api/impacts/check-sources/route');
 const req=(body:unknown,cookie=owner.cookie)=>scopedRequest('/api/impacts/check-sources','POST',cookie,owner.project.id,body);
 const originalFetch=globalThis.fetch;let fetched=0;
 globalThis.fetch=async()=>{fetched++;throw new Error('Source reconciliation must not invoke inference or fetch sources');};
 try{
  const forged=await check.POST(req({sources:{'ca-employer':{revision:'forged',reviewedAt:'future'}}}));assert.equal(forged.status,400);
  const result=await check.POST(req({}));assert.equal(result.status,200);
  const changes=(await result.json()).impacts as ChangeImpact[];assert.equal(changes.length,1);
  assert.deepEqual(changes[0].sourceIds,['ca-employer']);
  assert.ok(changes[0].findingRefs.every(r=>assessment.findings.find(f=>f.id===r.findingId)?.sourceIds.includes('ca-employer')));
  assert.equal((await repo.getAssessment(assessment.id)).sourceRevisions?.['ca-employer'].revision,'synthetic-previous-registry-revision');
  assert.deepEqual((await (await check.POST(req({}))).json()).impacts,[]);
  assert.equal(fetched,0);
 }finally{globalThis.fetch=originalFetch;}
 const viewer=await register('impact-viewer');const invite=await organizationService.createInvite(owner.user,owner.organization.id,{});
 await organizationService.join(viewer.user,invite.code);const pending=(await organizationService.detail(owner.user,owner.organization.id)).requests.find(r=>r.userId===viewer.user.id)!;
 await organizationService.decideRequest(owner.user,owner.organization.id,pending.id,{decision:'approve',role:'Viewer'});
 assert.equal((await check.POST(req({},viewer.cookie))).status,403);
 const impact=await import('../src/app/api/impacts/route');
 assert.equal((await impact.GET(scopedRequest('/api/impacts','GET',viewer.cookie,owner.project.id))).status,200);
});
