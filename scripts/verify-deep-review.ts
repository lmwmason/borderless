import {randomUUID,randomBytes} from 'node:crypto';import {writeFile} from 'node:fs/promises';
import {getAuth,requireUser} from '../src/lib/auth';import {organizationService,requireProject} from '../src/lib/organizations';import {billingService,TERMS_VERSION} from '../src/lib/billing';import {createProjectRepository} from '../src/lib/workspace/postgres';import {closePools} from '../src/lib/db';
import {POST} from '../src/app/api/reviews/route';import {GET} from '../src/app/api/reviews/[id]/route';import type {ReviewJob} from '../src/lib/contracts';
async function main(){
 if(!process.env.NVIDIA_API_KEY)throw new Error('NVIDIA_API_KEY unavailable.');
 const origin=process.env.BETTER_AUTH_URL!;
 const response=await getAuth().handler(new Request(origin+'/api/auth/sign-up/email',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Synthetic Release Verification',email:'release-'+randomUUID()+'@example.com',password:randomBytes(32).toString('base64url')})}));
 if(!response.ok)throw new Error('Synthetic account registration failed.');
 const cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const user=await requireUser(new Request(origin,{headers:{cookie}}));
 const org=await organizationService.create(user,{name:'Synthetic Release Verification'});
 await billingService.acceptTerms(user,org.id,{termsVersion:TERMS_VERSION,accepted:true});await billingService.activateFree(user,org.id);
 const project=await organizationService.createProject(user,org.id,{name:'Synthetic US entry'});
 const headers={cookie,'x-project-id':project.id,origin,host:new URL(origin).host,'Content-Type':'application/json'};
 const req=(path:string,method='GET',body?:unknown)=>new Request(origin+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
 const scope=await requireProject(req('/api/workspace')),repo=createProjectRepository(scope);
 await repo.saveCompany({id:randomUUID(),name:'Synthetic SaaS facts only',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()});
 const scenario=(await repo.getWorkspace()).scenarios[0];const started=Date.now();
 const accepted=await POST(req('/api/reviews','POST',{scenarioId:scenario.id,consent:true}));if(accepted.status!==202)throw new Error('Deep Review was not accepted.');
 const initial=await accepted.json() as ReviewJob,acknowledgementMs=Date.now()-started;const observed:{status:string;topics:number;partial:boolean|null}[]=[];let job=initial;
 console.log(JSON.stringify({event:'deep_review_accepted',status:accepted.status,acknowledgementMs}));
 while(true){
  const response=await GET(req('/api/reviews/'+job.id),{params:Promise.resolve({id:job.id})});if(!response.ok)throw new Error('Progress read failed.');
  job=await response.json() as ReviewJob;const state={status:job.status,topics:job.completedTopics.length,partial:job.result?.partial??null};
  if(!observed.length||JSON.stringify(state)!==JSON.stringify(observed.at(-1))){observed.push(state);console.log(JSON.stringify({event:'deep_review_progress',...state}));}
  if(!['queued','running'].includes(job.status))break;
  if(Date.now()-started>125000)throw new Error('Review exceeded verification safety deadline.');
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 const stored=await repo.getReviewJob(job.id);const verified=stored.result?.modelStatus==='available'&&stored.completedTopics.length>0;
 const report={verified,modelId:stored.result?.modelId,acknowledgementMs,elapsedMs:Date.now()-started,observed,finalStatus:stored.status,partial:stored.result?.partial,completedTopics:stored.completedTopics.length,findings:stored.result?.findings.length??0,metrics:stored.result?.metrics,persisted:JSON.stringify(stored)===JSON.stringify(job)};
 await writeFile('/tmp/borderless-live-review.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({event:'deep_review_final',...report}));if(!verified)process.exitCode=1;
}
main().catch(()=>{console.error('Live synthetic Deep Review verification failed. No fallback provider or payment was used.');process.exitCode=1;}).finally(()=>closePools());
