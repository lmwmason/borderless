import {test,expect,type APIRequestContext,type BrowserContext,type Page} from '@playwright/test';
import {readFile,access} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const baseURL=process.env.BORDERLESS_MARKETPLACE_QA_URL||'https://localhost:3219';
const fixturePath='/tmp/borderless-qa-fixture.json';
const password='SyntheticQA-isolated-password-2026!';
const testIP=()=>[198,18,Math.floor(Math.random()*255),1+Math.floor(Math.random()*253)].join('.');
test.use({baseURL,ignoreHTTPSErrors:true,actionTimeout:10000});
test.beforeEach(async({context})=>{
 const target=new URL(baseURL);
 test.skip(!['localhost','127.0.0.1'].includes(target.hostname)||target.port!=='3219','Synthetic expert browser QA is restricted to the dedicated local server3219.');
 let fixtureExists=true;try{await access(fixturePath)}catch{fixtureExists=false}
 test.skip(!fixtureExists,'The isolated QA server and private reviewer fixture must be started explicitly.');
 await context.setExtraHTTPHeaders({'x-test-ip':testIP()});
});
async function json<T=any>(api:APIRequestContext,method:'get'|'post'|'put'|'patch',path:string,data?:unknown,projectId?:string):Promise<T>{
 const response=await api[method](path,{headers:{origin:baseURL,...(projectId?{'x-project-id':projectId}:{})},...(data===undefined?{}:{data})});
 expect(response.status(),method.toUpperCase()+' '+path).toBe(200);
 return response.json();
}
async function signup(api:APIRequestContext,name:string,email:string){await json(api,'post','/api/auth/sign-up/email',{name,email,password})}
async function openCompanyMarketplace(page:Page,query:string){
 await page.goto('/');
 await page.getByRole('button',{name:'Expert Marketplace',exact:true}).click();
 await page.getByLabel('Search experts',{exact:true}).fill(query);
 await page.getByRole('button',{name:'Apply expert filters',exact:true}).click();
 await expect(page.getByText('Loading registered experts…',{exact:true})).toHaveCount(0);
}
test('SyntheticQA expert registration, private catalogue data, scoped company request and reviewed collaboration',async({page,browser,playwright})=>{
 test.setTimeout(120000);
 const fixture=JSON.parse(await readFile(fixturePath,'utf8')) as {reviewerEmail:string;reviewerPassword:string};
 const marker='SyntheticQA-'+randomUUID().slice(0,8),expertName=marker+' Expert A',secondName=marker+' Expert B';
 const privateResume=marker+' PRIVATE RESUME',privatePortfolio=marker+' PRIVATE PORTFOLIO',privateLicense=marker+'-PRIVATE-LICENSE';
 const serviceTitle=marker+' Document Review',approvedTitle=marker+' Approved document',privateTitle=marker+' Unapproved document';
 const externalRequests:string[]=[],sensitiveServices:string[]=[];
 const watch=(target:Page)=>target.on('request',request=>{
  if(!request.url().startsWith(baseURL))externalRequests.push(request.url());
  if(/\/api\/reviews(?:\/|$)|\/billing\/(?:payment-link|checkout)(?:\?|$)/.test(request.url()))sensitiveServices.push(request.url());
 });
 watch(page);
 let companyContext:BrowserContext|undefined,secondContext:BrowserContext|undefined;
 const reviewer=await playwright.request.newContext({baseURL,ignoreHTTPSErrors:true,extraHTTPHeaders:{origin:baseURL,'x-test-ip':testIP()}});
 try{
  // The first expert registers through the real audience/auth/profile/catalogue UI, with no organization.
  await page.goto('/');
  await page.getByRole('button',{name:'For Experts',exact:true}).click();
  await page.getByRole('button',{name:'Create an expert profile',exact:false}).click();
  await page.getByLabel('Your name',{exact:true}).fill(expertName);
  await page.getByLabel('Email',{exact:true}).fill(marker.toLowerCase()+'-expert@example.com');
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.locator('form').getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Expert workspace',exact:true})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toHaveCount(0);
  await page.getByLabel('Display name',{exact:true}).fill(expertName);
  await page.getByRole('combobox',{name:'Profile visibility',exact:true}).selectOption('public');
  await page.getByLabel('Professional introduction',{exact:true}).fill('Synthetic QA profile in an isolated database. Not a real professional or credential.');
  await page.getByLabel('Specialties (comma separated)',{exact:true}).fill('SyntheticQA SaaS review');
  await page.getByLabel('Service regions (comma separated)',{exact:true}).fill('California');
  await page.getByLabel('Credential type',{exact:true}).fill('Synthetic QA consultant');
  await page.getByLabel('License or credential issuer',{exact:true}).fill('Synthetic QA only; no real issuer');
  await page.getByLabel('License jurisdiction',{exact:true}).fill('California');
  await page.getByLabel('License number',{exact:true}).fill(privateLicense);
  await page.getByLabel('Languages (comma separated)',{exact:true}).fill('Korean, English');
  await page.getByRole('button',{name:'Add portfolio item',exact:false}).click();
  await page.getByLabel('Portfolio title',{exact:true}).fill(privatePortfolio);
  await page.getByLabel('Portfolio URL (HTTPS)',{exact:true}).fill('https://example.invalid/private-portfolio');
  await expect(page.getByRole('combobox',{name:'Portfolio visibility',exact:true})).toHaveValue('private');
  await page.getByLabel('Resume text',{exact:true}).fill(privateResume);
  await page.getByLabel('Resume URL (HTTPS, optional)',{exact:true}).fill('https://example.invalid/private-resume');
  await expect(page.getByRole('combobox',{name:'Resume visibility',exact:true})).toHaveValue('private');
  await page.getByRole('button',{name:'Save expert profile',exact:true}).click();
  await expect(page.getByText('Expert profile saved.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Submit for verification',exact:true}).click();
  await expect(page.getByRole('button',{name:'Verification pending',exact:true})).toBeVisible();
  await page.getByLabel('Service title',{exact:true}).fill(serviceTitle);
  await page.getByLabel('Service description',{exact:true}).fill('SyntheticQA service. No real professional advice.');
  await page.getByLabel('Scope and deliverables',{exact:true}).fill('Review only the approved synthetic document.');
  await page.getByRole('combobox',{name:'Service type',exact:true}).selectOption('Document Review');
  await page.getByRole('combobox',{name:'Pricing type',exact:true}).selectOption('fixed');
  await page.getByLabel('Price (minor currency units)',{exact:true}).fill('18000');
  await page.getByRole('combobox',{name:'Currency',exact:true}).selectOption('USD');
  await page.getByLabel('Estimated time',{exact:true}).fill('Synthetic QA estimate only');
  await page.getByLabel('Service conditions',{exact:true}).fill('Synthetic isolated browser QA; no real engagement or charge.');
  await page.getByRole('checkbox',{name:'Publish this service on my public profile',exact:true}).check();
  await page.getByRole('button',{name:'Save service',exact:true}).click();
  await expect(page.getByText('Service catalogue saved.',{exact:true})).toBeVisible();
  const own=await json(page.request,'get','/api/experts/me');
  const expertId=own.profile.id,serviceId=own.services[0].id;
  expect(own.profile.status).toBe('Pending Verification');
  expect(own.profile.portfolio[0].visibility).toBe('private');
  expect(own.profile.resume.visibility).toBe('private');
  expect(own.services[0].priceMinor).toBe(18000);
  expect((await json(page.request,'get','/api/account')).organizations).toHaveLength(0);
  await expect(page.getByRole('button',{name:/^Verify expert$|^Activate engagement$/})).toHaveCount(0);

  // A second real registered QA profile allows actual catalogue comparison; no fixtures are injected.
  secondContext=await browser.newContext({baseURL,ignoreHTTPSErrors:true,extraHTTPHeaders:{'x-test-ip':testIP()}});
  await signup(secondContext.request,secondName,marker.toLowerCase()+'-expert-b@example.com');
  await json(secondContext.request,'put','/api/experts/me',{displayName:secondName,visibility:'public',bio:'Synthetic isolated QA comparison profile, not a real professional.',specialties:['SyntheticQA SaaS review'],regions:['California'],credentialType:'Synthetic QA consultant',languages:['English']});
  await json(secondContext.request,'post','/api/experts/me/submit',{});
  await json(secondContext.request,'post','/api/experts/me/services',{title:marker+' Quote consultation',scope:'Synthetic QA comparison only',serviceType:'Initial Consultation',pricingType:'quote',priceMinor:null,currency:'USD',published:true});

  // An actual company account creates its own Free organization and project via real APIs.
  companyContext=await browser.newContext({baseURL,ignoreHTTPSErrors:true,extraHTTPHeaders:{'x-test-ip':testIP()}});
  const company=await companyContext.newPage();watch(company);
  await signup(company.request,marker+' Company Owner',marker.toLowerCase()+'-company@example.com');
  const organization=await json(company.request,'post','/api/organizations',{name:marker+' Company'});
  const billing=await json(company.request,'get','/api/organizations/'+organization.id+'/billing');
  await json(company.request,'post','/api/organizations/'+organization.id+'/billing/terms',{termsVersion:billing.termsVersion,accepted:true});
  await json(company.request,'post','/api/organizations/'+organization.id+'/billing/activate-free',{});
  const project=await json(company.request,'post','/api/organizations/'+organization.id+'/projects',{name:marker+' Project',description:'Isolated synthetic marketplace browser QA'});
  await json(company.request,'put','/api/company',{id:randomUUID(),name:marker+' SaaS',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()},project.id);
  const ws=await json(company.request,'get','/api/workspace',undefined,project.id);
  await json(company.request,'post','/api/assessments',{scenarioId:ws.scenarios[0].id},project.id);
  const approved=await json(company.request,'post','/api/documents',{title:approvedTitle,content:marker+' APPROVED SNAPSHOT'},project.id);
  const unapproved=await json(company.request,'post','/api/documents',{title:privateTitle,content:marker+' NEVER SHARED'},project.id);
  await openCompanyMarketplace(company,marker);
  await expect(company.locator('.expert-card')).toHaveCount(2);
  await company.getByRole('checkbox',{name:'Compare '+expertName,exact:true}).check();
  await company.getByRole('checkbox',{name:'Compare '+secondName,exact:true}).check();
  await company.getByRole('button',{name:/^Compare selected experts/}).click();
  await expect(company.locator('.expert-compare-table').getByRole('columnheader',{name:expertName,exact:true})).toBeVisible();
  await expect(company.locator('.expert-compare-table').getByText('$180.00',{exact:false})).toBeVisible();
  await company.locator('.expert-card').filter({has:company.getByRole('heading',{name:expertName,exact:true})}).getByRole('button',{name:'View profile and services',exact:false}).click();
  await expect(company.getByRole('heading',{name:expertName,exact:true})).toBeVisible();
  await expect(company.getByText(privateResume,{exact:true})).toHaveCount(0);
  await expect(company.getByText(privatePortfolio,{exact:true})).toHaveCount(0);
  await expect(company.getByText(privateLicense,{exact:true})).toHaveCount(0);
  await expect(company.getByRole('button',{name:'Request engagement',exact:true})).toBeDisabled();

  // Only this explicit isolated QA operator reviews synthetic records.
  await json(reviewer,'post','/api/auth/sign-in/email',{email:fixture.reviewerEmail,password:fixture.reviewerPassword});
  await json(reviewer,'post','/api/experts/'+expertId+'/review',{decision:'Verified',attested:true,notes:'Synthetic QA, not real credential verification',evidenceRefs:['synthetic-qa-evidence']});
  await openCompanyMarketplace(company,expertName);
  await company.locator('.expert-card').getByRole('button',{name:'View profile and services',exact:false}).click();
  await expect(company.locator('.public-expert-heading .expert-status')).toHaveText('Verified');
  await company.getByRole('button',{name:'Request engagement',exact:true}).click();
  await company.getByRole('combobox',{name:'Requesting project',exact:true}).selectOption(project.id);
  await company.getByLabel('Request title',{exact:true}).fill(marker+' Engagement');
  await company.getByLabel('Request summary',{exact:true}).fill('SyntheticQA request summary only. No confidential company information or real legal advice.');
  await expect(company.getByRole('checkbox',{name:new RegExp(approvedTitle)})).toBeVisible();
  await expect(company.locator('.resource-options input:checked')).toHaveCount(0);
  await company.getByRole('checkbox',{name:new RegExp(approvedTitle)}).check();
  await expect(company.getByRole('checkbox',{name:new RegExp(privateTitle)})).not.toBeChecked();
  const createdResponse=company.waitForResponse(response=>response.url().endsWith('/api/engagements')&&response.request().method()==='POST');
  await company.getByRole('button',{name:'Create draft request',exact:true}).click();
  const created=await createdResponse;expect(created.status()).toBe(200);const engagement=await created.json();
  expect(engagement.status).toBe('Draft');expect(engagement.resources).toEqual([{kind:'document',id:approved.id}]);
  expect([403,404]).toContain((await page.request.get('/api/engagements/'+engagement.id+'/workspace')).status());
  await company.getByRole('button',{name:'Submit request to expert',exact:true}).click();
  await expect(company.getByText('Submitted',{exact:true})).toBeVisible();
  expect((await page.request.get('/api/engagements/'+engagement.id+'/workspace')).status()).toBe(403);

  // Acceptance and both-party agreement do not activate a workspace.
  await page.getByRole('button',{name:'My engagements',exact:true}).click();
  await page.getByRole('button',{name:marker+' Engagement',exact:true}).click();
  await page.getByRole('button',{name:'Accept request for scope discussion',exact:true}).click();
  await expect(page.getByText('Accepted',{exact:true})).toBeVisible();
  expect((await json(page.request,'get','/api/engagements/'+engagement.id)).status).toBe('Accepted');
  expect((await page.request.get('/api/engagements/'+engagement.id+'/workspace')).status()).toBe(403);
  const premature=await reviewer.post('/api/engagements/'+engagement.id+'/actions',{data:{action:'activate',attested:true,evidenceRefs:['synthetic-qa-contract-evidence'],notes:'Synthetic QA only'}});
  expect([403,404,409]).toContain(premature.status());
  expect((await json(page.request,'get','/api/engagements/'+engagement.id)).status).toBe('Accepted');
  await expect(page.getByRole('button',{name:/^Activate/})).toHaveCount(0);
  await page.getByLabel('Proposed scope',{exact:true}).fill('SyntheticQA review of only the approved synthetic document.');
  await page.getByLabel('Quote price (minor units, optional)',{exact:true}).fill('20000');
  await page.getByLabel('Quote conditions',{exact:true}).fill('Synthetic isolated QA only. Not a real engagement, payment or legal opinion.');
  await page.getByRole('button',{name:'Propose scope and quote',exact:true}).click();
  await expect(page.getByText('Agreement Pending',{exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Conflicts review result',exact:true}).selectOption('Cleared');
  await page.getByRole('button',{name:'Record conflicts declaration',exact:true}).click();
  await page.getByRole('button',{name:'Agree as expert',exact:true}).click();
  await expect(page.getByRole('button',{name:'Expert scope agreed',exact:true})).toBeDisabled();
  await company.getByRole('button',{name:'Refresh engagement',exact:true}).click();
  await company.getByRole('button',{name:'Agree as company',exact:true}).click();
  await expect(company.getByRole('button',{name:'Company scope agreed',exact:true})).toBeDisabled();
  expect((await page.request.get('/api/engagements/'+engagement.id+'/workspace')).status()).toBe(403);
  const activated=await json(reviewer,'post','/api/engagements/'+engagement.id+'/actions',{action:'activate',attested:true,evidenceRefs:['synthetic-qa-contract-evidence'],notes:'Synthetic QA, not real contract evidence',expiresAt:new Date(Date.now()+3600000).toISOString()});
  expect(activated.status).toBe('Active');

  // Only explicitly approved resources enter the real Active collaboration workspace.
  const shared=await json(page.request,'get','/api/engagements/'+engagement.id+'/workspace');
  expect(shared.resources.map((item:{id:string})=>item.id)).toEqual([approved.id]);
  expect(JSON.stringify(shared)).not.toContain(unapproved.id);expect(JSON.stringify(shared)).not.toContain(marker+' NEVER SHARED');
  expect((await json(page.request,'get','/api/account')).organizations).toHaveLength(0);
  await page.getByRole('button',{name:'Refresh engagement',exact:true}).click();
  await page.getByText('Shared document · '+approved.id,{exact:true}).click();
  await expect(page.getByText(marker+' APPROVED SNAPSHOT',{exact:true})).toBeVisible();
  await expect(page.getByText(marker+' NEVER SHARED',{exact:true})).toHaveCount(0);
  await page.getByRole('combobox',{name:'Entry type',exact:true}).selectOption('expert_opinion');
  await page.getByLabel('Collaboration entry',{exact:true}).fill(marker+' Human expert QA opinion, not real legal advice.');
  await page.getByRole('button',{name:'Post collaboration entry',exact:true}).click();
  await expect(page.locator('.collaboration-entry.expert_opinion').getByText('Human expert opinion',{exact:true})).toBeVisible();
  await company.getByRole('button',{name:'Refresh engagement',exact:true}).click();
  await company.getByRole('combobox',{name:'Entry type',exact:true}).selectOption('message');
  await company.getByLabel('Collaboration entry',{exact:true}).fill(marker+' Company collaboration message');
  await company.getByRole('button',{name:'Post collaboration entry',exact:true}).click();
  await expect(company.locator('.collaboration-entry.message').getByText(marker+' Company collaboration message',{exact:true})).toBeVisible();
  await company.getByRole('combobox',{name:'Entry type',exact:true}).selectOption('information_request');
  await company.getByLabel('Collaboration entry',{exact:true}).fill(marker+' Request additional synthetic facts');
  await company.getByRole('button',{name:'Post collaboration entry',exact:true}).click();
  await expect(company.locator('.collaboration-entry.information_request').getByText(marker+' Request additional synthetic facts',{exact:true})).toBeVisible();
  await company.getByRole('combobox',{name:'Entry type',exact:true}).selectOption('task');
  await company.getByLabel('Collaboration entry',{exact:true}).fill(marker+' Human review task');
  const taskPosted=company.waitForResponse(response=>response.url().endsWith('/workspace/entries')&&response.request().method()==='POST');
  await company.getByRole('button',{name:'Post collaboration entry',exact:true}).click();
  const taskResponse=await taskPosted;expect(taskResponse.status()).toBe(200);expect((await taskResponse.json()).kind).toBe('task');
  await company.getByRole('combobox',{name:'Engagement task status',exact:true}).selectOption('done');
  await expect(company.getByRole('combobox',{name:'Engagement task status',exact:true})).toHaveValue('done');
  const finalWorkspace=await json(company.request,'get','/api/engagements/'+engagement.id+'/workspace');
  expect(finalWorkspace.entries.map((entry:{kind:string})=>entry.kind)).toEqual(['expert_opinion','message','information_request','task']);
  expect(finalWorkspace.entries.at(-1).status).toBe('done');
  await company.screenshot({path:'/tmp/borderless-marketplace-collaboration-qa.png',fullPage:true});
  await company.getByRole('button',{name:'Revoke engagement access',exact:true}).click();
  await expect(company.getByText('Canceled',{exact:true})).toBeVisible();
  expect([403,404]).toContain((await page.request.get('/api/engagements/'+engagement.id+'/workspace')).status());
  await page.getByRole('button',{name:'Refresh engagement',exact:true}).click();
  await expect(page.locator('.alert.error')).toBeVisible();
  expect((await json(page.request,'get','/api/account')).organizations).toHaveLength(0);
  await expect(page.getByRole('heading',{name:'Professional collaboration',exact:true})).toHaveCount(0);
  await expect(page.getByText(marker+' APPROVED SNAPSHOT',{exact:true})).toHaveCount(0);
  expect(externalRequests).toEqual([]);expect(sensitiveServices).toEqual([]);
 }finally{await reviewer.dispose();await companyContext?.close();await secondContext?.close()}
});
