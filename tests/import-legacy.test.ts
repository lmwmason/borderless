import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {ownerProject} from './helpers';import {createRepository} from '../src/lib/workspace';import {createProjectRepository} from '../src/lib/workspace/postgres';import {importLegacy} from '../src/lib/workspace/import-legacy';import {quickAssess} from '../src/lib/legal';
const company={id:'legacy-company',name:'Preserved legacy',homeCountry:'KR' as const,industry:'b2b_saas' as const,targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote' as const,customerType:'b2b' as const,annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()};
test('legacy import dry-run preserves original; execute is scoped additive and rejects overwrite',async()=>{
 const owner=await ownerProject('legacy'),scope={user:owner.user,organizationId:owner.organization.id,projectId:owner.project.id,role:'Owner'};
 const dir=await mkdtemp(join(tmpdir(),'borderless-import-'));
 try {
 const path=join(dir,'legacy.json'),legacy=createRepository(path);await legacy.saveCompany(company);
 const scenario=(await legacy.getWorkspace()).scenarios[0],assessment=await quickAssess(company,scenario.id);await legacy.saveAssessment(assessment,company);
 await legacy.createTask({title:'Keep this task',findingId:assessment.findings[0].id,status:'done',assignee:'COO',notes:'human review',evidenceRefs:[]});
 const before=await readFile(path,'utf8'),target=createProjectRepository(scope);
 assert.equal((await importLegacy(scope,path)).dryRun,true);assert.equal((await target.getWorkspace()).company,null);
 await importLegacy(scope,path,false);const imported=await target.getWorkspace();
 assert.equal(imported.company?.name,company.name);assert.equal(imported.tasks[0].status,'done');assert.equal(imported.assessments[0].partial,true);
 assert.ok(imported.assessments[0].findings.every(f=>f.status==='review_required'));
 assert.equal(await readFile(path,'utf8'),before);
 await assert.rejects(importLegacy(scope,path,false),/not empty/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('legacy import rejects fabricated sources before changing target project',async()=>{
 const owner=await ownerProject('legacy-invalid'),scope={user:owner.user,organizationId:owner.organization.id,projectId:owner.project.id,role:'Owner'};
 const dir=await mkdtemp(join(tmpdir(),'borderless-import-invalid-'));
 try{
 const path=join(dir,'legacy.json'),legacy=createRepository(path);await legacy.saveCompany(company);
 const scenario=(await legacy.getWorkspace()).scenarios[0],a=await quickAssess(company,scenario.id);a.findings[0].sourceIds=['fabricated'];await legacy.saveAssessment(a);
 await assert.rejects(importLegacy(scope,path,false),/reference is invalid/);
 assert.equal((await createProjectRepository(scope).getWorkspace()).company,null);
 }finally{await rm(dir,{recursive:true,force:true});}
});
