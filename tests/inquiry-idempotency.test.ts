import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {register} from './helpers';
import {organizationService} from '../src/lib/organizations';
import {billingService} from '../src/lib/billing';
import {getPool} from '../src/lib/db';

test('concurrent identical Enterprise submissions persist one inquiry and one notification without granting access',async()=>{
 const {user}=await register('idempotent-enterprise'),org=await organizationService.create(user,{name:'Synthetic idempotency company'});
 await billingService.selectPlan(user,org.id,'Enterprise');
 const input={notes:'Synthetic introduction, confidential details remain in PostgreSQL.',idempotencyKey:randomUUID()};
 const responses=await Promise.all(Array.from({length:4},()=>billingService.requestEnterprise(user,org.id,input)));
 assert.equal(new Set(responses.map(r=>r.enterpriseRequest!.id)).size,1);
 assert.equal((await getPool().query('SELECT count(*)::int AS count FROM enterprise_requests WHERE organization_id=$1',[org.id])).rows[0].count,1);
 await assert.rejects(billingService.requestEnterprise(user,org.id,{...input,notes:'Changed content'}),(e:any)=>e.code==='IDEMPOTENCY_CONFLICT');
 const duplicate=await billingService.requestEnterprise(user,org.id,{notes:input.notes});
 assert.equal(duplicate.enterpriseRequest!.id,responses[0].enterpriseRequest!.id);
 assert.equal(duplicate.organizationStatus,'Draft');assert.equal(duplicate.subscription.status,'Pending');
});
