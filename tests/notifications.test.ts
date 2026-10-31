import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {getPool} from '../src/lib/db';
import {ApiError} from '../src/lib/http';
import {register} from './helpers';
import {createSlackAdapter,validWebhook,publicOrigin,notificationDeliveryConfigured,enqueueNotification,processNotifications,retryNotification,MAX_NOTIFICATION_ATTEMPTS,type NotificationAdapter,type NotificationPayload} from '../src/lib/notifications';
const payload=(id=randomUUID()):NotificationPayload=>({inquiryId:id,companyName:'Synthetic company',inquiryType:'Enterprise',createdAt:new Date().toISOString()});
const environment=()=>({webhook:process.env.SLACK_SALES_WEBHOOK_URL,origin:process.env.BORDERLESS_PUBLIC_URL,enabled:process.env.SLACK_SALES_DELIVERY_ENABLED,node:process.env.NODE_ENV});
function restore(env:ReturnType<typeof environment>){for(const [key,value] of Object.entries({SLACK_SALES_WEBHOOK_URL:env.webhook,BORDERLESS_PUBLIC_URL:env.origin,SLACK_SALES_DELIVERY_ENABLED:env.enabled,NODE_ENV:env.node}))if(value===undefined)Reflect.deleteProperty(process.env,key);else Object.assign(process.env,{[key]:value});}
function syntheticConfig(){Object.assign(process.env,{SLACK_SALES_WEBHOOK_URL:'https://hooks.slack.com/services/TTEST/BTEST/SYNTHETIC_TOKEN',BORDERLESS_PUBLIC_URL:'https://borderless.example.com',SLACK_SALES_DELIVERY_ENABLED:'true',NODE_ENV:'test'});}
test('Slack adapter validates destinations and never performs native delivery in development',async t=>{
 const env=environment(),native=globalThis.fetch;
 try{
  syntheticConfig();let nativeCalls=0;globalThis.fetch=async()=>{nativeCalls++;throw new Error('Unexpected native network request');};
  await t.test('destination validation rejects redirects, credentials, localhost and alternate hosts',()=>{
   for(const value of ['http://hooks.slack.com/services/T/B/X','https://hooks.slack.com.evil.example/services/T/B/X','https://user:secret@hooks.slack.com/services/T/B/X','https://hooks.slack.com/services/T/B/X?token=bad','https://127.0.0.1/services/T/B/X','https://hooks.slack.com/not-webhook'])assert.equal(validWebhook(value),null);
   for(const value of ['http://borderless.example.com','https://localhost','https://127.0.0.1','https://[::1]','https://internal.local','https://127.0.0.1.nip.io','https://user:secret@borderless.example.com','https://borderless.example.com/subpath'])assert.equal(publicOrigin(value),null);
  });
  await t.test('native adapter remains Disabled despite a synthetic valid URL and enabled flag in tests',async()=>{
   assert.equal((await createSlackAdapter().send(payload(),{signal:new AbortController().signal})).kind,'disabled');assert.equal(nativeCalls,0);
  });
  await t.test('public application origin is optional for configuration but native sends stay production opt-in',async()=>{
   try{
    Object.assign(process.env,{NODE_ENV:'production',SLACK_SALES_DELIVERY_ENABLED:'true'});delete process.env.BORDERLESS_PUBLIC_URL;
    assert.equal(notificationDeliveryConfigured(),true);
    process.env.BORDERLESS_PUBLIC_URL='https://localhost';assert.equal(notificationDeliveryConfigured(),true);
    process.env.SLACK_SALES_DELIVERY_ENABLED='false';assert.equal(notificationDeliveryConfigured(),false);
    process.env.SLACK_SALES_DELIVERY_ENABLED='true';delete process.env.SLACK_SALES_WEBHOOK_URL;
    assert.equal(notificationDeliveryConfigured(),false);
    assert.deepEqual(await createSlackAdapter().send(payload(),{signal:new AbortController().signal}),{kind:'disabled',category:'configuration'});assert.equal(nativeCalls,0);
   }finally{syntheticConfig();}
  });
  await t.test('mocked delivery omits the admin link when the public origin is absent or invalid',async()=>{
   try{
    for(const origin of [undefined,'https://localhost','http://127.0.0.1','https://borderless.example.com/subpath']){
     if(origin===undefined)delete process.env.BORDERLESS_PUBLIC_URL;else process.env.BORDERLESS_PUBLIC_URL=origin;
     let message:Record<string,any>|undefined;
     const result=await createSlackAdapter({testOnly:true,transport:async(_url,options)=>{message=JSON.parse(options.body as string);return new Response('ok',{status:200});}}).send(payload(),{signal:new AbortController().signal});
     assert.equal(result.kind,'sent');assert.ok(message);assert.ok(message.blocks.every((block:{type:string})=>block.type!=='actions'));
     const body=JSON.stringify(message);assert.ok(!body.includes('Open inquiry'));assert.ok(!body.includes('http://'));assert.ok(!body.includes('https://'));assert.ok(!body.includes('localhost'));assert.equal(nativeCalls,0);
    }
   }finally{syntheticConfig();}
  });
  await t.test('mock transport contains minimal plain text fields and canonical admin link only',async()=>{
   let message:Record<string,any>|undefined;
   const adapter=createSlackAdapter({testOnly:true,transport:async(url,options)=>{
    assert.equal(new URL(url).hostname,'hooks.slack.com');assert.equal(options.redirect,'error');message=JSON.parse(options.body as string);return new Response('ok');
   }});
   const result=await adapter.send({...payload(),companyName:'Acme https://127.0.0.1 contact@example.com <!channel>'},{signal:new AbortController().signal});
   assert.equal(result.kind,'sent');assert.equal('httpStatus' in result?result.httpStatus:undefined,200);assert.ok(message);const body=JSON.stringify(message);
   assert.ok(!body.includes('127.0.0.1'));assert.ok(!body.includes('contact@example.com'));assert.ok(!body.includes('<!channel>'));
   assert.equal(message.blocks[2].elements[0].url.split('?')[0],'https://borderless.example.com/admin/inquiries');assert.equal(nativeCalls,0);
  });
  await t.test('provider status and transport failures become scrubbed categories',async()=>{
   for(const [status,body,category,retryable,uncertain] of [[429,'rate limited','rate_limited',true,false],[400,'secret provider body','provider_rejected',false,false],[503,'secret provider body','provider_unavailable',true,true],[200,'not-ok secret','invalid_response',false,true]] as const){
    const result=await createSlackAdapter({testOnly:true,transport:async()=>new Response(body,{status,headers:{'Retry-After':'120'}})}).send(payload(),{signal:new AbortController().signal});
    assert.equal(result.kind,'failed');if(result.kind!=='failed')throw new Error('Expected failure');assert.equal(result.category,category);assert.equal(result.retryable,retryable);assert.equal(result.uncertain,uncertain);assert.ok(!JSON.stringify(result).includes('secret'));if(status===429)assert.equal(result.retryAfterSeconds,120);
   }
   const result=await createSlackAdapter({testOnly:true,transport:async()=>{throw new Error('secret webhook token and URL');}}).send(payload(),{signal:new AbortController().signal});assert.deepEqual(result,{kind:'failed',category:'network',retryable:true,uncertain:true});
  });
 }finally{globalThis.fetch=native;restore(env);}
});
test('durable notification outbox uses real PostgreSQL and injected mocks only',async t=>{
 const owner=new Pool({connectionString:process.env.DIRECT_DATABASE_URL,max:1}),env=environment();
 const oldAdmins=process.env.BORDERLESS_PLATFORM_ADMIN_IDS;
 const ids:string[]=[];const operator=(await register('notification-operator')).user,ordinary=(await register('notification-user')).user;
 const now=new Date();
 const enqueue=async()=>{
  const client=await getPool().connect();try{await client.query('BEGIN');const item=payload();ids.push(item.inquiryId);const id=await enqueueNotification(client,item);await client.query('COMMIT');return {id,item};}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 };
 const ready=async(id:string,extra='')=>owner.query("UPDATE notification_outbox SET status='Pending',next_attempt_at=$1,lease_token=NULL,lease_expires_at=NULL "+extra+' WHERE id=$2',[new Date(now.getTime()-1000),id]);
 const row=async(id:string)=>(await owner.query('SELECT * FROM notification_outbox WHERE id=$1',[id])).rows[0];
 const success:NotificationAdapter={channel:'slack',send:async()=>({kind:'sent'})};
 try{
  syntheticConfig();process.env.BORDERLESS_PLATFORM_ADMIN_IDS=operator.id;
  await (await import('../src/lib/billing/inquiries')).syncPlatformOperators();
  await t.test('enqueue deduplicates transactionally and configuration-off stays Disabled',async()=>{
   const created=await enqueue();assert.equal((await row(created.id)).status,'Disabled');
   const client=await getPool().connect();try{await client.query('BEGIN');assert.equal(await enqueueNotification(client,created.item),created.id);await client.query('COMMIT');}finally{client.release();}
   assert.equal((await owner.query('SELECT count(*)::int count FROM notification_outbox WHERE aggregate_id=$1',[created.item.inquiryId])).rows[0].count,1);
   await ready(created.id);const result=await processNotifications();assert.equal(result.processed,0);assert.equal((await row(created.id)).status,'Disabled');
  });
  await t.test('two concurrent workers claim a notification once',async()=>{
   const created=await enqueue();await ready(created.id);let release!:()=>void,entered!:()=>void,calls=0;
   const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
   const adapter:NotificationAdapter={channel:'slack',send:async()=>{calls++;entered();await gate;return {kind:'sent'};}};
   const first=processNotifications({adapter,testOnly:true});await started;
   const second=await processNotifications({adapter,testOnly:true});assert.equal(second.processed,0);release();assert.equal((await first).sent,1);assert.equal(calls,1);assert.equal((await row(created.id)).attempts,1);
   await assert.rejects(retryNotification(operator,created.id,created.item.inquiryId,{testOnly:true}),(error:unknown)=>error instanceof ApiError&&error.code==='NOTIFICATION_STATE');
  });
  await t.test('429 waits for Retry-After before a mocked successful retry',async()=>{
   const created=await enqueue();await ready(created.id);
   const adapter:NotificationAdapter={channel:'slack',send:async()=>({kind:'failed',category:'rate_limited',retryable:true,uncertain:false,retryAfterSeconds:120})};
   assert.equal((await processNotifications({adapter,testOnly:true,now:()=>now})).retryScheduled,1);
   const scheduled=await row(created.id);assert.equal(scheduled.status,'Retry Scheduled');assert.ok(new Date(scheduled.next_attempt_at).getTime()>=now.getTime()+120000);
   assert.equal((await processNotifications({adapter:success,testOnly:true,now:()=>now})).processed,0);
   assert.equal((await processNotifications({adapter:success,testOnly:true,now:()=>new Date(now.getTime()+121000)})).sent,1);
  });
  await t.test('persisted 429 cooldown blocks other inquiries and concurrent workers until the channel is due',async()=>{
   const throttled=await enqueue(),other=await enqueue();await ready(throttled.id,',attempts=4');
   const adapter:NotificationAdapter={channel:'slack',send:async()=>({kind:'failed',category:'rate_limited',retryable:true,uncertain:false,retryAfterSeconds:120})};
   assert.equal((await processNotifications({adapter,testOnly:true,now:()=>now})).failed,1);
   await ready(other.id);
   assert.equal((await processNotifications({adapter:success,testOnly:true,now:()=>now})).processed,0);
   const beforeRetry=await row(throttled.id);
   await retryNotification(operator,throttled.id,throttled.item.inquiryId,{testOnly:true});
   const manual=await row(throttled.id);assert.equal(manual.status,'Pending');assert.equal(new Date(manual.next_attempt_at).getTime(),new Date(beforeRetry.next_attempt_at).getTime());assert.equal(manual.error_category,'rate_limited');
   await ready(other.id);let calls=0;
   const succeeding:NotificationAdapter={channel:'slack',send:async()=>{calls++;return {kind:'sent'};}};
   const before=await Promise.all([processNotifications({adapter:succeeding,testOnly:true,now:()=>now}),processNotifications({adapter:succeeding,testOnly:true,now:()=>new Date(now.getTime()+119000)})]);
   assert.equal(calls,0);assert.ok(before.every(result=>result.processed===0));assert.equal((await row(other.id)).attempts,0);
   const after=await processNotifications({adapter:succeeding,testOnly:true,limit:2,now:()=>new Date(now.getTime()+121000)});
   assert.equal(after.sent,2);assert.equal(calls,2);
  });
  await t.test('errors are scrubbed, retries bounded and manual retry is inquiry-bound and operator-only',async()=>{
   const created=await enqueue();await ready(created.id,',attempts=4');
   const failing:NotificationAdapter={channel:'slack',send:async()=>{throw new Error('DO_NOT_STORE https://secret.example/token');}};
   assert.equal((await processNotifications({adapter:failing,testOnly:true,now:()=>now})).failed,1);
   const failed=await row(created.id);assert.equal(failed.attempts,MAX_NOTIFICATION_ATTEMPTS);assert.equal(failed.error_category,'network');assert.equal(failed.uncertain,true);assert.ok(!JSON.stringify(failed).includes('DO_NOT_STORE'));
   await assert.rejects(retryNotification(ordinary,created.id,created.item.inquiryId,{testOnly:true}),(error:unknown)=>error instanceof ApiError&&error.status===403);
   await assert.rejects(retryNotification(operator,created.id,randomUUID(),{testOnly:true}),(error:unknown)=>error instanceof ApiError&&error.status===404);
   await assert.rejects(retryNotification(operator,created.id,created.item.inquiryId),(error:unknown)=>error instanceof ApiError&&error.status===503);
   await retryNotification(operator,created.id,created.item.inquiryId,{testOnly:true});assert.equal((await row(created.id)).attempts,0);assert.equal((await row(created.id)).uncertain,true);
   assert.equal((await processNotifications({adapter:success,testOnly:true})).sent,1);
  });
  await t.test('restart recovery of expired lease preserves uncertainty after a confirmed retry',async()=>{
   const created=await enqueue();await owner.query("UPDATE notification_outbox SET status='Pending',attempts=1,lease_token=$1,lease_expires_at=$2,next_attempt_at=$2 WHERE id=$3",[randomUUID(),new Date(now.getTime()-1000),created.id]);
   const result=await processNotifications({adapter:success,testOnly:true,now:()=>now});assert.equal(result.recovered,1);assert.equal(result.sent,1);
   const recovered=await row(created.id);assert.equal(recovered.attempts,2);assert.equal(recovered.uncertain,true);assert.equal(recovered.status,'Sent');
  });
  await t.test('bounded adapter timeout aborts and records uncertain retry',async()=>{
   const created=await enqueue();await ready(created.id);let aborted=false;
   const adapter:NotificationAdapter={channel:'slack',send:async(_payload,{signal})=>new Promise(()=>{signal.addEventListener('abort',()=>{aborted=true;});})};
   const result=await processNotifications({adapter,testOnly:true,timeoutMs:10,now:()=>now});assert.equal(result.retryScheduled,1);assert.equal(aborted,true);assert.equal((await row(created.id)).error_category,'timeout');
   await owner.query("UPDATE notification_outbox SET status='Disabled' WHERE id=$1",[created.id]);
  });
  await t.test('batch sends start concurrently and remain within the lease window',async()=>{
   const created=await Promise.all(Array.from({length:5},()=>enqueue()));for(const item of created)await ready(item.id);
   let release!:()=>void,allEntered!:()=>void,calls=0;
   const gate=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{allEntered=resolve;});
   const adapter:NotificationAdapter={channel:'slack',send:async()=>{if(++calls===5)allEntered();await gate;return {kind:'sent'};}};
   const running=processNotifications({adapter,testOnly:true,limit:10});
   try{
    await Promise.race([entered,new Promise((_resolve,reject)=>{ setTimeout(()=>reject(new Error('Batch was sequential')),500); })]);
    assert.equal(calls,5);const leases=(await owner.query('SELECT lease_expires_at FROM notification_outbox WHERE id=ANY($1)',[created.map(item=>item.id)])).rows;
    assert.ok(leases.every(lease=>new Date(lease.lease_expires_at).getTime()>Date.now()));
   }finally{release();}
   assert.equal((await running).sent,5);
  });
  await t.test('explicit notification IDs isolate delivery and every maintenance mutation from unrelated queue rows',async()=>{
   const target=await enqueue(),unrelated=await enqueue(),stale=await enqueue(),exhausted=await enqueue();
   for(const item of [target,unrelated,stale,exhausted])await ready(item.id);
   await owner.query('UPDATE notification_outbox SET lease_token=$1,lease_expires_at=$2 WHERE id=$3',[randomUUID(),new Date(now.getTime()-1000),stale.id]);
   await owner.query('UPDATE notification_outbox SET attempts=$1 WHERE id=$2',[MAX_NOTIFICATION_ATTEMPTS,exhausted.id]);
   const unrelatedIds=[unrelated.id,stale.id,exhausted.id];
   const snapshot=async()=>(await owner.query('SELECT * FROM notification_outbox WHERE id=ANY($1) ORDER BY id',[unrelatedIds])).rows;
   const before=await snapshot(),delivered:string[]=[];
   const adapter:NotificationAdapter={channel:'slack',send:async item=>{delivered.push(item.inquiryId);return {kind:'sent',httpStatus:200};}};
   const result=await processNotifications({adapter,testOnly:true,limit:5,now:()=>now,notificationIds:[target.id]});
   assert.equal(result.sent,1);assert.equal(result.recovered,0);assert.deepEqual(delivered,[target.item.inquiryId]);assert.deepEqual(await snapshot(),before);
   const disabledTarget=await enqueue();await ready(disabledTarget.id);
   const disabled=await processNotifications({notificationIds:[disabledTarget.id]});assert.equal(disabled.disabled,1);assert.equal((await row(disabledTarget.id)).status,'Disabled');assert.deepEqual(await snapshot(),before);
   await assert.rejects(processNotifications({adapter,testOnly:true,notificationIds:[]}),(error:unknown)=>error instanceof ApiError&&error.code==='VALIDATION');assert.deepEqual(await snapshot(),before);assert.deepEqual(delivered,[target.item.inquiryId]);
  });
 }finally{
  restore(env);if(oldAdmins===undefined)delete process.env.BORDERLESS_PLATFORM_ADMIN_IDS;else process.env.BORDERLESS_PLATFORM_ADMIN_IDS=oldAdmins;
  await owner.query('DELETE FROM notification_outbox WHERE aggregate_id=ANY($1)',[ids]);
  await owner.query('DELETE FROM audit_logs WHERE actor_id=ANY($1)',[[operator.id,ordinary.id]]);
  await owner.query('DELETE FROM platform_operator_grants WHERE user_id=ANY($1)',[[operator.id,ordinary.id]]);
  await owner.query('DELETE FROM "user" WHERE id=ANY($1)',[[operator.id,ordinary.id]]);await owner.end();
 }
});
