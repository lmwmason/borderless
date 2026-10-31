import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {readFile,access} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {EMPTY_FEATURES,type ContractInput} from '../src/lib/entitlements/registry';
const baseURL=process.env.BORDERLESS_QA_URL||'https://localhost:3219';
const fixturePath='/tmp/borderless-qa-fixture.json';
const ip=()=>[198,19,Math.floor(Math.random()*255),1+Math.floor(Math.random()*253)].join('.');
test.use({baseURL,ignoreHTTPSErrors:true,actionTimeout:10000,viewport:{width:1440,height:1000},timezoneId:'UTC'});
test.beforeEach(async({context})=>{
 const target=new URL(baseURL);test.skip(!['localhost','127.0.0.1'].includes(target.hostname)||target.port!=='3219','Administrator browser QA requires the dedicated isolated local server3219.');
 let ready=true;try{await access(fixturePath)}catch{ready=false}test.skip(!ready,'Private isolated administrator fixture is required.');
 await context.setExtraHTTPHeaders({'x-test-ip':ip()});
});
async function fixture(){const value=JSON.parse(await readFile(fixturePath,'utf8')) as {adminLogin:string;adminPassword:string};expect(typeof value.adminLogin).toBe('string');expect(typeof value.adminPassword).toBe('string');return value}
async function call<T=any>(api:APIRequestContext,method:'get'|'post'|'put'|'patch',path:string,data?:unknown,projectId?:string):Promise<T>{
 const response=await api[method](path,{headers:{origin:baseURL,...(projectId?{'x-project-id':projectId}:{})},...(data===undefined?{}:{data})});expect(response.status(),method.toUpperCase()+' '+path).toBe(200);return response.json();
}
async function login(page:Page){const credentials=await fixture();await page.goto('/admin/login');await expect(page.getByLabel('Admin login ID',{exact:true})).toHaveValue('');await expect(page.getByLabel('Admin password',{exact:true})).toHaveValue('');await page.getByLabel('Admin login ID',{exact:true}).fill(credentials.adminLogin);await page.getByLabel('Admin password',{exact:true}).fill(credentials.adminPassword);await page.getByRole('button',{name:'Sign in to Admin Console',exact:true}).click();await expect(page).toHaveURL(/\/en\/admin$/);await expect(page.getByRole('heading',{name:'Admin Console',exact:true})).toBeVisible()}
const localDate=(value:number)=>new Date(value).toISOString().slice(0,16);
test('SyntheticQA separate administrator login blocks regular sessions, persists reload and signs out independently',async({page})=>{
 const marker='SyntheticQA-AdminAuth-'+randomUUID().slice(0,8),email=marker.toLowerCase()+'@example.com',password='SyntheticQA-regular-account-2026!';
 await call(page.request,'post','/api/auth/sign-up/email',{name:marker,email,password});
 const ordinary=await call(page.request,'get','/api/account');expect(ordinary.user).toBeTruthy();
 expect((await page.request.get('/api/admin/overview')).status()).toBe(401);
 expect((await call(page.request,'get','/api/admin/session')).user).toBeNull();
 await page.goto('/admin/inquiries');await expect(page).toHaveURL(/\/en\/admin\/login$/);
 const denied=await page.request.post('/api/admin/login',{headers:{origin:baseURL},data:{loginId:email,password}});expect(denied.status()).toBe(401);
 await login(page);
 const session=await call(page.request,'get','/api/admin/session');expect(session.user.isDemo).toBe(false);
 await page.reload();await expect(page.getByRole('heading',{name:'Admin Console',exact:true})).toBeVisible();
 await page.setViewportSize({width:375,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/borderless-admin-mobile-qa.png',fullPage:true});
 await page.getByRole('button',{name:'Admin sign out',exact:true}).click();await expect(page).toHaveURL(/\/en\/admin\/login$/);
 expect((await call(page.request,'get','/api/admin/session')).user).toBeNull();
 expect((await call(page.request,'get','/api/account')).user.id).toBe(ordinary.user.id);
 await page.goto('/admin');await expect(page).toHaveURL(/\/en\/admin\/login$/);
});
test('SyntheticQA Admin Console clears overview data after administrator session loss',async({page})=>{
 await login(page);await expect(page.locator('.admin-stats')).toBeVisible();
 await call(page.request,'post','/api/admin/logout',{});
 await page.getByRole('button',{name:'Refresh admin overview',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Admin sign-in required',exact:true})).toBeVisible();
 await expect(page.locator('.admin-stats')).toHaveCount(0);await expect(page.locator('.admin-audit')).toHaveCount(0);
});
test('SyntheticQA template versions require reviewed company approval and preserve history, feature gates and stored results',async({page,browser})=>{
 test.setTimeout(180000);
 const marker='SyntheticQA-Contract-'+randomUUID().slice(0,8),templateName=marker+' Template',companyName=marker+' Company',projectName=marker+' Project',userName=marker+' Owner';
 const companyContext=await browser.newContext({baseURL,ignoreHTTPSErrors:true,timezoneId:'UTC',extraHTTPHeaders:{'x-test-ip':ip()}});
 const company=await companyContext.newPage();
 try{
  await call(company.request,'post','/api/auth/sign-up/email',{name:userName,email:marker.toLowerCase()+'@example.com',password:'SyntheticQA-contract-owner-2026!'});
  const account=await call(company.request,'get','/api/account'),org=await call(company.request,'post','/api/organizations',{name:companyName});
  const billing=await call(company.request,'get','/api/organizations/'+org.id+'/billing');await call(company.request,'post','/api/organizations/'+org.id+'/billing/terms',{termsVersion:billing.termsVersion,accepted:true});await call(company.request,'post','/api/organizations/'+org.id+'/billing/activate-free',{});
  const project=await call(company.request,'post','/api/organizations/'+org.id+'/projects',{name:projectName,description:'Synthetic isolated contract/template QA'});
  const companyFacts={id:randomUUID(),name:companyName,homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()};
  await call(company.request,'put','/api/company',companyFacts,project.id);
  const initial=await call(company.request,'get','/api/workspace',undefined,project.id);const quick=await call(company.request,'post','/api/assessments',{scenarioId:initial.scenarios[0].id},project.id);

  await login(page);await page.goto('/admin/subscriptions/templates');
  await expect(page.getByRole('heading',{name:'Subscription templates',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Enterprise Standard',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Legal Operations',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Enterprise Plus',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'New template',exact:true}).click();
  await page.getByLabel('Template name',{exact:true}).fill(templateName);
  await page.getByLabel('Template description',{exact:true}).fill('Synthetic QA configuration, not an executed agreement.');
  await page.getByLabel('Default contract duration (days)',{exact:true}).fill('2');
  await page.getByRole('checkbox',{name:/^Expert marketplace/}).check();
  await page.getByLabel('Member limit',{exact:true}).fill('5');await page.getByLabel('Project limit',{exact:true}).fill('3');await page.getByLabel('Monthly Deep Review limit',{exact:true}).fill('1');
  await page.getByLabel('Template scope notes',{exact:true}).fill('Synthetic QA only. No actual commercial agreement or charge.');
  const createdResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/admin/subscription-templates'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Save template version',exact:true}).click();
  const created=await createdResponse;expect(created.status()).toBe(200);const template=await created.json();expect(template.version).toBe(1);
  await expect(page.getByText('Template configuration saved as a versioned record.',{exact:false})).toBeVisible();

  async function approveUsingTemplate(reference:string){
   await page.goto('/admin?'+new URLSearchParams({organizationId:org.id}));
   await page.getByRole('combobox',{name:'Copy an active subscription template',exact:true}).selectOption(template.id);
   await page.getByLabel('Contract starts at',{exact:true}).fill(localDate(Date.now()-60000));
   await page.getByLabel('Contract ends at',{exact:true}).fill(localDate(Date.now()+86400000));
   await page.getByLabel('Contract reference',{exact:true}).fill(reference);
   await page.getByRole('button',{name:'Preview contract changes',exact:true}).click();
   const review=page.getByRole('region',{name:'Contract approval review',exact:true});
   await expect(review.getByRole('heading',{name:'Review before approval',exact:true})).toBeVisible();
   await expect(review.getByRole('columnheader',{name:'Current usage',exact:true})).toBeVisible();
   await expect(review.getByRole('button',{name:'Approve reviewed contract',exact:true})).toBeDisabled();
   await review.getByLabel('Contract approval reason',{exact:true}).fill('Synthetic QA production-path approval in isolated database; no real commercial agreement or payment.');
   await review.getByRole('checkbox',{name:/I attest that the executed agreement/}).check();
   const approvedResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/approve')&&response.request().method()==='POST');
   await review.getByRole('button',{name:'Approve reviewed contract',exact:true}).click();const result=await approvedResponse;expect(result.status()).toBe(200);return result.json();
  }
  await approveUsingTemplate(marker+' Synthetic reference v1');
  let entitlement=await call(company.request,'get','/api/organizations/'+org.id+'/entitlements');
  expect(entitlement.active).toBe(true);expect(entitlement.features.expert_marketplace).toBe(true);expect(entitlement.features.deep_legal_review).toBe(false);expect(entitlement.features.scenario_comparison).toBe(false);
  await company.goto('/');await company.locator('.organization-tile').filter({has:company.getByRole('heading',{name:companyName,exact:true})}).click();await company.locator('.project-tile').filter({has:company.getByRole('heading',{name:projectName,exact:true})}).click();
  await expect(company.getByRole('button',{name:'Scenarios',exact:true})).toBeDisabled();await company.getByRole('checkbox',{name:/I consent to sending/}).check();await expect(company.getByRole('button',{name:'Deep Review',exact:true})).toBeDisabled();
  await expect(company.getByRole('button',{name:'Marketplace',exact:true})).toBeEnabled();
  const blocked=await company.request.post('/api/scenarios',{headers:{origin:baseURL,'x-project-id':project.id},data:{name:marker+' gated scenario',company:companyFacts}});expect(blocked.status()).toBe(403);

  await page.goto('/admin/subscriptions/templates');await page.getByRole('button',{name:templateName,exact:true}).click();
  await page.getByRole('checkbox',{name:/^Scenario comparison/}).check();await page.getByLabel('Monthly Deep Review limit',{exact:true}).fill('2');
  const updatedResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/admin/subscription-templates/'+template.id&&response.request().method()==='PATCH');
  await page.getByRole('button',{name:'Save template version',exact:true}).click();const updated=await updatedResponse;expect(updated.status()).toBe(200);expect((await updated.json()).version).toBe(2);
  entitlement=await call(company.request,'get','/api/organizations/'+org.id+'/entitlements');expect(entitlement.contract.version).toBe(1);expect(entitlement.features.scenario_comparison).toBe(false);
  const beforeReapply=await call(page.request,'get','/api/admin/organizations/'+org.id+'/contracts');expect(beforeReapply.contracts[0].templateSource).toEqual({id:template.id,version:1});
  await approveUsingTemplate(marker+' Synthetic reference v2');
  entitlement=await call(company.request,'get','/api/organizations/'+org.id+'/entitlements');expect(entitlement.contract.version).toBe(2);expect(entitlement.features.scenario_comparison).toBe(true);
  const history=await call(page.request,'get','/api/admin/organizations/'+org.id+'/contracts');expect(history.contracts.map((item:{templateSource:{version:number}})=>item.templateSource.version).sort()).toEqual([1,2]);

  await page.goto('/admin/subscriptions/templates');await page.getByRole('button',{name:templateName,exact:true}).click();
  await page.getByLabel('Clone template name',{exact:true}).fill(marker+' Clone');
  const cloneResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/clone')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Clone template',exact:true}).click();const clone=await cloneResponse;expect(clone.status()).toBe(200);expect((await clone.json()).id).not.toBe(template.id);
  expect((await call(company.request,'get','/api/organizations/'+org.id+'/entitlements')).contract.version).toBe(2);
  await page.getByRole('button',{name:templateName,exact:true}).click();
  await page.getByRole('combobox',{name:'New template status',exact:true}).selectOption('Archived');
  await page.getByLabel('Template status reason',{exact:true}).fill('Synthetic QA archived; existing approved contracts must remain unchanged.');
  await page.getByRole('button',{name:'Update template status',exact:true}).click();await expect(page.getByText('Template availability updated.',{exact:false})).toBeVisible();
  const archivedAttempt:ContractInput={kind:'production',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),contractReference:marker+' archived source attempt',notes:'Synthetic QA only',features:{...EMPTY_FEATURES,expert_marketplace:true,scenario_comparison:true},limits:{members:5,projects:3,monthlyDeepReviews:2},templateSource:{id:template.id,version:2}};
  const denied=await page.request.post('/api/admin/organizations/'+org.id+'/contracts/preview',{headers:{origin:baseURL},data:archivedAttempt});expect(denied.status()).toBe(409);
  expect((await call(company.request,'get','/api/organizations/'+org.id+'/entitlements')).contract.version).toBe(2);
  await page.goto('/admin?'+new URLSearchParams({organizationId:org.id}));
  await expect(page.getByRole('combobox',{name:'Copy an active subscription template',exact:true}).locator('option[value="'+template.id+'"]')).toHaveCount(0);

  // Precise short-lived proposals exercise natural expiry without model calls or deleting project records.
  const {templateSource:omitted,...manual}=archivedAttempt;
  const short=await call(page.request,'post','/api/admin/organizations/'+org.id+'/contracts/preview',{...manual,endsAt:new Date(Date.now()+5000).toISOString(),contractReference:marker+' Synthetic expiry'});
  await call(page.request,'post','/api/admin/organizations/'+org.id+'/contracts/'+short.proposalId+'/approve',{attested:true,reason:'Synthetic QA expiry test in isolated database; not real contract evidence.'});
  await expect.poll(async()=>Boolean((await call(company.request,'get','/api/organizations/'+org.id+'/entitlements')).active),{timeout:10000}).toBe(false);
  const renewed=await call(page.request,'post','/api/admin/organizations/'+org.id+'/contracts/preview',{...manual,endsAt:new Date(Date.now()+86400000).toISOString(),contractReference:marker+' Synthetic renewal'});
  await call(page.request,'post','/api/admin/organizations/'+org.id+'/contracts/'+renewed.proposalId+'/approve',{attested:true,reason:'Synthetic QA renewal, no real agreement or payment.'});
  const retained=await call(company.request,'get','/api/workspace',undefined,project.id);expect(retained.assessments.some((assessment:{id:string})=>assessment.id===quick.id)).toBe(true);

  await page.goto('/admin?'+new URLSearchParams({organizationId:org.id}));
  await page.getByLabel('Organization access change reason',{exact:true}).fill('Synthetic QA organization suspension');
  await page.getByRole('button',{name:'Suspend organization',exact:true}).click();await expect(page.getByText('Organization access change recorded.',{exact:true})).toBeVisible();
  expect((await call(company.request,'get','/api/organizations/'+org.id+'/entitlements')).active).toBe(false);
  await page.getByLabel('Organization access change reason',{exact:true}).fill('Synthetic QA organization resume under existing reviewed contract');
  await page.getByRole('button',{name:'Resume organization',exact:true}).click();await expect(page.getByText('Organization access change recorded.',{exact:true})).toBeVisible();
  expect((await call(company.request,'get','/api/organizations/'+org.id+'/entitlements')).active).toBe(true);
  await page.getByLabel('Contract action reason',{exact:true}).fill('Synthetic QA contract suspension');
  await page.getByRole('button',{name:'Suspend contract',exact:true}).click();await expect(page.getByText('Contract suspension recorded.',{exact:false})).toBeVisible();
  expect((await call(company.request,'get','/api/organizations/'+org.id+'/entitlements')).active).toBe(false);
  await page.getByLabel('Contract action reason',{exact:true}).fill('Synthetic QA contract revocation');
  await page.getByRole('button',{name:'Revoke contract',exact:true}).click();await expect(page.getByText('Contract revocation recorded.',{exact:false})).toBeVisible();

  await page.getByRole('button',{name:'Users',exact:true}).click();
  await page.getByRole('button',{name:'Manage sessions for '+userName,exact:true}).click();
  await page.getByLabel('Session revocation reason',{exact:true}).fill('Synthetic QA regular user session revocation.');
  await page.getByRole('button',{name:'Revoke user sessions',exact:true}).click();await expect(page.getByText('User session revocation recorded.',{exact:true})).toBeVisible();
  expect((await call(company.request,'get','/api/account')).user).toBeNull();expect((await call(page.request,'get','/api/admin/session')).user).toBeTruthy();
  await page.screenshot({path:'/tmp/borderless-contract-builder-qa.png',fullPage:true});
 }finally{await companyContext.close()}
});
