import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRepository, changedFactKeys} from './index';
import type {Assessment,Company} from '../contracts';
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
