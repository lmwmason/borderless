import test from 'node:test';
import assert from 'node:assert/strict';
import {register,registerAdmin,testOrigin} from './helpers';
import {organizationService} from '../src/lib/organizations';
import {billingService} from '../src/lib/billing';
import {GET as list} from '../src/app/api/admin/inquiries/route';
import {GET as detail,PATCH as update} from '../src/app/api/admin/inquiries/[id]/route';
import {POST as note} from '../src/app/api/admin/inquiries/[id]/notes/route';
import {POST as retry} from '../src/app/api/admin/inquiries/[id]/notifications/[notificationId]/retry/route';

test('sales API requires real platform session, validates mutations and never grants Enterprise entitlement',async()=>{
 const original=process.env.BORDERLESS_PLATFORM_ADMIN_IDS;
 const owner=await register('crm-api-owner'),operator=await registerAdmin('crm-api-operator'),org=await organizationService.create(owner.user,{name:'Synthetic sales API company'});
 await billingService.selectPlan(owner.user,org.id,'Enterprise');
 const submitted=await billingService.requestEnterprise(owner.user,org.id,{notes:'Synthetic API introduction'}),id=submitted.enterpriseRequest!.id;
 const ctx={params:Promise.resolve({id})};
 const request=(path:string,cookie?:string,method='GET',body?:unknown)=>new Request(testOrigin()+path,{method,headers:{...(cookie?{cookie}:{}),origin:testOrigin(),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 try{
  process.env.BORDERLESS_PLATFORM_ADMIN_IDS=operator.user.id;
  assert.equal((await list(request('/api/admin/inquiries'))).status,401);
  assert.equal((await list(request('/api/admin/inquiries',owner.cookie))).status,401);
  assert.equal((await detail(request('/api/admin/inquiries/'+id,owner.cookie),ctx)).status,401);
  assert.equal((await list(request('/api/admin/inquiries?salesStatus=Won',operator.cookie))).status,200);
  assert.equal((await update(request('/api/admin/inquiries/'+id,operator.cookie,'PATCH',{salesStatus:'Contacted',assigneeId:operator.user.id}),ctx)).status,200);
  assert.equal((await note(request('/api/admin/inquiries/'+id+'/notes',operator.cookie,'POST',{body:'Internal only sales note'}),ctx)).status,200);
  assert.equal((await update(request('/api/admin/inquiries/'+id,operator.cookie,'PATCH',{salesStatus:'Won',subscriptionStatus:'Active'}),ctx)).status,400);
  const record=await (await detail(request('/api/admin/inquiries/'+id,operator.cookie),ctx)).json();
  assert.equal(record.inquiry.salesStatus,'Contacted');assert.equal(record.notes[0].body,'Internal only sales note');
  assert.equal(record.notifications[0].status,'Disabled');
  assert.equal((await retry(request('/api/admin/inquiries/'+id+'/notifications/fake/retry',operator.cookie,'POST',{}),{params:Promise.resolve({id,notificationId:'fake'})})).status,404);
  const billing=await billingService.get(owner.user,org.id);assert.equal(billing.organizationStatus,'Draft');assert.equal(billing.subscription.status,'Pending');
 }finally{if(original===undefined)delete process.env.BORDERLESS_PLATFORM_ADMIN_IDS;else process.env.BORDERLESS_PLATFORM_ADMIN_IDS=original;}
});
