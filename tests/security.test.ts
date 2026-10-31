import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationService,authorizeProject} from '../src/lib/organizations';
import {getPool} from '../src/lib/db';
import {createProjectRepository,saveDocument,projectDocuments} from '../src/lib/workspace/postgres';
import type {Company} from '../src/lib/contracts';
import {ownerProject,register,scopedRequest} from './helpers';
const errorCode=(code:string)=>(e:unknown)=>Boolean(e&&typeof e==='object'&&'code' in e&&e.code===code);
const company:Company={id:'security-company',name:'Security fixture',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()};

test('captured project scope cannot retain write access after demotion or read access after revocation',async()=>{
 const owner=await ownerProject('security-owner'),member=await register('security-member');
 const invite=await organizationService.createInvite(owner.user,owner.organization.id,{});
 await organizationService.join(member.user,invite.code);
 const request=(await organizationService.detail(owner.user,owner.organization.id)).requests.find(r=>r.userId===member.user.id)!;
 await organizationService.decideRequest(owner.user,owner.organization.id,request.id,{decision:'approve',role:'Member'});
 const stale={user:member.user,...await authorizeProject(member.user.id,owner.project.id,true)};
 const repository=createProjectRepository(stale);
 await repository.saveCompany(company);
 const membership=(await organizationService.detail(owner.user,owner.organization.id)).members.find(m=>m.userId===member.user.id)!;
 await organizationService.changeMemberRole(owner.user,owner.organization.id,membership.id,'Viewer');
 assert.equal(stale.role,'Member');
 await assert.rejects(repository.saveCompany({...company,name:'Forbidden stale edit'}),errorCode('READ_ONLY'));
 await assert.rejects(saveDocument(stale,{title:'Forbidden stale document',content:'not saved'}),errorCode('READ_ONLY'));
 assert.equal((await repository.getWorkspace()).company?.name,company.name);
 await getPool().query('DELETE FROM memberships WHERE id=$1 AND organization_id=$2',[membership.id,owner.organization.id]);
 await assert.rejects(repository.getWorkspace(),errorCode('FORBIDDEN'));
 await assert.rejects(projectDocuments(stale),errorCode('FORBIDDEN'));
});

test('known assessment, report, task, document and review IDs cannot cross a second approved project',async()=>{
 const owner=await ownerProject('security-idor');
 const first={user:owner.user,...await authorizeProject(owner.user.id,owner.project.id,true)};
 const repo=createProjectRepository(first);await repo.saveCompany(company);
 const scenario=(await repo.getWorkspace()).scenarios[0];
 const {quickAssess}=await import('../src/lib/legal');const assessment=await quickAssess(company,scenario.id);await repo.saveAssessment(assessment,scenario.company);
 const task=await repo.createTask({title:'Private task',findingId:assessment.findings[0].id,status:'todo',assignee:null,notes:'Do not cross projects',evidenceRefs:[]});
 const document=await saveDocument(first,{title:'Private document',content:'Scoped text'});
 const timestamp=new Date().toISOString();const jobId='security-job-'+owner.project.id;
 await repo.createReviewJob({id:jobId,scenarioId:scenario.id,status:'queued',assessmentId:null,result:null,completedTopics:[],currentTopic:null,createdAt:timestamp,updatedAt:timestamp,error:null},scenario.company);
 const second=await organizationService.createProject(owner.user,owner.organization.id,{name:'Second authorized project'});
 const req=(path:string,method='GET',body?:unknown)=>scopedRequest(path,method,owner.cookie,second.id,body);
 const ctx=(id:string)=>({params:Promise.resolve({id})});
 const assessments=await import('../src/app/api/assessments/[id]/route');
 const reports=await import('../src/app/api/reports/[id]/route');
 const tasks=await import('../src/app/api/tasks/[id]/route');
 const documents=await import('../src/app/api/documents/[id]/route');
 const reviews=await import('../src/app/api/reviews/[id]/route');
 assert.equal((await assessments.GET(req('/api/assessments/'+assessment.id),ctx(assessment.id))).status,404);
 assert.equal((await reports.GET(req('/api/reports/'+assessment.id),ctx(assessment.id))).status,404);
 assert.equal((await tasks.PATCH(req('/api/tasks/'+task.id,'PATCH',{status:'done'}),ctx(task.id))).status,404);
 assert.equal((await documents.DELETE(req('/api/documents/'+document.id,'DELETE'),ctx(document.id))).status,404);
 assert.equal((await reviews.GET(req('/api/reviews/'+jobId),ctx(jobId))).status,404);
 assert.equal((await reviews.DELETE(req('/api/reviews/'+jobId,'DELETE'),ctx(jobId))).status,404);
 assert.equal((await repo.getWorkspace()).tasks[0].status,'todo');
 assert.equal((await projectDocuments(first))[0].id,document.id);
 assert.equal((await repo.getReviewJob(jobId)).status,'queued');
 const noProject=await import('../src/app/api/workspace/route');
 assert.equal((await noProject.GET(scopedRequest('/api/workspace','GET',owner.cookie,''))).status,400);
 assert.equal((await noProject.GET(scopedRequest('/api/workspace','GET','',owner.project.id))).status,401);
});

test('production mutation origin requires exact canonical HTTPS origin behind proxy normalization',async()=>{
 const previous={NODE_ENV:process.env.NODE_ENV,BETTER_AUTH_URL:process.env.BETTER_AUTH_URL};
 const {readBody}=await import('../src/lib/http');
 Object.assign(process.env,{NODE_ENV:'production',BETTER_AUTH_URL:'https://app.example.com'});
 const req=(origin:string,host='app.example.com')=>new Request('http://localhost:8080/api/tasks',{method:'POST',headers:{origin,host},body:'{}'});
 try{
  assert.deepEqual(await readBody(req('https://app.example.com')),{});
  await assert.rejects(readBody(req('http://app.example.com')),errorCode('ORIGIN'));
  await assert.rejects(readBody(req('https://attacker.example','attacker.example')),errorCode('ORIGIN'));
 }finally{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
