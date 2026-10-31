import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { CompanySchema, ScenarioInputSchema, TaskInputSchema } from '../contracts';
import type { Assessment, Company, Scenario, Task, Workspace } from '../contracts';

type TaskInput = Omit<Task, 'id' | 'updatedAt'>;
export interface WorkspaceRepository {
  getWorkspace(): Promise<Workspace>;
  saveCompany(company: Company): Promise<Company>;
  createScenario(input: {name: string; company: Company}): Promise<Scenario>;
  updateScenario(id: string, input: {name?: string; company?: Company}): Promise<Scenario>;
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: string, input: Partial<TaskInput>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  saveAssessment(assessment: Assessment, expectedCompany?: Company): Promise<Assessment>;
  getAssessment(id: string): Promise<Assessment>;
}
const empty = (): Workspace => ({company:null, scenarios:[],tasks:[],activity:[],assessments:[]});
const clone = <T>(value:T):T => structuredClone(value);
const now = () => new Date().toISOString();
const queues = new Map<string, Promise<unknown>>();
export function changedFactKeys(previous: Company, next: Company): string[] {
  return Object.keys(next).filter(key => key !== 'updatedAt' && key !== 'id'
    && JSON.stringify(previous[key as keyof Company]) !== JSON.stringify(next[key as keyof Company]));
}
function activity(state: Workspace, type:string, message:string) {
  state.activity.push({id:randomUUID(),at:now(),type,message});
}
function invalidate(state: Workspace, scenarioId: string, keys: string[]) {
  if (!keys.length) return;
  for(const assessment of state.assessments.filter(a=>a.scenarioId===scenarioId)) {
    const affected = assessment.findings.filter(f=>f.factKeys.some(k=>keys.includes(k)));
    if(!affected.length) continue;
    assessment.partial = true;
    const warning = 'Facts changed; reassessment required for: '+keys.join(', ')+'. Previous findings are retained for human review.';
    if (!assessment.limitations.includes(warning)) assessment.limitations.push(warning);
    for (const finding of affected) {
      finding.status='review_required';
      finding.summary='Facts changed — reassessment required. '+finding.summary.replace(/^Facts changed — reassessment required\. /,'');
    }
    activity(state,'assessment.invalidated', 'Affected findings require reassessment after '+keys.join(', '));
  }
}
/** Single-process, single-workspace demo storage. Not multi-tenant or cross-process safe. */
export function createRepository(filePath: string): WorkspaceRepository {
  const path=resolve(filePath);
  function serialized<T>(operation:()=>Promise<T>):Promise<T> {
    const pending=(queues.get(path)??Promise.resolve()).catch(()=>undefined).then(operation);
    queues.set(path,pending);
    void pending.finally(()=>{if(queues.get(path)===pending) queues.delete(path);}).catch(()=>undefined);
    return pending;
  }
  async function read():Promise<Workspace> {
    try {
      const parsed=JSON.parse(await readFile(path,'utf8')) as Workspace;
      if(!parsed || !Array.isArray(parsed.scenarios) || !Array.isArray(parsed.tasks)
        || !Array.isArray(parsed.activity) || !Array.isArray(parsed.assessments)
        || !('company' in parsed)) throw new Error('Workspace data is invalid; restore from backup.');
      return parsed;
    } catch(error) {
      if((error as NodeJS.ErrnoException).code==='ENOENT') return empty();
      throw error;
    }
  }
  async function write(state:Workspace) {
    await mkdir(dirname(path),{recursive:true,mode:0o700});
    const temp=path+'.'+randomUUID()+'.tmp';
    try {
      await writeFile(temp,JSON.stringify(state,null,2),{encoding:'utf8',mode:0o600,flag:'wx'});
      await rename(temp,path);
    } catch(error) {
      await unlink(temp).catch(()=>undefined);
      throw error;
    }
  }
  function mutate<T>(fn:(state:Workspace)=>T):Promise<T> {
    return serialized(async()=>{const state=await read(); const result=fn(state); await write(state); return clone(result);});
  }
  return {
    getWorkspace:()=>serialized(async()=>clone(await read())),
    saveCompany(input) {
      const validated=CompanySchema.parse(input);
      return mutate(state=>{
        const company={...validated,updatedAt:now()};
        const prior=state.company;
        state.company=company;
        // The first scenario represents the current company; cloned plans remain independent.
        if(state.scenarios.length===0) state.scenarios.push({id:randomUUID(),name:'Current company',company:clone(company)});
        else {
          const current=state.scenarios[0];
          const keys=changedFactKeys(current.company,company);
          current.company=clone(company);
          invalidate(state,current.id,keys);
        }
        activity(state,prior?'company.updated':'company.created','Company profile saved');
        return company;
      });
    },
    createScenario(input) {
      const validated=ScenarioInputSchema.parse(input);
      return mutate(state=>{
        const scenario={id:randomUUID(),name:validated.name,company:clone(validated.company)};
        state.scenarios.push(scenario);
        activity(state,'scenario.created','Scenario created: '+scenario.name);
        return scenario;
      });
    },
    updateScenario(id,input) {
      const validated=ScenarioInputSchema.partial().parse(input);
      return mutate(state=>{
        const scenario=state.scenarios.find(s=>s.id===id);
        if(!scenario) throw new Error('Not found');
        if(validated.name!==undefined) scenario.name=validated.name;
        if(validated.company) {
          const keys=changedFactKeys(scenario.company,validated.company);
          scenario.company={...validated.company,updatedAt:now()};
          invalidate(state,id,keys);
          if(state.scenarios[0]?.id===id) state.company=clone(scenario.company);
        }
        activity(state,'scenario.updated','Scenario updated: '+scenario.name);
        return scenario;
      });
    },
    createTask(input) {
      const validated=TaskInputSchema.parse(input);
      return mutate(state=>{
        if(validated.findingId && !state.assessments.some(a=>a.findings.some(f=>f.id===validated.findingId))) throw new Error('Not found');
        const task={...validated,id:randomUUID(),updatedAt:now()};
        state.tasks.push(task);
        activity(state,'task.created','Task created: '+task.title);
        return task;
      });
    },
    updateTask(id,input) {
      const parsed=TaskInputSchema.partial().parse(input);
      const validated=Object.fromEntries(Object.entries(parsed).filter(([key])=>Object.hasOwn(input,key))) as Partial<TaskInput>;
      return mutate(state=>{
        const task=state.tasks.find(t=>t.id===id);
        if(!task) throw new Error('Not found');
        if(validated.findingId && !state.assessments.some(a=>a.findings.some(f=>f.id===validated.findingId))) throw new Error('Not found');
        Object.assign(task,validated,{updatedAt:now()});
        activity(state,'task.updated','Task updated: '+task.title+' ('+task.status+'). Task status is not legal certification.');
        return task;
      });
    },
    deleteTask(id) {
      return mutate(state=>{
        const task=state.tasks.find(t=>t.id===id);
        if(!task) throw new Error('Not found');
        state.tasks=state.tasks.filter(t=>t.id!==id);
        activity(state,'task.deleted','Task deleted: '+task.title);
      });
    },
    saveAssessment(assessment, expectedCompany) {
      return mutate(state=>{
        const scenario=state.scenarios.find(s=>s.id===assessment.scenarioId);
        if(!scenario) throw new Error('Not found');
        if(expectedCompany && changedFactKeys(expectedCompany,scenario.company).length) throw new Error('Facts changed during assessment; run again');
        if(state.assessments.some(a=>a.id===assessment.id)) throw new Error('Assessment already exists');
        state.assessments.push(clone(assessment));
        activity(state,'assessment.created',assessment.partial?'Partial assessment saved; human review required':'Assessment saved; human review required');
        return assessment;
      });
    },
    getAssessment(id) {
      return serialized(async()=>{
        const assessment=(await read()).assessments.find(a=>a.id===id);
        if(!assessment) throw new Error('Not found');
        return clone(assessment);
      });
    }
  };
}
export const repository=createRepository(process.env.BORDERLESS_DATA_PATH??'./data/workspace.json');
