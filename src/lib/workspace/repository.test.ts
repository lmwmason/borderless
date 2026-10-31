import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRepository, changedFactKeys} from './index';
import type {Assessment,Company,ReviewJob} from '../contracts';
const company:Company={id:'company',name:'Test SaaS',homeCountry:'KR',industry:'b2b_saas',targetStates:['California'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()};
async function setup(fn:(repo:ReturnType<typeof createRepository>,path:string)=>Promise<void>) {
 const dir=await mkdtemp(join(tmpdir(),'borderless-workspace-'));
 try {const path=join(dir,'workspace.json');await fn(createRepository(path),path);} finally {await rm(dir,{recursive:true,force:true});}
}
test('company, cloned scenario, edits and task CRUD persist across repository recreation',()=>setup(async(repo,path)=>{
 assert.equal((await repo.getWorkspace()).company,null);
 await repo.saveCompany(company);
 const clone=await repo.createScenario({name:'California hire',company:{...company,usEmployees:1}});
 await repo.updateScenario(clone.id,{name:'Hiring plan'});
 const task=await repo.createTask({title:'Review hiring',findingId:null,status:'todo',assignee:null,notes:'',evidenceRefs:[]});
 await repo.updateTask(task.id,{status:'done',assignee:'COO',notes:'Reviewed by team',evidenceRefs:['Internal review note']});
 await repo.updateTask(task.id,{notes:'Second note'});
 const fresh=createRepository(path);const state=await fresh.getWorkspace();
 assert.equal(state.company?.name,company.name);
 assert.equal(state.scenarios[1].name,'Hiring plan');
 assert.equal(state.tasks[0].status,'done');
 assert.equal(state.tasks[0].assignee,'COO');
 assert.ok(state.activity.length>=5);
 await fresh.deleteTask(task.id);assert.equal((await fresh.getWorkspace()).tasks.length,0);
}));
test('only relevant findings invalidate, cloned scenario remains independent, task done never certifies compliance',()=>setup(async(repo)=>{
 await repo.saveCompany(company);
 const state=await repo.getWorkspace();const id=state.scenarios[0].id;
 const clone=await repo.createScenario({name:'Independent',company});
 const assessment:Assessment={id:'assessment',scenarioId:id,findings:[
 {id:'employment',scenarioId:id,topic:'Employment',jurisdiction:'California',status:'not_applicable',summary:'No employees',factKeys:['usEmployees'],missingFacts:[],sourceIds:[],assessedAt:company.updatedAt},
 {id:'privacy',scenarioId:id,topic:'Privacy',jurisdiction:'California',status:'insufficient_data',summary:'Need facts',factKeys:['processesPersonalData'],missingFacts:['processesPersonalData'],sourceIds:[],assessedAt:company.updatedAt}
 ],questions:[],coverage:[],limitations:[],partial:false};
 await repo.saveAssessment(assessment);
 const task=await repo.createTask({title:'Review',findingId:'employment',status:'todo',assignee:null,notes:'',evidenceRefs:[]});
 await repo.updateTask(task.id,{status:'done'});
 assert.equal((await repo.getAssessment('assessment')).findings[0].status,'not_applicable');
 await repo.saveCompany({...company,usEmployees:1});
 const changed=await repo.getAssessment('assessment');
 assert.equal(changed.findings[0].status,'review_required');
 assert.equal(changed.findings[1].status,'insufficient_data');
 assert.equal(changed.partial,true);
 assert.equal((await repo.getWorkspace()).scenarios.find(s=>s.id===clone.id)?.company.usEmployees,0);
}));
test('serialized writes across repository instances lose no tasks',()=>setup(async(repo,path)=>{
 const other=createRepository(path);
 await Promise.all(Array.from({length:25},(_,i)=>(i%2?repo:other).createTask({title:'Task '+i,status:'todo',findingId:null,assignee:null,notes:'',evidenceRefs:[]})));
 assert.equal((await repo.getWorkspace()).tasks.length,25);
 const json=JSON.parse(await readFile(path,'utf8'));assert.equal(json.tasks.length,25);
}));
test('missing resources reject and corrupt storage never silently resets',()=>setup(async(repo,path)=>{
 await assert.rejects(repo.updateTask('missing',{status:'done'}),/Not found/);
 await assert.rejects(repo.getAssessment('missing'),/Not found/);
 await repo.saveCompany(company);
 await writeFile(path,'corrupt');
 await assert.rejects(repo.getWorkspace(),SyntaxError);
 assert.equal(await readFile(path,'utf8'),'corrupt');
}));
test('changed facts exclude timestamp metadata',()=>{
 assert.deepEqual(changedFactKeys(company,{...company,updatedAt:'new'}),[]);
 assert.deepEqual(changedFactKeys(company,{...company,usOffice:true}),['usOffice']);
});

test('assessment snapshot validation runs within serialized write to reject stale results',()=>setup(async(repo)=>{
 await repo.saveCompany(company);
 const scenario=(await repo.getWorkspace()).scenarios[0];
 const assessment:Assessment={id:'stale',scenarioId:scenario.id,findings:[],questions:[],coverage:[],limitations:[],partial:false};
 await repo.updateScenario(scenario.id,{company:{...scenario.company,usEmployees:1}});
 await assert.rejects(repo.saveAssessment(assessment,scenario.company),/Facts changed during assessment; run again/);
 assert.equal((await repo.getWorkspace()).assessments.length,0);
 const current=(await repo.getWorkspace()).scenarios[0].company;
 await repo.saveAssessment({...assessment,id:'fresh'},current);
 assert.equal((await repo.getWorkspace()).assessments.length,1);
}));

const reviewJob=(scenarioId:string,id='job'):ReviewJob=>({id,scenarioId,status:'queued',assessmentId:null,result:null,completedTopics:[],currentTopic:null,createdAt:company.updatedAt,updatedAt:company.updatedAt,error:null});
const progressAssessment=(scenarioId:string):Assessment=>({id:'deep-assessment',scenarioId,findings:[{id:'stable-employment',scenarioId,topic:'Employment',jurisdiction:'California',status:'not_applicable',summary:'No employees',factKeys:['usEmployees'],missingFacts:[],sourceIds:[],assessedAt:company.updatedAt}],questions:[],coverage:[],limitations:[],partial:true,kind:'deep'});
test('review progress persists through recreation and upserts stable assessment/task references',()=>setup(async(repo,path)=>{
 await repo.saveCompany(company);const scenario=(await repo.getWorkspace()).scenarios[0];
 await repo.createReviewJob(reviewJob(scenario.id),scenario.company);
 await assert.rejects(repo.createReviewJob(reviewJob(scenario.id,'second'),scenario.company),/Review already running/);
 const result=progressAssessment(scenario.id);
 await repo.updateReviewJob('job',{status:'running',result,completedTopics:['Employment'],currentTopic:'Privacy'},scenario.company);
 const fresh=createRepository(path);assert.equal((await fresh.getReviewJob('job')).completedTopics[0],'Employment');
 await fresh.createTask({title:'Human review',findingId:'stable-employment',status:'todo',assignee:null,notes:'',evidenceRefs:[]});
 await fresh.updateReviewJob('job',{status:'completed',result:{...result,partial:false}},scenario.company);
 const state=await fresh.getWorkspace();assert.equal(state.assessments.length,1);assert.equal(state.tasks[0].findingId,'stable-employment');
 assert.equal(state.reviewJobs?.[0].status,'completed');
 await assert.rejects(fresh.updateReviewJob('job',{status:'running',result}),/terminal/);
 assert.equal((await fresh.getAssessment(result.id)).partial,false);
}));
test('orphaned jobs recover as interrupted retaining truthful partial results and terminal state',()=>setup(async(repo)=>{
 await repo.saveCompany(company);const scenario=(await repo.getWorkspace()).scenarios[0];
 await repo.createReviewJob(reviewJob(scenario.id),scenario.company);
 await repo.updateReviewJob('job',{status:'running',result:progressAssessment(scenario.id)},scenario.company);
 await repo.recoverReviewJobs(['job']);assert.equal((await repo.getReviewJob('job')).status,'running');
 await repo.recoverReviewJobs([]);const job=await repo.getReviewJob('job');
 assert.equal(job.status,'interrupted');assert.equal(job.result?.partial,true);assert.match(job.error??'',/restart/);
 await assert.rejects(repo.updateReviewJob('job',{status:'completed'}),/terminal/);
 await repo.createReviewJob(reviewJob(scenario.id,'new-job'),scenario.company);
}));
test('fact invalidation interrupts active progress and mirrors terminal job results',()=>setup(async(repo)=>{
 await repo.saveCompany(company);const scenario=(await repo.getWorkspace()).scenarios[0];
 await repo.createReviewJob(reviewJob(scenario.id),scenario.company);
 const result=progressAssessment(scenario.id);
 await repo.updateReviewJob('job',{status:'running',result},scenario.company);
 await repo.saveCompany({...company,usEmployees:1});
 const job=await repo.getReviewJob('job');assert.equal(job.status,'interrupted');assert.equal(job.result?.findings[0].status,'review_required');
 await assert.rejects(repo.updateReviewJob('job',{result},scenario.company),/terminal/);
 assert.deepEqual((await repo.getReviewJob('job')).result,await repo.getAssessment(result.id));
 await assert.rejects(repo.createReviewJob(reviewJob(scenario.id,'stale'),scenario.company),/Facts changed/);
}));
test('completed job result reflects later relevant fact invalidation and legacy storage accepts absent jobs',()=>setup(async(repo,path)=>{
 await repo.saveCompany(company);const scenario=(await repo.getWorkspace()).scenarios[0];
 await repo.createReviewJob(reviewJob(scenario.id),scenario.company);
 await repo.updateReviewJob('job',{status:'completed',result:{...progressAssessment(scenario.id),partial:false}},scenario.company);
 await repo.saveCompany({...company,usEmployees:2});
 assert.equal((await repo.getReviewJob('job')).result?.findings[0].status,'review_required');
 const legacy=await repo.getWorkspace();delete legacy.reviewJobs;
 await writeFile(path,JSON.stringify(legacy));
 assert.deepEqual((await createRepository(path).getWorkspace()).reviewJobs,[]);
}));
test('job creation conflict checks are atomic and stale progress cannot overwrite assessment',()=>setup(async(repo,path)=>{
 await repo.saveCompany(company);const scenario=(await repo.getWorkspace()).scenarios[0];
 const outcomes=await Promise.allSettled([repo.createReviewJob(reviewJob(scenario.id,'one'),scenario.company),createRepository(path).createReviewJob(reviewJob(scenario.id,'two'),scenario.company)]);
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
 const winner=(await repo.getWorkspace()).reviewJobs![0];
 await assert.rejects(repo.updateReviewJob(winner.id,{result:progressAssessment(scenario.id)},{...scenario.company,usEmployees:3}),/Facts changed/);
 assert.equal((await repo.getWorkspace()).assessments.length,0);
}));
