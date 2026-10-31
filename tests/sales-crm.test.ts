import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {register} from './helpers';
import {organizationService,transaction} from '../src/lib/organizations';
import {billingService} from '../src/lib/billing';
import {inquiryService,syncPlatformOperators,withPlatformActor} from '../src/lib/billing/inquiries';
import {enqueueNotification} from '../src/lib/notifications';
import {getPool,getAuthPool} from '../src/lib/db';
const code=(expected:string)=>(error:unknown)=>Boolean(error&&typeof error==='object'&&'code' in error&&error.code===expected);
async function fixture(){
 const owner=await register('crm-company');const organization=await organizationService.create(owner.user,{name:'CRM company '+randomUUID()});
 await billingService.selectPlan(owner.user,organization.id,'Enterprise');
 return {owner,organization};
}

test('CRM pipeline, real operator assignment and append-only private notes never provision Enterprise access',async()=>{
 const previous=process.env.BORDERLESS_PLATFORM_ADMIN_IDS;
 const {owner,organization}=await fixture(),operator=await register('crm-operator'),second=await register('crm-assignee');
 try{
  process.env.BORDERLESS_PLATFORM_ADMIN_IDS=operator.user.id+','+second.user.id;
  await syncPlatformOperators();
  const submitted=await billingService.requestEnterprise(owner.user,organization.id,{notes:'Customer introduction '+randomUUID()});const id=submitted.enterpriseRequest!.id;
  const unchanged=(await getPool().query('SELECT to_jsonb(o) AS organization,to_jsonb(s) AS subscription FROM organizations o JOIN subscriptions s ON s.organization_id=o.id WHERE o.id=$1',[organization.id])).rows[0];
  const initial=await inquiryService.get(operator.user,id);assert.equal(initial.inquiry.salesStatus,'New');assert.equal(initial.inquiry.assigneeId,null);
  assert.ok(initial.activity.some(event=>event.action==='sales.inquiry_created'));
  await assert.rejects(inquiryService.update(owner.user,id,{salesStatus:'Won'}),code('PLATFORM_ADMIN_REQUIRED'));
  await assert.rejects(inquiryService.update(operator.user,id,{assigneeId:owner.user.id}),code('ASSIGNEE_INVALID'));
  const assigned=await inquiryService.update(operator.user,id,{salesStatus:'Contacted',assigneeId:second.user.id});assert.equal(assigned.assigneeId,second.user.id);assert.equal(assigned.assigneeName,second.user.name);
  const repeated=await inquiryService.update(operator.user,id,{salesStatus:'Contacted',assigneeId:second.user.id});assert.equal(repeated.updatedAt,assigned.updatedAt);
  await inquiryService.update(operator.user,id,{salesStatus:'Negotiating'});const won=await inquiryService.update(operator.user,id,{salesStatus:'Won'});
  assert.equal(won.salesStatus,'Won');assert.equal(won.status,'Pending','sales opportunity state is separate from legacy handling and contract execution');
  const marker='PRIVATE-STAFF-NOTE-'+randomUUID()+' literal %_';const note=await inquiryService.addNote(operator.user,id,{body:marker});
  const detail=await inquiryService.get(operator.user,id);assert.equal(detail.notes[0].id,note.id);assert.equal(detail.notes[0].authorId,operator.user.id);
  assert.ok(detail.activity.some(event=>event.action==='sales.note_added'));assert.ok(detail.activity.some(event=>event.action==='sales.inquiry_updated'));
  const matches=await inquiryService.list(operator.user,{salesStatus:'Won',assigneeId:second.user.id,q:marker});assert.ok(matches.inquiries.some(item=>item.id===id));
  assert.ok(matches.assignees.some(person=>person.id===second.user.id));assert.ok(!matches.assignees.some(person=>person.id===owner.user.id));
  assert.ok(!(await inquiryService.list(operator.user,{assigneeId:'unassigned',q:marker})).inquiries.some(item=>item.id===id));
  await assert.rejects(inquiryService.get(owner.user,id),code('PLATFORM_ADMIN_REQUIRED'));
  assert.ok(!JSON.stringify(await billingService.get(owner.user,organization.id)).includes(marker));
  await assert.rejects(withPlatformActor(operator.user,client=>client.query('UPDATE sales_inquiry_notes SET body=$1 WHERE id=$2',['overwrite',note.id])),code('42501'));
  await assert.rejects(withPlatformActor(operator.user,client=>client.query('DELETE FROM sales_inquiry_notes WHERE id=$1',[note.id])),code('42501'));
  assert.equal((await getPool().query('SELECT id FROM sales_inquiry_notes WHERE id=$1',[note.id])).rows.length,0,'unscoped runtime RLS hides internal notes');
  await assert.rejects(getAuthPool().query('SELECT id FROM sales_inquiry_notes LIMIT 1'),code('42501'));
  assert.deepEqual((await getPool().query('SELECT to_jsonb(o) AS organization,to_jsonb(s) AS subscription FROM organizations o JOIN subscriptions s ON s.organization_id=o.id WHERE o.id=$1',[organization.id])).rows[0],unchanged);
  delete process.env.BORDERLESS_PLATFORM_ADMIN_IDS;await syncPlatformOperators();
  assert.equal((await getPool().query('SELECT assignee_id FROM enterprise_requests WHERE id=$1',[id])).rows[0].assignee_id,null);
  const revoked=(await getPool().query("SELECT actor_id,detail FROM audit_logs WHERE action='platform.allowlist_revoked' AND detail->>'userId'=$1",[second.user.id])).rows;
  assert.ok(revoked.some(row=>row.actor_id===null&&row.detail.source==='server_environment'));
  await assert.rejects(inquiryService.get(operator.user,id),code('PLATFORM_ADMIN_REQUIRED'));
 }finally{if(previous===undefined)delete process.env.BORDERLESS_PLATFORM_ADMIN_IDS;else process.env.BORDERLESS_PLATFORM_ADMIN_IDS=previous;await syncPlatformOperators();}
});

test('actual inquiry retries create exactly one minimal outbox record and failed transactions retain neither inquiry nor delivery',async()=>{
 const previous=process.env.BORDERLESS_PLATFORM_ADMIN_IDS;
 const {owner,organization}=await fixture(),operator=await register('crm-delivery-operator');
 try{
  process.env.BORDERLESS_PLATFORM_ADMIN_IDS=operator.user.id;
  const idempotencyKey=randomUUID(),notes='Private customer detail '+randomUUID();
  const [first,second]=await Promise.all([billingService.requestEnterprise(owner.user,organization.id,{notes,idempotencyKey}),billingService.requestEnterprise(owner.user,organization.id,{notes,idempotencyKey})]);
  const id=first.enterpriseRequest!.id;assert.equal(second.enterpriseRequest!.id,id);
  assert.equal((await getPool().query('SELECT id FROM enterprise_requests WHERE organization_id=$1',[organization.id])).rows.length,1);
  await assert.rejects(billingService.requestEnterprise(owner.user,organization.id,{notes:'Changed request body',idempotencyKey}));
  await withPlatformActor(operator.user,async client=>{
   const rows=(await client.query('SELECT * FROM notification_outbox WHERE aggregate_id=$1',[id])).rows;assert.equal(rows.length,1);
   assert.deepEqual(Object.keys(rows[0].payload).sort(),['inquiryId','companyName','inquiryType','createdAt'].sort());
   assert.equal(rows[0].payload.inquiryId,id);assert.equal(rows[0].payload.companyName,organization.name);
   assert.ok(!JSON.stringify(rows[0].payload).includes(notes));assert.ok(!JSON.stringify(rows[0].payload).includes(owner.user.email));
   assert.equal(rows[0].status,'Disabled','missing delivery configuration is not reported as sent');
  });
  const rollbackId=randomUUID();
  await assert.rejects(transaction(async client=>{
   await client.query("INSERT INTO enterprise_requests(id,organization_id,requested_by,status,notes) VALUES($1,$2,$3,'Pending',$4)",[rollbackId,organization.id,owner.user.id,'Rollback fixture']);
   await enqueueNotification(client,{inquiryId:rollbackId,companyName:organization.name,inquiryType:'Enterprise introduction',createdAt:new Date().toISOString()});
   throw new Error('Intentional transaction rollback fixture');
  }),/Intentional transaction rollback/);
  assert.equal((await getPool().query('SELECT id FROM enterprise_requests WHERE id=$1',[rollbackId])).rows.length,0);
  await withPlatformActor(operator.user,async client=>{
   assert.equal((await client.query('SELECT id FROM notification_outbox WHERE aggregate_id=$1',[rollbackId])).rows.length,0);
   assert.equal((await client.query('SELECT id FROM sales_inquiry_activity WHERE inquiry_id=$1',[rollbackId])).rows.length,0);
  });
  const detail=await inquiryService.get(operator.user,id);assert.equal(detail.notifications.length,1);assert.ok(!('payload' in detail.notifications[0]));assert.equal(detail.notifications[0].canRetry,false);
 }finally{if(previous===undefined)delete process.env.BORDERLESS_PLATFORM_ADMIN_IDS;else process.env.BORDERLESS_PLATFORM_ADMIN_IDS=previous;await syncPlatformOperators();}
});
