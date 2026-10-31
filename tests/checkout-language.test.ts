import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredPaymentLink,paymentLink,pricingConfiguration} from '../src/lib/billing/payment-links';
import {billingService} from '../src/lib/billing';
import {ownerProject} from './helpers';

const keys=['GROBLE_STARTUP_URL','GROBLE_BUSINESS_URL','GROBLE_STARTUP_PAYMENT_URL','GROBLE_BUSINESS_PAYMENT_URL'] as const;
function isolatedEnvironment(){const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));for(const key of keys)delete process.env[key];return()=>{for(const key of keys)if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key]};}
const code=(expected:string)=>(error:any)=>error?.code===expected;

test('new Groble environment names are authoritative and invalid or empty values cannot fall back to legacy links',()=>{
 const restore=isolatedEnvironment();try{
  process.env.GROBLE_STARTUP_PAYMENT_URL='https://groble.im/payment/synthetic-legacy';
  assert.equal(configuredPaymentLink('Startup'),'https://groble.im/payment/synthetic-legacy');
  process.env.GROBLE_STARTUP_URL='https://groble.im/payment/synthetic-current';
  assert.equal(configuredPaymentLink('Startup'),'https://groble.im/payment/synthetic-current');
  for(const invalid of ['', 'http://groble.im/payment/synthetic','https://groble.im.evil.test/payment/synthetic','https://user:secret@groble.im/payment/synthetic','https://groble.im:444/payment/synthetic']){
   process.env.GROBLE_STARTUP_URL=invalid;assert.equal(configuredPaymentLink('Startup'),null);
  }
  process.env.GROBLE_BUSINESS_URL='https://www.groble.im/payment/synthetic-business';
  assert.equal(configuredPaymentLink('Business'),'https://www.groble.im/payment/synthetic-business');
  const configuration=pricingConfiguration();assert.equal(configuration.checkoutLocale,'ko');assert.equal(configuration.paymentVerificationAvailable,false);
  assert.equal(configuration.plans.find(plan=>plan.plan==='Startup')?.configured,false);assert.equal(configuration.plans.find(plan=>plan.plan==='Business')?.configured,true);
 }finally{restore();}
});

test('only Korean server context can issue a saved authorized hosted link and issuance never activates paid access',async()=>{
 const restore=isolatedEnvironment();try{
  process.env.GROBLE_STARTUP_URL='https://groble.im/payment/synthetic-locale-test?merchantOption=unchanged';
  const owner=await ownerProject('checkout-locale');await billingService.selectPlan(owner.user,owner.organization.id,'Startup');
  await assert.rejects(paymentLink(owner.user,owner.organization.id,'Startup'),code('CHECKOUT_LANGUAGE_REQUIRED'));
  await assert.rejects(paymentLink(owner.user,owner.organization.id,'Startup','en'),code('CHECKOUT_LANGUAGE_REQUIRED'));
  await assert.rejects(paymentLink(owner.user,owner.organization.id,'Startup','fr'),code('CHECKOUT_LANGUAGE_REQUIRED'));
  const link=await paymentLink(owner.user,owner.organization.id,'Startup','ko');
  assert.equal(link.url,process.env.GROBLE_STARTUP_URL);assert.equal(link.checkoutLocale,'ko');assert.equal(link.verificationPending,true);
  const billing=await billingService.get(owner.user,owner.organization.id);
  assert.equal(billing.checkoutAvailable,true);assert.equal(billing.checkoutLocale,'ko');assert.equal(billing.organizationStatus,'Draft');assert.equal(billing.subscription.status,'Pending');
  const throughCheckout=await billingService.checkout(owner.user,owner.organization.id,'ko');assert.equal(throughCheckout.url,link.url);
 }finally{restore();}
});
