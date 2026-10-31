import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {getPool} from '../db';
import {ApiError} from '../http';
import {limit as limitOperatorAction} from '../organizations';
import type {AccountUser} from '../organization-contracts';
import {NotificationPayloadSchema,createSlackAdapter,notificationDeliveryConfigured,validWebhook,publicOrigin,notificationRoutes,categoryMessages,type NotificationAdapter,type NotificationPayload,type DeliveryResult,type ErrorCategory} from './adapter';
export * from './adapter';
export const MAX_NOTIFICATION_ATTEMPTS=5;
export const NOTIFICATION_LEASE_MS=30000;
const salesRoute=notificationRoutes.find(route=>route.event==='sales.inquiry.created'&&route.enabled)!;
const EVENT=salesRoute.event,CHANNEL=salesRoute.channel;
const disabledCategory=():ErrorCategory=>validWebhook(process.env.SLACK_SALES_WEBHOOK_URL)&&publicOrigin(process.env.BORDERLESS_PUBLIC_URL)?'delivery_disabled':'configuration';
export type NotificationStatus='Pending'|'Sent'|'Failed'|'Retry Scheduled'|'Disabled';
type Row={id:string;aggregate_id:string;event:string;channel:string;status:NotificationStatus;attempts:number;next_attempt_at:Date|null;lease_token:string|null;lease_expires_at:Date|null;error_category:ErrorCategory|null;uncertain:boolean;provider_message_id:string|null;created_at:Date;updated_at:Date;sent_at:Date|null;payload:NotificationPayload};
const iso=(value:unknown)=>value?new Date(value as string|Date).toISOString():null;
export function notificationRecord(row:Row){
 const category=row.error_category&&Object.hasOwn(categoryMessages,row.error_category)?row.error_category:null;
 return {id:row.id,inquiryId:row.aggregate_id,event:row.event,channel:row.channel,status:row.status,attempts:row.attempts,nextAttemptAt:iso(row.next_attempt_at),errorCategory:category,lastError:category?categoryMessages[category]:null,uncertain:row.uncertain,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),sentAt:iso(row.sent_at),canRetry:notificationDeliveryConfigured()&&['Failed','Retry Scheduled','Disabled'].includes(row.status)&&(!row.lease_token||!row.lease_expires_at||new Date(row.lease_expires_at).getTime()<=Date.now())};
}
async function workerTransaction<T>(run:(client:PoolClient)=>Promise<T>):Promise<T>{
 const client=await getPool().connect();
 try{await client.query('BEGIN');await client.query("SELECT set_config('borderless.notification_worker','on',true)");const result=await run(client);await client.query('COMMIT');return result;}
 catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
/** Caller supplies the inquiry's existing checked-out transaction client. */
export async function enqueueNotification(client:Pick<PoolClient,'query'>,input:NotificationPayload):Promise<string>{
 const payload=NotificationPayloadSchema.parse(input),id=randomUUID(),enabled=notificationDeliveryConfigured();
 const previous=(await client.query("SELECT current_setting('borderless.notification_worker',true) AS flag")).rows[0]?.flag||'';
 await client.query("SELECT set_config('borderless.notification_worker','on',true)");
 try{
  const row=(await client.query("INSERT INTO notification_outbox(id,event,channel,aggregate_id,status,attempts,next_attempt_at,error_category,uncertain,payload,created_at,updated_at) VALUES($1,$2,$3,$4,$5,0,now(),$6,false,$7,now(),now()) ON CONFLICT(event,channel,aggregate_id) DO NOTHING RETURNING id",[id,EVENT,CHANNEL,payload.inquiryId,enabled?'Pending':'Disabled',enabled?null:disabledCategory(),payload])).rows[0];
  if(row)return row.id;
  const existing=(await client.query('SELECT id FROM notification_outbox WHERE event=$1 AND channel=$2 AND aggregate_id=$3',[EVENT,CHANNEL,payload.inquiryId])).rows[0];
  if(!existing)throw new Error('Notification deduplication failed.');return existing.id;
 }finally{await client.query("SELECT set_config('borderless.notification_worker',$1,true)",[previous]);}
}
export type ProcessNotificationOptions={adapter?:NotificationAdapter;testOnly?:boolean;limit?:number;now?:()=>Date;timeoutMs?:number};
function testAdapter(options:ProcessNotificationOptions){return options.testOnly===true&&Boolean(options.adapter)&&process.env.NODE_ENV!=='production';}
function boundedSend(adapter:NotificationAdapter,payload:NotificationPayload,timeoutMs:number):Promise<DeliveryResult>{
 const controller=new AbortController();
 return new Promise(resolve=>{
  let settled=false;
  const finish=(result:DeliveryResult)=>{if(!settled){settled=true;clearTimeout(timer);resolve(result);}};
  const timer=setTimeout(()=>{controller.abort();finish({kind:'failed',category:'timeout',retryable:true,uncertain:true});},timeoutMs);
  Promise.resolve().then(()=>adapter.send(payload,{signal:controller.signal})).then(finish,()=>finish({kind:'failed',category:'network',retryable:true,uncertain:true}));
 });
}
export async function processNotifications(options:ProcessNotificationOptions={}){
 const now=()=>options.now?.()??new Date(),stats={processed:0,sent:0,failed:0,retryScheduled:0,disabled:0,recovered:0};
 const allowed=testAdapter(options)||notificationDeliveryConfigured();
 const limit=Math.min(5,Math.max(1,Math.floor(options.limit??1))),adapter=testAdapter(options)?options.adapter!:createSlackAdapter();
 const claimed=await workerTransaction(async client=>{
  const at=now();
  const recovered=await client.query("UPDATE notification_outbox SET status=CASE WHEN attempts>=$1 THEN 'Failed' ELSE 'Retry Scheduled' END,error_category='lease_expired',uncertain=true,next_attempt_at=$2,lease_token=NULL,lease_expires_at=NULL,updated_at=$2 WHERE lease_token IS NOT NULL AND lease_expires_at<=$2 AND status IN ('Pending','Retry Scheduled')",[MAX_NOTIFICATION_ATTEMPTS,at]);stats.recovered=recovered.rowCount??0;
  if(!allowed){const disabled=await client.query("UPDATE notification_outbox SET status='Disabled',error_category=$3,updated_at=$1 WHERE channel=$2 AND status IN ('Pending','Retry Scheduled') AND lease_token IS NULL",[at,CHANNEL,disabledCategory()]);stats.disabled=disabled.rowCount??0;return [] as Row[];}
  // Slack Retry-After applies to the destination, not just one inquiry.
  // Persisted rate-limit rows keep every worker off this channel until due.
  const cooling=(await client.query("SELECT 1 FROM notification_outbox WHERE channel=$1 AND status IN ('Pending','Retry Scheduled','Failed') AND error_category='rate_limited' AND next_attempt_at>$2 LIMIT 1",[CHANNEL,at])).rowCount;
  if(cooling)return [] as Row[];
  await client.query("UPDATE notification_outbox SET status='Failed',error_category='retry_exhausted',updated_at=$1 WHERE channel=$2 AND status IN ('Pending','Retry Scheduled') AND attempts>=$3 AND lease_token IS NULL",[at,CHANNEL,MAX_NOTIFICATION_ATTEMPTS]);
  const rows=(await client.query("SELECT * FROM notification_outbox WHERE channel=$1 AND status IN ('Pending','Retry Scheduled') AND lease_token IS NULL AND next_attempt_at<=$2 AND attempts<$3 ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $4",[CHANNEL,at,MAX_NOTIFICATION_ATTEMPTS,limit])).rows as Row[];
  for(const row of rows){row.lease_token=randomUUID();row.attempts++;
   await client.query("UPDATE notification_outbox SET status='Pending',attempts=$1,lease_token=$2,lease_expires_at=$3,updated_at=$4 WHERE id=$5",[row.attempts,row.lease_token,new Date(at.getTime()+NOTIFICATION_LEASE_MS),at,row.id]);
  }
  return rows;
 });
 await Promise.all(claimed.map(async row=>{
  const parsed=NotificationPayloadSchema.safeParse(row.payload);
  const result:DeliveryResult=parsed.success?await boundedSend(adapter,parsed.data,Math.max(1,Math.min(6000,options.timeoutMs??6000))):{kind:'failed',category:'invalid_payload',retryable:false,uncertain:false};
  const at=now();let status:NotificationStatus,error:ErrorCategory|null=null,next:Date|null=null,uncertain=row.uncertain,messageId:string|null=null;
  if(result.kind==='sent'){status='Sent';messageId=result.providerMessageId??null;}
  else if(result.kind==='disabled'){status='Disabled';error=Object.hasOwn(categoryMessages,result.category)?result.category:'invalid_response';}
  else{
   uncertain=uncertain||result.uncertain;error=Object.hasOwn(categoryMessages,result.category)?result.category:'invalid_response';
   if(result.retryable&&row.attempts<MAX_NOTIFICATION_ATTEMPTS){status='Retry Scheduled';const seconds=Math.max(Math.min(3600,30*2**(row.attempts-1)),Math.min(7*86400,Math.max(0,result.retryAfterSeconds??0)));next=new Date(at.getTime()+seconds*1000);}
   else{status='Failed';if(error==='rate_limited'&&result.retryAfterSeconds&&result.retryAfterSeconds<=7*86400)next=new Date(at.getTime()+result.retryAfterSeconds*1000);}
  }
  const updated=await workerTransaction(client=>client.query('UPDATE notification_outbox SET status=$1,error_category=$2,uncertain=$3,next_attempt_at=$4,provider_message_id=$5,sent_at=$6,lease_token=NULL,lease_expires_at=NULL,updated_at=$7 WHERE id=$8 AND lease_token=$9',[status,error,uncertain,next,messageId,status==='Sent'?at:null,at,row.id,row.lease_token]));
  if(!updated.rowCount)return;
  stats.processed++;if(status==='Sent')stats.sent++;else if(status==='Failed')stats.failed++;else if(status==='Disabled')stats.disabled++;else stats.retryScheduled++;
 }));
 return stats;
}
export async function retryNotification(user:AccountUser,id:string,inquiryId:string,options:{testOnly?:boolean}={}){
 if(!id||id.length>160||!inquiryId||inquiryId.length>160)throw new ApiError(400,'VALIDATION','Notification and inquiry identifiers are required.');
 await limitOperatorAction(user.id,'approvals');
 const {withPlatformActor}=await import('../billing/inquiries');
 return withPlatformActor(user,async(client:PoolClient)=>{
  const row=(await client.query('SELECT * FROM notification_outbox WHERE id=$1 AND aggregate_id=$2 FOR UPDATE',[id,inquiryId])).rows[0] as Row|undefined;
  if(!row)throw new ApiError(404,'NOT_FOUND','Notification not found for this inquiry.');
  if(!['Failed','Retry Scheduled','Disabled'].includes(row.status)||(row.lease_token&&row.lease_expires_at&&new Date(row.lease_expires_at).getTime()>Date.now()))throw new ApiError(409,'NOTIFICATION_STATE','A pending, leased or sent notification cannot be retried.');
  if(!(options.testOnly&&process.env.NODE_ENV!=='production')&&!notificationDeliveryConfigured())throw new ApiError(503,'NOTIFICATION_DISABLED','Production Slack delivery must be explicitly enabled and configured before retry.');
  // Manual retry must not bypass Slack's persisted destination cooldown.
  const cooldown=row.error_category==='rate_limited'&&row.next_attempt_at&&new Date(row.next_attempt_at).getTime()>Date.now()?row.next_attempt_at:null;
  const updated=(await client.query("UPDATE notification_outbox SET status='Pending',attempts=0,next_attempt_at=$2,lease_token=NULL,lease_expires_at=NULL,error_category=$3,updated_at=now() WHERE id=$1 RETURNING *",[id,cooldown??new Date(),cooldown?'rate_limited':null])).rows[0] as Row;
  await client.query("INSERT INTO audit_logs(id,actor_id,action,detail,created_at) VALUES($1,$2,'notification.retry_requested',$3,now())",[randomUUID(),user.id,{notificationId:id,inquiryId,previousAttempts:row.attempts,uncertain:row.uncertain}]);
  return notificationRecord(updated);
 });
}
const globalWorker=globalThis as typeof globalThis&{borderlessNotificationTimer?:ReturnType<typeof setInterval>};
export function startNotificationWorker(){
 if(process.env.NODE_ENV!=='production'||globalWorker.borderlessNotificationTimer)return;
 const tick=()=>void processNotifications().catch(()=>console.error('Notification worker could not complete its database operation.'));
 const timer=setInterval(tick,10000);timer.unref();globalWorker.borderlessNotificationTimer=timer;
 tick();
}
