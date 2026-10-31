import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {register,testOrigin} from './helpers';
import {organizationService} from '../src/lib/organizations';
import {billingService} from '../src/lib/billing';
import {inquiryService,isPlatformAdmin,requirePlatformAdmin} from '../src/lib/billing/inquiries';
import {getPool} from '../src/lib/db';
const code=(expected:string)=>(error:unknown)=>Boolean(error&&typeof error==='object'&&'code' in error&&error.code===expected);
async function inquiryFixture(){
 const owner=await register('inquiry-owner');
 const organization=await organizationService.create(owner.user,{name:'Synthetic inquiry company '+randomUUID()});
 await billingService.selectPlan(owner.user,organization.id,'Enterprise');
 const submitted=await billingService.requestEnterprise(owner.user,organization.id,{notes:'Synthetic introduction inquiry; not a signed contract or payment.'});
 return {owner,organization,id:submitted.enterpriseRequest!.id};
}

test('operator inquiry inbox requires separate platform allowlist, records human review and never activates enterprise access',async()=>{
 const previous=process.env.BORDERLESS_PLATFORM_ADMIN_IDS,originalFetch=globalThis.fetch;
 const {owner,organization,id}=await inquiryFixture();const operator=await register('platform-inquiry-reviewer'),admin=await register('ordinary-org-admin');
 try{
  delete process.env.BORDERLESS_PLATFORM_ADMIN_IDS;
  assert.equal(isPlatformAdmin(null),false);assert.equal(isPlatformAdmin(owner.user),false);
  await assert.rejects(requirePlatformAdmin(new Request(testOrigin()+'/api/admin/inquiries')),code('ADMIN_AUTH_REQUIRED'));
  await assert.rejects(requirePlatformAdmin(new Request(testOrigin()+'/api/admin/inquiries',{headers:{cookie:owner.cookie}})),code('ADMIN_AUTH_REQUIRED'));
  await assert.rejects(inquiryService.list(owner.user),code('PLATFORM_ADMIN_REQUIRED'));
  const invitation=await organizationService.createInvite(owner.user,organization.id,{});await organizationService.join(admin.user,invitation.code);
  const pending=(await organizationService.detail(owner.user,organization.id)).requests.find(r=>r.userId===admin.user.id)!;
  await organizationService.decideRequest(owner.user,organization.id,pending.id,{decision:'approve',role:'Admin'});
  await assert.rejects(inquiryService.list(admin.user),code('PLATFORM_ADMIN_REQUIRED'));
  process.env.BORDERLESS_PLATFORM_ADMIN_IDS=' '+operator.user.id+' , '+operator.user.id+' ';
  assert.equal(isPlatformAdmin(operator.user),true);
  await assert.rejects(requirePlatformAdmin(new Request(testOrigin()+'/api/admin/inquiries',{headers:{cookie:operator.cookie}})),code('ADMIN_AUTH_REQUIRED'),'legacy service allowlist does not authenticate an ordinary browser session');
  let outbound=0;globalThis.fetch=async()=>{outbound++;throw new Error('Inquiry review must not send email or payment requests');};
  await assert.rejects(inquiryService.list(operator.user,{status:"Pending' OR true"}));
  const before=(await getPool().query('SELECT to_jsonb(o) AS organization,to_jsonb(s) AS subscription FROM organizations o JOIN subscriptions s ON s.organization_id=o.id WHERE o.id=$1',[organization.id])).rows[0];
  assert.equal(before.organization.status,'Draft');assert.equal(before.subscription.status,'Pending');
  // Existing server-recorded company details remain authoritative after renames.
  await getPool().query('UPDATE organizations SET name=$1 WHERE id=$2',['Renamed after introduction',organization.id]);
  const snapshotBefore=(await getPool().query('SELECT to_jsonb(o) AS organization,to_jsonb(s) AS subscription FROM organizations o JOIN subscriptions s ON s.organization_id=o.id WHERE o.id=$1',[organization.id])).rows[0];
  const listed=await inquiryService.list(operator.user,{status:'Pending'});assert.ok(listed.inquiries.length<=200);
  const inquiry=listed.inquiries.find(item=>item.id===id)!;assert.ok(inquiry);
  assert.equal(inquiry.companyName,organization.name);assert.equal(inquiry.requesterEmail,owner.user.email);assert.equal(inquiry.requesterName,owner.user.name);
  assert.equal(inquiry.status,'Pending');assert.equal(inquiry.reviewedAt,null);
  assert.deepEqual(Object.keys(inquiry).sort(),['id','organizationId','companyName','requesterName','requesterEmail','notes','status','createdAt','reviewedAt','reviewNotes','salesStatus','assigneeId','assigneeName','updatedAt'].sort());
  const reviewing=await inquiryService.review(operator.user,id,{status:'In Review',notes:'Platform operator reviewing the introduction inquiry.'});
  assert.equal(reviewing.status,'In Review');assert.ok(reviewing.reviewedAt);
  const closed=await inquiryService.review(operator.user,id,{status:'Closed',notes:'Inquiry handling closed. No contract executed and no paid access provisioned.'});
  assert.equal(closed.status,'Closed');assert.match(closed.reviewNotes,/No contract executed/);
  await assert.rejects(inquiryService.review(operator.user,id,{status:'Rejected',notes:'Cannot change a terminal record'}),code('INQUIRY_STATE'));
  await assert.rejects(inquiryService.review(operator.user,randomUUID(),{status:'Closed',notes:'Unknown request'}),code('NOT_FOUND'));
  assert.deepEqual((await getPool().query('SELECT to_jsonb(o) AS organization,to_jsonb(s) AS subscription FROM organizations o JOIN subscriptions s ON s.organization_id=o.id WHERE o.id=$1',[organization.id])).rows[0],snapshotBefore);
  const persisted=(await getPool().query('SELECT reviewed_by,review_notes,status FROM enterprise_requests WHERE id=$1',[id])).rows[0];
  assert.equal(persisted.reviewed_by,operator.user.id);assert.equal(persisted.status,'Closed');assert.equal(persisted.review_notes,closed.reviewNotes);
  const audits=(await getPool().query("SELECT actor_id,detail FROM audit_logs WHERE organization_id=$1 AND action='enterprise.inquiry_reviewed'",[organization.id])).rows;
  assert.equal(audits.length,2);assert.ok(audits.every(row=>row.actor_id===operator.user.id&&row.detail.contractExecuted===false&&row.detail.subscriptionActivated===false));
  assert.equal((await getPool().query('SELECT id FROM payment_events WHERE organization_id=$1',[organization.id])).rows.length,0);
  assert.equal(outbound,0);
  delete process.env.BORDERLESS_PLATFORM_ADMIN_IDS;
  assert.equal(isPlatformAdmin(operator.user),false);
  await assert.rejects(inquiryService.list(operator.user),code('PLATFORM_ADMIN_REQUIRED'));
  await assert.rejects(requirePlatformAdmin(new Request(testOrigin()+'/api/admin/inquiries',{headers:{cookie:operator.cookie}})),code('ADMIN_AUTH_REQUIRED'));
 }finally{globalThis.fetch=originalFetch;if(previous===undefined)delete process.env.BORDERLESS_PLATFORM_ADMIN_IDS;else process.env.BORDERLESS_PLATFORM_ADMIN_IDS=previous;}
});

test('legacy contact fallback is truthful and concurrent inquiry reviews cannot overwrite a terminal decision',async()=>{
 const previous=process.env.BORDERLESS_PLATFORM_ADMIN_IDS;
 const {owner,organization}=await inquiryFixture();const first=await register('inquiry-first-reviewer'),second=await register('inquiry-second-reviewer');
 try{
  process.env.BORDERLESS_PLATFORM_ADMIN_IDS=first.user.id+','+second.user.id;
  const id=randomUUID();await getPool().query("INSERT INTO enterprise_requests(id,organization_id,requested_by,status,notes,company_snapshot,created_at) VALUES($1,$2,$3,'Pending',$4,'{}',now())",[id,organization.id,owner.user.id,'Legacy inquiry without captured company snapshot']);
  const fallback=(await inquiryService.list(first.user,{status:'Pending'})).inquiries.find(row=>row.id===id)!;
  assert.equal(fallback.companyName,organization.name);assert.equal(fallback.requesterName,owner.user.name);assert.equal(fallback.requesterEmail,owner.user.email);
  const outcomes=await Promise.allSettled([inquiryService.review(first.user,id,{status:'Closed',notes:'First operator closes handling only'}),inquiryService.review(second.user,id,{status:'Rejected',notes:'Second operator rejects handling only'})]);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(result=>result.status==='rejected'&&code('INQUIRY_STATE')(result.reason)).length,1);
  const final=(await getPool().query('SELECT status,reviewed_by FROM enterprise_requests WHERE id=$1',[id])).rows[0];assert.ok(['Closed','Rejected'].includes(final.status));assert.ok([first.user.id,second.user.id].includes(final.reviewed_by));
  const legacyApproved=randomUUID();await getPool().query("INSERT INTO enterprise_requests(id,organization_id,requested_by,status,notes,company_snapshot,created_at) VALUES($1,$2,$3,'Approved',$4,'{}',now())",[legacyApproved,organization.id,owner.user.id,'Legacy status retained without entitlement activation']);
  await assert.rejects(inquiryService.review(first.user,legacyApproved,{status:'Closed',notes:'Legacy approved is terminal'}),code('INQUIRY_STATE'));
  await assert.rejects(inquiryService.review(first.user,id,{status:'In Review',notes:''}));
 }finally{if(previous===undefined)delete process.env.BORDERLESS_PLATFORM_ADMIN_IDS;else process.env.BORDERLESS_PLATFORM_ADMIN_IDS=previous;}
});


test('five concurrent inquiry reviews complete without nested pool-connection exhaustion',{timeout:10000},async()=>{
 const previous=process.env.BORDERLESS_PLATFORM_ADMIN_IDS;
 const owner=await register('review-concurrency-owner'),operator=await register('review-concurrency-operator');
 try{
  process.env.BORDERLESS_PLATFORM_ADMIN_IDS=operator.user.id;
  const ids:string[]=[];
  for(let i=0;i<5;i++){
   const org=await organizationService.create(owner.user,{name:'Concurrent inquiry '+randomUUID()});
   await billingService.selectPlan(owner.user,org.id,'Enterprise');
   const submitted=await billingService.requestEnterprise(owner.user,org.id,{notes:'Synthetic concurrent review fixture '+i});
   ids.push(submitted.enterpriseRequest!.id);
  }
  const start=performance.now();
  const reviewed=await Promise.all(ids.map(id=>inquiryService.review(operator.user,id,{status:'In Review',notes:'Human triage without borrowing a nested transaction client'})));
  assert.equal(reviewed.length,5);assert.ok(reviewed.every(record=>record.status==='In Review'));
  assert.ok(performance.now()-start<5000,'five reviews must complete within five seconds rather than waiting for pool timeouts');
 }finally{if(previous===undefined)delete process.env.BORDERLESS_PLATFORM_ADMIN_IDS;else process.env.BORDERLESS_PLATFORM_ADMIN_IDS=previous;}
});
