import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createRepository} from '../src/lib/workspace';
import {createReviewService} from '../src/lib/ai/review-jobs';
import {quickAssess,type LegalModel} from '../src/lib/legal';
import type {Company} from '../src/lib/contracts';
const company:Company={id:'jobs',name:'Synthetic Jobs',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()};
async function setup(run:(repo:ReturnType<typeof createRepository>,id:string)=>Promise<void>){
 const dir=await mkdtemp(join(tmpdir(),'borderless-jobs-'));try{const repo=createRepository(join(dir,'state.json'));await repo.saveCompany(company);await run(repo,(await repo.getWorkspace()).scenarios[0].id);}finally{await rm(dir,{recursive:true,force:true});}
}
const output={sourceIds:[],questions:[],childTopics:[],telemetry:{latencyMs:1,promptTokens:10,completionTokens:2,totalTokens:12}};
test('Quick result and queued acknowledgement are available while Deep model remains blocked',async()=>setup(async(repo,id)=>{
 let release!:()=>void,started!:()=>void;
 const entered=new Promise<void>(r=>{ started=r; }),gate=new Promise<void>(r=>{ release=r; });let calls=0;
 const model:LegalModel=async()=>{calls++;started();await gate;return output;};
 const service=createReviewService(repo,model,()=>true);
 const quick=await quickAssess(company,id);await repo.saveAssessment(quick,company);
 assert.equal(quick.kind,'quick');assert.equal(quick.modelStatus,'not_requested');assert.equal(calls,0);
 const job=await service.start(id,true);assert.equal(job.status,'queued');await entered;
 const running=await service.get(job.id);assert.equal(running.status,'running');assert.equal(running.completedTopics.length,0);assert.equal(running.result?.modelStatus,'pending');
 assert.equal((await repo.getWorkspace()).assessments.find(a=>a.id===quick.id)?.kind,'quick');
 await assert.rejects(service.start(id,true),e=>e instanceof Error&&e.message.includes('already running'));
 release();const final=await service.wait(job.id);
 assert.equal(final.status,'completed');assert.equal(final.result?.kind,'deep');assert.equal(final.completedTopics.length,6);
 assert.equal(final.result?.metrics?.totalTokens,72);
 assert.equal((await repo.getWorkspace()).assessments.filter(a=>a.id===final.assessmentId).length,1);
}));
test('Deep progress survives refresh, cancellation aborts provider and retains linked tasks',async()=>setup(async(repo,id)=>{
 let secondStarted!:()=>void;const second=new Promise<void>(r=>{ secondStarted=r; });let calls=0,aborted=false;
 const model:LegalModel=async(_input,signal)=>{
  calls++;if(calls===1)return output;
  secondStarted();return new Promise((_resolve,reject)=>{signal?.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Cancelled','AbortError'))},{once:true});});
 };
 const service=createReviewService(repo,model,()=>true),job=await service.start(id,true);await second;
 const progress=await service.get(job.id);assert.equal(progress.completedTopics.length,1);assert.ok(progress.result?.partial);
 const task=await repo.createTask({findingId:progress.result!.findings[0].id,title:'Review completed issue',status:'todo',assignee:null,notes:'',evidenceRefs:[]});
 const cancelled=await service.cancel(job.id);assert.equal(cancelled.status,'cancelled');await service.wait(job.id);assert.equal(aborted,true);
 const saved=await repo.getReviewJob(job.id);assert.equal(saved.status,'cancelled');assert.equal(saved.completedTopics.length,1);assert.ok(saved.result?.limitations.some(l=>l.includes('cancelled')));
 assert.equal((await repo.getWorkspace()).tasks[0].findingId,task.findingId);
 assert.equal((await service.cancel(job.id)).status,'cancelled');
}));
test('outage preserves validated results and missing key or consent never starts provider',async()=>setup(async(repo,id)=>{
 let calls=0;const model:LegalModel=async()=>{if(++calls===1)return output;throw new Error('private upstream response');};
 const unavailable=createReviewService(repo,model,()=>false);
 await assert.rejects(unavailable.start(id,true),/unavailable/);assert.equal(calls,0);
 const service=createReviewService(repo,model,()=>true);
 await assert.rejects(service.start(id,false),/Consent/);assert.equal(calls,0);
 const job=await service.start(id,true),final=await service.wait(job.id);
 assert.equal(final.status,'partial');assert.equal(final.completedTopics.length,1);assert.ok(final.result?.partial);
 assert.ok(!JSON.stringify(final).includes('private upstream'));
}));
test('changed facts interrupt Deep job and stale results cannot overwrite new facts',async()=>setup(async(repo,id)=>{
 let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{ entered=r; }),gate=new Promise<void>(r=>{ release=r; });
 const service=createReviewService(repo,async()=>{entered();await gate;return output;},()=>true);
 const job=await service.start(id,true);await started;
 await repo.updateScenario(id,{company:{...company,usEmployees:1}});
 release();const final=await service.wait(job.id);assert.equal(final.status,'interrupted');assert.ok(final.result?.partial);
 assert.ok(final.result?.findings.some(f=>f.summary.includes('Facts changed')));
}));
test('new worker recovers unfinished jobs as interrupted and retains saved progress',async()=>setup(async(repo,id)=>{
 let started!:()=>void;const entered=new Promise<void>(r=>{ started=r; });
 const service=createReviewService(repo,(_input,signal)=>new Promise((_resolve,reject)=>{started();signal?.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});}),()=>true);
 const job=await service.start(id,true);await entered;
 const replacement=createReviewService(repo,async()=>output,()=>true);await replacement.recover();
 const recovered=await replacement.get(job.id);assert.equal(recovered.status,'interrupted');assert.ok(recovered.result?.partial);
 // Reading terminal persisted state aborts the obsolete worker.
 await service.get(job.id);await service.wait(job.id);
 assert.equal((await repo.getReviewJob(job.id)).status,'interrupted');
}));
