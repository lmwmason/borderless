import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { CompanySchema, ScenarioInputSchema, TaskInputSchema } from '../contracts';
import type { Assessment, Company, Scenario, Task, Workspace, ReviewJob } from '../contracts';

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
  createReviewJob(job: ReviewJob, expectedCompany: Company): Promise<ReviewJob>;
  updateReviewJob(id: string, patch: Partial<ReviewJob>, expectedCompany?: Company): Promise<ReviewJob>;
  getReviewJob(id: string): Promise<ReviewJob>;
  recoverReviewJobs(activeIds: string[]): Promise<void>;
}
const empty = (): Workspace => ({company:null, scenarios:[],tasks:[],activity:[],assessments:[],reviewJobs:[]});
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
const activeJob = (job:ReviewJob) => job.status==='queued'||job.status==='running';
function interruptJob(state:Workspace,job:ReviewJob,message:string) {
  job.status='interrupted';job.error=message;job.updatedAt=now();job.currentTopic=null;
  if(job.result) {
    job.result.partial=true;
    if(!job.result.limitations.includes(message)) job.result.limitations.push(message);
    const index=state.assessments.findIndex(a=>a.id===job.result!.id);
    if(index>=0)state.assessments[index]=clone(job.result);
    else state.assessments.push(clone(job.result));
  }
  activity(state,'review.interrupted',message);
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
  for(const job of state.reviewJobs??[]) {
    if(job.scenarioId!==scenarioId)continue;
    const assessment=state.assessments.find(a=>a.id===job.assessmentId);
    if(assessment)job.result=clone(assessment);
    if(activeJob(job)) interruptJob(state,job,'Company facts changed during review; start a new review. Previous results are partial.');
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
        || !('company' in parsed) || (parsed.reviewJobs!==undefined && !Array.isArray(parsed.reviewJobs))) throw new Error('Workspace data is invalid; restore from backup.');
      parsed.reviewJobs??=[];
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
    createReviewJob(job,expectedCompany) {
      return mutate(state=>{
        const scenario=state.scenarios.find(s=>s.id===job.scenarioId);
        if(!scenario)throw new Error('Not found');
        if(changedFactKeys(expectedCompany,scenario.company).length)throw new Error('Facts changed during assessment; run again');
        const jobs=state.reviewJobs??=[];
        if(jobs.some(activeJob))throw new Error('Review already running');
        if(jobs.some(j=>j.id===job.id))throw new Error('Review job already exists');
        if(!activeJob(job))throw new Error('New review job must be queued or running');
        if(job.result && (job.result.scenarioId!==job.scenarioId||job.assessmentId!==job.result.id))throw new Error('Invalid review result');
        if(job.result)throw new Error('New review job cannot contain results');
        const created=clone(job);jobs.push(created);
        activity(state,'review.created','Background review queued');
        return created;
      });
    },
    updateReviewJob(id,patch,expectedCompany) {
      return mutate(state=>{
        const job=(state.reviewJobs??[]).find(j=>j.id===id);
        if(!job)throw new Error('Not found');
        if(!activeJob(job))throw new Error('Review job is terminal');
        const scenario=state.scenarios.find(s=>s.id===job.scenarioId);
        if(!scenario)throw new Error('Not found');
        if(expectedCompany&&changedFactKeys(expectedCompany,scenario.company).length)throw new Error('Facts changed during assessment; run again');
        if((patch.id!==undefined&&patch.id!==id)||(patch.scenarioId!==undefined&&patch.scenarioId!==job.scenarioId))throw new Error('Review identity cannot change');
        if(job.assessmentId&&patch.assessmentId!==undefined&&patch.assessmentId!==job.assessmentId)throw new Error('Review assessment identity cannot change');
        const candidate={...job,...clone(patch),id:job.id,scenarioId:job.scenarioId,createdAt:job.createdAt,updatedAt:now()};
        if(candidate.result) {
          if(candidate.result.scenarioId!==job.scenarioId)throw new Error('Invalid review result');
          if(job.assessmentId&&candidate.result.id!==job.assessmentId)throw new Error('Review assessment identity cannot change');
          if(candidate.assessmentId&&candidate.result.id!==candidate.assessmentId)throw new Error('Invalid review result');
          candidate.assessmentId=candidate.result.id;
          if(candidate.status!=='completed'){candidate.result.partial=true;if(candidate.error&&!candidate.result.limitations.includes(candidate.error))candidate.result.limitations.push(candidate.error);}
          const index=state.assessments.findIndex(a=>a.id===candidate.result!.id);
          if(index>=0&&state.assessments[index].scenarioId!==job.scenarioId)throw new Error('Invalid review result');
          if(index<0)state.assessments.push(clone(candidate.result));
          else state.assessments[index]=clone(candidate.result);
        }
        if(candidate.status==='completed'&&(!candidate.result||candidate.result.partial))throw new Error('Completed review requires a complete result');
        if(!activeJob(candidate))candidate.currentTopic=null;
        candidate.completedTopics=[...new Set(candidate.completedTopics)];
        Object.assign(job,candidate);
        if(!activeJob(job))activity(state,'review.'+job.status,'Background review '+job.status+'; human review remains required');
        return job;
      });
    },
    getReviewJob(id) {
      return serialized(async()=>{
        const job=((await read()).reviewJobs??[]).find(j=>j.id===id);
        if(!job)throw new Error('Not found');
        return clone(job);
      });
    },
    recoverReviewJobs(activeIds) {
      return mutate(state=>{
        for(const job of state.reviewJobs??[])if(activeJob(job)&&!activeIds.includes(job.id)) {
          interruptJob(state,job,'Review interrupted by process restart; saved findings are partial. Start a new review to continue.');
        }
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
