import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CompanySchema} from '../src/lib/contracts';
import type {Assessment,Company,Scenario,Task,Workspace} from '../src/lib/contracts';
const company:Company={id:'qa-company',name:'QA SaaS',homeCountry:'KR',industry:'b2b_saas',targetStates:['California'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()};
const request=(path:string,method:string,body:unknown,origin?:string)=>new Request('http://localhost'+path,{method,headers:{'Content-Type':'application/json',...(origin?{origin}: {})},body:JSON.stringify(body)});
const context=(id:string)=>({params:Promise.resolve({id})});
test('profile schema rejects malformed facts and accepts explicitly unknown values',()=>{
 assert.equal(CompanySchema.safeParse(company).success,true);
 assert.equal(CompanySchema.safeParse({...company,usEntity:null,usEmployees:null}).success,true);
 for(const field of [{usEmployees:-1},{usEmployees:0.5},{annualUsRevenueUsd:-1},{name:''},{homeCountry:'US'},{usEntity:'false'}])assert.equal(CompanySchema.safeParse({...company,...field}).success,false);
});
test('actual route integration: company, scenarios A/B/C, assessment, sourced report and persisted task edits',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'borderless-api-'));
 const oldPath=process.env.BORDERLESS_DATA_PATH,oldKey=process.env.NVIDIA_API_KEY,oldModel=process.env.NVIDIA_MODEL;
 process.env.BORDERLESS_DATA_PATH=join(dir,'workspace.json');
 delete process.env.NVIDIA_API_KEY;delete process.env.NVIDIA_MODEL;
 try {
 const companyRoute=await import('../src/app/api/company/route');
 const workspaceRoute=await import('../src/app/api/workspace/route');
 const scenarioRoute=await import('../src/app/api/scenarios/route');
 const assessRoute=await import('../src/app/api/assessments/route');
 const assessmentRoute=await import('../src/app/api/assessments/[id]/route');
 const taskRoute=await import('../src/app/api/tasks/route');
 const taskIdRoute=await import('../src/app/api/tasks/[id]/route');
 const sourceRoute=await import('../src/app/api/sources/[id]/route');
 const reportRoute=await import('../src/app/api/reports/[id]/route');
 const healthRoute=await import('../src/app/api/health/route');
 assert.equal((await (await healthRoute.GET()).json()).ok,true);
 const bad=await companyRoute.PUT(request('/api/company','PUT',{...company,usEmployees:-1}));
 assert.equal(bad.status,400);assert.equal((await bad.json()).error.code,'VALIDATION');
 const cross=await companyRoute.PUT(request('/api/company','PUT',company,'https://evil.example'));
 assert.equal(cross.status,403);
 const malformed=await companyRoute.PUT(new Request('http://localhost/api/company',{method:'PUT',body:'{' }));
 assert.equal(malformed.status,400);
 assert.equal((await companyRoute.PUT(request('/api/company','PUT',company))).status,200);
 let workspace=await (await workspaceRoute.GET()).json() as Workspace;
 const scenarioA=workspace.scenarios[0];
 const scenarioB=await (await scenarioRoute.POST(request('/api/scenarios','POST',{name:'California employee',company:{...company,usEmployees:1}}))).json() as Scenario;
 const scenarioC=await (await scenarioRoute.POST(request('/api/scenarios','POST',{name:'US subsidiary',company:{...company,usEntity:true,salesModel:'subsidiary'}}))).json() as Scenario;
 // Configured credentials are synthetic; intercepted transport guarantees no live request.
 const originalFetch=globalThis.fetch;
 process.env.NVIDIA_API_KEY='qa-dummy-never-a-live-key';
 let modelRequests=0;
 globalThis.fetch=async(_url,init)=>{
  modelRequests++;
  const payload=JSON.parse(String(init?.body));
  assert.equal(payload.model,'nvidia/nemotron-3.5-super-vl-120b-a12b');
  assert.deepEqual(payload.chat_template_kwargs,{enable_thinking:true});
  const supplied=JSON.parse(payload.messages[1].content);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sourceIds:supplied.sourceIds,questions:[],childTopics:[],review:{proposedStatus:supplied.ruleStatus??'review_required',missingFacts:[],counterexampleFactKeys:[]}})}}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}});
 };
 try {
  const denied=await assessRoute.POST(request('/api/assessments','POST',{scenarioId:scenarioA.id}));
  assert.equal(denied.status,400);assert.equal((await denied.json()).error.code,'CONSENT_REQUIRED');
  assert.equal(modelRequests,0,'missing consent must not send model request');
  const allowed=await assessRoute.POST(request('/api/assessments','POST',{scenarioId:scenarioA.id,consent:true}));
  assert.equal(allowed.status,200);
  const modelAssessment=await allowed.json() as Assessment;
  assert.ok(modelRequests>0);
  assert.equal(modelAssessment.modelId,'nvidia/nemotron-3.5-super-vl-120b-a12b');
  assert.equal(modelAssessment.modelStatus,'available');
  assert.ok((modelAssessment.metrics?.totalTokens??0)>0);
 } finally {globalThis.fetch=originalFetch;delete process.env.NVIDIA_API_KEY;}
 const assessments:Assessment[]=[];
 for(const scenario of [scenarioA,scenarioB,scenarioC]){
  const response=await assessRoute.POST(request('/api/assessments','POST',{scenarioId:scenario.id}));
  assert.equal(response.status,200);
  const assessment=await response.json() as Assessment;
  assert.equal(assessment.partial,true);
  assert.equal(assessment.modelStatus,'unavailable');
  assert.match(assessment.limitations.join(' '),/NVIDIA unavailable/);
  assert.ok(assessment.findings.length>0);
  assessments.push(assessment);
 }
 const statuses=(a:Assessment)=>a.findings.map(f=>[f.topic,f.status,f.summary]);
 assert.notDeepEqual(statuses(assessments[0]),statuses(assessments[1]));
 assert.notDeepEqual(statuses(assessments[0]),statuses(assessments[2]));
 const assessment=assessments[0];
 const fetched=await assessmentRoute.GET(new Request('http://localhost/api/assessments/'+assessment.id),context(assessment.id));
 assert.equal((await fetched.json()).id,assessment.id);
 for(const finding of assessment.findings) for(const sourceId of finding.sourceIds) {
  const sourceResponse=await sourceRoute.GET(new Request('http://localhost/api/sources/'+sourceId),context(sourceId));
  assert.equal(sourceResponse.status,200);
  const source=await sourceResponse.json();
  assert.match(new URL(source.url).hostname,/\.gov$/);
 }
 assert.equal((await sourceRoute.GET(new Request('http://localhost/api/sources/invented'),context('invented'))).status,404);
 const task=await (await taskRoute.POST(request('/api/tasks','POST',{title:'Review finding',findingId:assessment.findings[0].id,assignee:'COO',notes:'Initial',evidenceRefs:[]}))).json() as Task;
 assert.ok(task.id);
 assert.equal((await taskIdRoute.PATCH(request('/api/tasks/'+task.id,'PATCH',{status:'done'}),context(task.id))).status,200);
 assert.equal((await taskIdRoute.PATCH(request('/api/tasks/'+task.id,'PATCH',{notes:'Reviewed internally'}),context(task.id))).status,200);
 workspace=await (await workspaceRoute.GET()).json() as Workspace;
 assert.equal(workspace.tasks[0].status,'done');
 assert.equal(workspace.tasks[0].assignee,'COO');
 assert.equal(workspace.tasks[0].notes,'Reviewed internally');
 assert.deepEqual(workspace.assessments.find(a=>a.id===assessment.id)?.findings,assessment.findings);
 const report=await reportRoute.GET(new Request('http://localhost/api/reports/'+assessment.id),context(assessment.id));
 assert.match(report.headers.get('Content-Type')??'',/text\/markdown/);
 const markdown=await report.text();assert.match(markdown,/Human review required/);assert.match(markdown,/https:\/\//);
 const missingReport=await reportRoute.GET(new Request('http://localhost/api/reports/missing'),context('missing'));
 assert.equal(missingReport.status,404);assert.equal((await missingReport.json()).error.code,'NOT_FOUND');
 assert.equal((await assessRoute.POST(request('/api/assessments','POST',{scenarioId:'missing'}))).status,404);
 assert.equal((await taskIdRoute.DELETE(new Request('http://localhost/api/tasks/'+task.id,{method:'DELETE'}),context(task.id))).status,200);
 assert.equal((await (await workspaceRoute.GET()).json()).tasks.length,0);
 } finally {
 for(const [key,value] of Object.entries({BORDERLESS_DATA_PATH:oldPath,NVIDIA_API_KEY:oldKey,NVIDIA_MODEL:oldModel}))if(value===undefined)delete process.env[key];else process.env[key]=value;
 await rm(dir,{recursive:true,force:true});
 }
});
