import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {getAuth,requireUser} from '../src/lib/auth';
import {organizationService} from '../src/lib/organizations';
import {billingService} from '../src/lib/billing';
import {getPool,closePools} from '../src/lib/db';
import {createSlackAdapter,validWebhook,processNotifications} from '../src/lib/notifications';

// Deliberate, bounded live smoke. Never invoked by npm test/build/startup.
const checkpoint=resolve('.local/slack-live-verification.json');
type Report={runId:string;startedAt:string;connectionAttempted?:boolean;connectionStatus?:string;connectionHttpStatus?:number;inquiryId?:string;organizationId?:string;notificationId?:string;notificationAttempted?:boolean;notificationHttpStatus?:number;outboxBefore?:string;outboxAfter?:string;outboxAttempts?:number;duplicatePrevented?:boolean;completed?:boolean;finishedAt?:string;failure?:string};
let report:Report;
async function save(){await mkdir(resolve('.local'),{recursive:true,mode:0o700});await writeFile(checkpoint,JSON.stringify(report,null,2),{mode:0o600});}
async function outbox(inquiryId:string){
 const client=await getPool().connect();
 try{await client.query('BEGIN');await client.query("SELECT set_config('borderless.notification_worker','on',true)");const rows=(await client.query('SELECT id,status,attempts,sent_at FROM notification_outbox WHERE aggregate_id=$1',[inquiryId])).rows;await client.query('COMMIT');return rows;}
 catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function main(){
 if(!process.argv.includes('--send-approved-two'))throw new Error('Explicit bounded live-send invocation required.');
 if(!validWebhook(process.env.SLACK_SALES_WEBHOOK_URL))throw new Error('SLACK_SALES_WEBHOOK_URL is missing or invalid; no send attempted.');
 for(const key of ['DATABASE_URL_RUNTIME','DATABASE_URL_AUTH']){
  const url=new URL(process.env[key]||'');if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('This verification requires local PostgreSQL.');
 }
 try{
  const saved=JSON.parse(await readFile(checkpoint,'utf8')) as Report;
  console.log(JSON.stringify({event:'slack_verification_existing',...saved}));
  if(!saved.completed)process.exitCode=1;
  // An uncertain previous POST must never be repeated by rerunning this script.
  return;
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 report={runId:randomUUID(),startedAt:new Date().toISOString()};await save();
 await getPool().query('SELECT 1');
 const originalMode=process.env.NODE_ENV,originalEnabled=process.env.SLACK_SALES_DELIVERY_ENABLED,originalFetch=globalThis.fetch;
 const allowedIds=new Set<string>();let calls=0;const statuses:number[]=[];
 globalThis.fetch=async(input,init)=>{
  const body=JSON.parse(String(init?.body||'{}'));
  const fields=body.blocks?.find((block:{fields?:unknown})=>block.fields)?.fields as {text:string}[]|undefined;
  const id=fields?.find(field=>field.text.startsWith('Inquiry: '))?.text.slice('Inquiry: '.length);
  if(String(input)!==validWebhook(process.env.SLACK_SALES_WEBHOOK_URL)||!id||!allowedIds.has(id)||calls>=2)throw new Error('Live-send scope denied.');
  calls++;const response=await originalFetch(input,init);statuses.push(response.status);return response;
 };
 try{
  // Opt-in exists only in this standalone local process; no env file is edited.
  Object.assign(process.env,{NODE_ENV:'production'});process.env.SLACK_SALES_DELIVERY_ENABLED='true';
  const connectionId='connection-test-'+report.runId;allowedIds.add(connectionId);
  report.connectionAttempted=true;await save();
  const connection=await createSlackAdapter().send({inquiryId:connectionId,companyName:'Borderless Synthetic Connection Test',inquiryType:'Authorized connection test (not a customer inquiry)',createdAt:new Date().toISOString()},{signal:new AbortController().signal});
  report.connectionStatus=connection.kind;report.connectionHttpStatus=statuses[0];await save();
  if(connection.kind!=='sent')throw new Error('Connection delivery was not acknowledged; no automatic live retry.');

  Object.assign(process.env,{NODE_ENV:'development'});
  const origin=process.env.BETTER_AUTH_URL!;
  const signup=await getAuth().handler(new Request(origin+'/api/auth/sign-up/email',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Synthetic Slack Verification',email:'slack-verification-'+report.runId+'@example.com',password:randomBytes(32).toString('base64url')})}));
  if(!signup.ok)throw new Error('Synthetic account registration failed.');
  const cookie=signup.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const user=await requireUser(new Request(origin,{headers:{cookie}}));
  const organization=await organizationService.create(user,{name:'Borderless Synthetic Enterprise '+report.runId.slice(0,8)});
  await billingService.selectPlan(user,organization.id,'Enterprise');
  Object.assign(process.env,{NODE_ENV:'production'});
  const input={notes:'Synthetic Slack integration verification only. No customer, legal or contractual information.',idempotencyKey:randomUUID()};
  const inquiry=await billingService.requestEnterprise(user,organization.id,input);
  report.organizationId=organization.id;report.inquiryId=inquiry.enterpriseRequest!.id;
  const before=await outbox(report.inquiryId!);if(before.length!==1||before[0].status!=='Pending')throw new Error('Expected exactly one pending outbox notification.');
  report.notificationId=before[0].id;report.outboxBefore=before[0].status;await save();allowedIds.add(report.inquiryId!);
  report.notificationAttempted=true;await save();
  const sent=await processNotifications({notificationIds:[report.notificationId!],limit:1});
  const after=await outbox(report.inquiryId!);report.outboxAfter=after[0]?.status;report.outboxAttempts=after[0]?.attempts;report.notificationHttpStatus=statuses[1];await save();
  if(sent.sent!==1||after[0]?.status!=='Sent'||!after[0]?.sent_at)throw new Error('Inquiry notification was not acknowledged; inspect stored result before any live retry.');
  const duplicate=await billingService.requestEnterprise(user,organization.id,input);
  const rerun=await processNotifications({notificationIds:[report.notificationId!],limit:1});
  const final=await outbox(report.inquiryId!);
  report.duplicatePrevented=duplicate.enterpriseRequest?.id===report.inquiryId&&final.length===1&&final[0].attempts===1&&rerun.processed===0&&calls===2;
  if(!report.duplicatePrevented)throw new Error('Duplicate prevention verification failed.');
  report.completed=true;report.finishedAt=new Date().toISOString();await save();
  console.log(JSON.stringify({event:'slack_verification_complete',...report,liveHttpRequests:calls,adminLinkIncluded:false}));
 }finally{
  globalThis.fetch=originalFetch;
  if(originalMode===undefined)Reflect.deleteProperty(process.env,'NODE_ENV');else Object.assign(process.env,{NODE_ENV:originalMode});
  if(originalEnabled===undefined)delete process.env.SLACK_SALES_DELIVERY_ENABLED;else process.env.SLACK_SALES_DELIVERY_ENABLED=originalEnabled;
 }
}
main().catch(async()=>{if(report){report.failure='Verification stopped; inspect safe delivery status and stored outbox before retrying.';await save().catch(()=>{});}console.error('Slack live verification did not complete. No raw URL, token or provider error is logged.');process.exitCode=1;}).finally(()=>closePools());
