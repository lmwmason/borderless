import {randomUUID} from 'node:crypto';
import type {ReviewJob} from '../contracts';
import type {WorkspaceRepository} from '../workspace';
import {createProjectRepository,type ProjectScope} from '../workspace/postgres';
import {assess,type LegalModel} from '../legal';
import {NVIDIA_MODEL,nvidiaModel,isNvidiaConfigured} from './nvidia';
import {ApiError} from '../http';
type Running={controller:AbortController;done?:Promise<void>};
type State=Map<string,Running>;
const active=(job:ReviewJob)=>job.status==='queued'||job.status==='running';
export function createReviewService(repo:WorkspaceRepository,model:LegalModel=nvidiaModel,configured:()=>boolean=isNvidiaConfigured,state:State=new Map(),canRecover=true){
 async function recover(){if(canRecover)await repo.recoverReviewJobs([...state.keys()]);}
 async function get(id:string){
  await recover();const job=await repo.getReviewJob(id);
  if(!active(job))state.get(id)?.controller.abort();
  return job;
 }
 async function run(job:ReviewJob,company:import('../contracts').Company,controller:AbortController){
  try{
   await repo.updateReviewJob(job.id,{status:'running'},company);
   const result=await assess(company,job.scenarioId,model,{
    signal:controller.signal,
    onProgress:async(snapshot,progress)=>{
     snapshot.kind='deep';snapshot.modelId=NVIDIA_MODEL;
     await repo.updateReviewJob(job.id,{result:snapshot,assessmentId:snapshot.id,...progress},company);
    }
   });
   result.kind='deep';result.modelId=NVIDIA_MODEL;
   await repo.updateReviewJob(job.id,{status:controller.signal.aborted?'cancelled':result.partial?'partial':'completed',result,assessmentId:result.id,currentTopic:null},company);
  }catch(error){
   // Never expose upstream bodies, credentials, or arbitrary error messages.
   const stale=error instanceof Error&&error.message==='Facts changed during assessment; run again';
   await repo.updateReviewJob(job.id,{status:stale?'interrupted':controller.signal.aborted?'cancelled':'failed',currentTopic:null,error:stale?'Company facts changed. Start a new review.':controller.signal.aborted?'Review cancelled. Completed findings are retained.':'Deep Review could not finish. Completed findings are retained.'}).catch(()=>undefined);
  }finally{state.delete(job.id);}
 }
 return {
  recover,get,
  async start(scenarioId:string,consent:boolean){
   if(!consent)throw new ApiError(400,'CONSENT_REQUIRED','Consent is required before sending business facts to NVIDIA.');
   if(!configured())throw new ApiError(503,'NVIDIA_UNAVAILABLE','NVIDIA Deep Review is unavailable. Quick Assessment remains available.');
   await recover();
   const w=await repo.getWorkspace(),scenario=w.scenarios.find(s=>s.id===scenarioId);
   if(!scenario)throw new ApiError(404,'NOT_FOUND','Scenario not found.');
   const now=new Date().toISOString();
   const job:ReviewJob={id:randomUUID(),scenarioId,status:'queued',assessmentId:null,result:null,completedTopics:[],currentTopic:null,createdAt:now,updatedAt:now,error:null};
   const running:Running={controller:new AbortController()};state.set(job.id,running);
   try {await repo.createReviewJob(job,scenario.company);}
   catch(error){state.delete(job.id);if(error instanceof Error&&error.message==='Review already running')throw new ApiError(409,'REVIEW_RUNNING','A Deep Review is already running.');throw error;}
   running.done=run(job,scenario.company,running.controller);
   return job;
  },
  async cancel(id:string){
   const job=await get(id);if(!active(job))return job;
   state.get(id)?.controller.abort();
   try {return await repo.updateReviewJob(id,{status:'cancelled',currentTopic:null,error:'Review cancelled. Completed findings are retained.'});}
   catch(error){const latest=await repo.getReviewJob(id);if(!active(latest))return latest;throw error;}
  },
  async wait(id:string){await state.get(id)?.done;return get(id);}
 };
}
const globals=globalThis as typeof globalThis&{borderlessReviews?:State};
const state=globals.borderlessReviews??=new Map();

export function projectReviewService(scope:ProjectScope){return createReviewService(createProjectRepository(scope),nvidiaModel,isNvidiaConfigured,state,scope.role!=='Viewer');}
