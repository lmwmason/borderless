import test from 'node:test';import assert from 'node:assert/strict';import {configuredPaymentLink,paymentLink,pricingConfiguration} from '../src/lib/billing/payment-links';import {ownerProject,register} from './helpers';import {billingService,TERMS_VERSION} from '../src/lib/billing';import {organizationService} from '../src/lib/organizations';
test('hosted payment links require pinned Groble HTTPS configuration',()=>{
 const old=process.env.GROBLE_STARTUP_PAYMENT_URL;
 try{for(const invalid of ['http://groble.im/a','https://groble.im.evil.example/a','https://evil.example/?next=groble.im','https://user:password@groble.im/a','https://groble.im:444/a']){process.env.GROBLE_STARTUP_PAYMENT_URL=invalid;assert.equal(configuredPaymentLink('Startup'),null);}
 process.env.GROBLE_STARTUP_PAYMENT_URL='https://www.groble.im/test-only-product';assert.equal(pricingConfiguration().plans.find(p=>p.plan==='Startup')?.configured,true);assert.equal(pricingConfiguration().paymentVerificationAvailable,false);
 }finally{if(old===undefined)delete process.env.GROBLE_STARTUP_PAYMENT_URL;else process.env.GROBLE_STARTUP_PAYMENT_URL=old;}
});
test('opening configured payment link never activates subscription; server requires admin and current terms',async()=>{
 const owner=await ownerProject('pricing'),outside=await register('pricing-outsider'),old=process.env.GROBLE_STARTUP_PAYMENT_URL;
 try{
 process.env.GROBLE_STARTUP_PAYMENT_URL='https://www.groble.im/test-only-product';
 await assert.rejects(paymentLink(owner.user,owner.organization.id,'Startup','ko'),/Save this plan/);
 await billingService.selectPlan(owner.user,owner.organization.id,'Startup');
 const link=await paymentLink(owner.user,owner.organization.id,'Startup','ko');assert.equal(link.verificationPending,true);
 assert.equal((await billingService.get(owner.user,owner.organization.id)).subscription.status,'Pending');assert.equal((await billingService.get(owner.user,owner.organization.id)).organizationStatus,'Draft');
 await assert.rejects(paymentLink(outside.user,owner.organization.id,'Startup','ko'));
 delete process.env.GROBLE_STARTUP_PAYMENT_URL;await assert.rejects(paymentLink(owner.user,owner.organization.id,'Startup','ko'),/configured/);
 const fresh=await organizationService.create(owner.user,{name:'Unaccepted pricing terms'});await billingService.selectPlan(owner.user,fresh.id,'Startup');await assert.rejects(paymentLink(owner.user,fresh.id,'Startup','ko'),/Accept the current/);
 }finally{if(old===undefined)delete process.env.GROBLE_STARTUP_PAYMENT_URL;else process.env.GROBLE_STARTUP_PAYMENT_URL=old;}
});

test('platform monthly pricing is Free0, Startup49000 and Business149000 KRW',()=>{
 const plans=pricingConfiguration().plans;
 assert.deepEqual(plans.map(p=>[p.plan,p.amount,p.currency,p.interval,p.requiresPayment]),[['Free',0,'KRW','month',false],['Startup',49000,'KRW','month',true],['Business',149000,'KRW','month',true],['Enterprise',null,'KRW','custom',false]]);
 assert.equal(plans.find(p=>p.plan==='Free')?.configured,true);
});

test('Enterprise inquiry records canonical company snapshot and stays Pending without paid activation',async()=>{
 const owner=await ownerProject('enterprise-pricing');
 await billingService.selectPlan(owner.user,owner.organization.id,'Enterprise');
 const result=await billingService.requestEnterprise(owner.user,owner.organization.id,{notes:'Synthetic enterprise introduction request'});
 assert.equal(result.enterpriseRequest?.status,'Pending');assert.equal(result.enterpriseRequest?.companyInfo.companyName,owner.organization.name);
 assert.equal(result.enterpriseRequest?.companyInfo.requesterId,owner.user.id);assert.equal(result.enterpriseRequest?.notes,'Synthetic enterprise introduction request');
 assert.equal(result.organizationStatus,'Draft');assert.equal(result.subscription.status,'Pending');
 await assert.rejects(billingService.activateFree(owner.user,owner.organization.id),/Free/);
});
