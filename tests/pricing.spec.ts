import {test,expect,type Page} from '@playwright/test';
test.use({baseURL:process.env.BORDERLESS_QA_URL||'http://localhost:3217',ignoreHTTPSErrors:true});
async function isolatedAdminSession(page:Page){
 const base=process.env.BORDERLESS_QA_URL||'http://localhost:3217',target=new URL(base);
 test.skip(!['localhost','127.0.0.1'].includes(target.hostname)||target.port!=='3219','Protected admin UI QA requires the explicitly isolated local server3219.');
 const {readFile,access}=await import('node:fs/promises');let ready=true;try{await access('/tmp/borderless-qa-fixture.json')}catch{ready=false}test.skip(!ready,'Private isolated administrator fixture is required.');
 const fixture=JSON.parse(await readFile('/tmp/borderless-qa-fixture.json','utf8')) as {adminLogin:string;adminPassword:string};
 await page.context().setExtraHTTPHeaders({'x-test-ip':'198.19.'+Math.floor(Math.random()*255)+'.'+(1+Math.floor(Math.random()*253))});
 const response=await page.request.post('/api/admin/login',{headers:{origin:base},data:{loginId:fixture.adminLogin,password:fixture.adminPassword}});expect(response.status()).toBe(200);
 const session=await (await page.request.get('/api/admin/session')).json();expect(session.user).toBeTruthy();return session;
}

test('public pricing truthfully disables unconfigured payment links without mutations',async({page})=>{
 const mutations:string[]=[];
 page.on('request',request=>{if(['POST','PUT','PATCH','DELETE'].includes(request.method()))mutations.push(request.url())});
 await page.route('**/api/pricing',route=>route.fulfill({json:{plans:[{plan:'Free',amount:0,currency:'KRW',interval:'month',configured:true,requiresPayment:false},{plan:'Startup',amount:49000,currency:'KRW',interval:'month',configured:false,requiresPayment:true},{plan:'Business',amount:149000,currency:'KRW',interval:'month',configured:false,requiresPayment:true},{plan:'Enterprise',amount:null,currency:'KRW',interval:'custom',configured:true,requiresPayment:false}],paymentVerificationAvailable:false}}));
 await page.route('**/api/account',route=>route.fulfill({json:{user:null,organizations:[],pending:[]}}));
 await page.goto('/pricing');
 await expect(page.getByRole('heading',{name:'Free',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Startup',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Business',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Enterprise',exact:true})).toBeVisible();
 await expect(page.getByText('Custom pricing',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Contact sales',exact:true})).toHaveAttribute('href','/?auth=signin&intent=enterprise');
 await expect(page.getByRole('button',{name:'Select Startup',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Select Business',exact:true})).toBeDisabled();
 await expect(page.locator('.pricing-amount').filter({hasText:/^0 KRW/})).toHaveCount(1);
 await expect(page.locator('.pricing-amount').filter({hasText:/^49,000 KRW/})).toHaveCount(1);
 await expect(page.locator('.pricing-amount').filter({hasText:'149,000 KRW'})).toHaveCount(1);
 await expect(page.getByRole('link',{name:'Start Free',exact:true})).toHaveAttribute('href','/?auth=signup');
 await expect(page.getByText('Payment link not configured.',{exact:false}).first()).toBeVisible();
 expect(mutations).toEqual([]);
});
test('billing return ignores forged success parameters and makes no activation request',async({page})=>{
 const mutations:string[]=[],externalRequests:string[]=[];
 page.on('request',request=>{if(['POST','PUT','PATCH','DELETE'].includes(request.method()))mutations.push(request.url());if(!request.url().startsWith(process.env.BORDERLESS_QA_URL||'http://localhost:3217'))externalRequests.push(request.url())});
 const organizationId='<script>activate()</script>';
 const query=new URLSearchParams({organizationId,paid:'true',status:'Active',success:'true',paymentVerified:'true',plan:'Business',redirect:'https://invalid.example/activate'});
 await page.goto('/billing/return?'+query);
 await expect(page.getByRole('heading',{name:'Payment confirmation pending',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Open organization billing',exact:false})).toHaveAttribute('href','/?'+new URLSearchParams({organizationId,view:'billing'}));
 await expect(page.getByText('This return page performs no payment, subscription or activation mutations.',{exact:true})).toBeVisible();
 expect(mutations).toEqual([]);
 expect(externalRequests).toEqual([]);
 expect(page.url()).toContain('/billing/return?');
});

test('Free pricing selection records terms and activates without requesting a hosted payment link',async({page})=>{
 const organizationId='synthetic-qa-pricing-org',mutations:string[]=[];
 const pricing={plans:[{plan:'Free',amount:0,currency:'KRW',interval:'month',configured:true,requiresPayment:false},{plan:'Startup',amount:49000,currency:'KRW',interval:'month',configured:false,requiresPayment:true},{plan:'Business',amount:149000,currency:'KRW',interval:'month',configured:false,requiresPayment:true},{plan:'Enterprise',amount:null,currency:'KRW',interval:'custom',configured:true,requiresPayment:false}],paymentVerificationAvailable:false};
 let billing={plan:'Startup',organizationStatus:'Draft',termsVersion:'synthetic-qa-terms',termsText:'Synthetic browser test terms. No live payment or contract.',accepted:false,subscription:{status:'Pending'}};
 page.on('request',request=>{if(['POST','PUT','PATCH','DELETE'].includes(request.method()))mutations.push(request.method()+' '+new URL(request.url()).pathname)});
 await page.route('**/api/pricing',route=>route.fulfill({json:pricing}));
 await page.route('**/api/account',route=>route.fulfill({json:{user:{id:'synthetic-qa-owner',name:'Synthetic QA Owner',email:'synthetic-qa@example.com'},organizations:[{id:organizationId,name:'Synthetic QA Pricing',role:'Owner',plan:'Startup',status:'Draft',workspaceId:'synthetic-qa-workspace'}],pending:[]}}));
 await page.route('**/api/organizations/'+organizationId+'/billing',route=>route.fulfill({json:billing}));
 await page.route('**/api/organizations/'+organizationId+'/billing/plan',async route=>{expect(route.request().method()).toBe('PUT');expect(route.request().postDataJSON()).toEqual({plan:'Free'});billing={...billing,plan:'Free'};await route.fulfill({json:billing})});
 await page.route('**/api/organizations/'+organizationId+'/billing/terms',async route=>{expect(route.request().postDataJSON()).toEqual({termsVersion:'synthetic-qa-terms',accepted:true});billing={...billing,accepted:true};await route.fulfill({json:billing})});
 await page.route('**/api/organizations/'+organizationId+'/billing/activate-free',async route=>{expect(billing.plan).toBe('Free');expect(billing.accepted).toBe(true);billing={...billing,organizationStatus:'Active',subscription:{status:'Active'}};await route.fulfill({json:billing})});
 await page.goto('/pricing?organizationId='+organizationId);
 await expect(page.getByRole('combobox',{name:'Requested plan',exact:true})).toHaveValue('Startup');
 await page.getByRole('button',{name:'Select Free',exact:true}).click();
 await page.getByRole('button',{name:'Save requested plan',exact:true}).click();
 await expect(page.getByRole('button',{name:'Activate Free workspace',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:/I accept these application terms/}).check();
 await page.getByRole('button',{name:'Record current terms acceptance',exact:true}).click();
 await page.getByRole('button',{name:'Activate Free workspace',exact:true}).click();
 await expect(page.getByText('Free workspace activated. No charge was made.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Free workspace active',exact:true})).toBeDisabled();
 expect(mutations).toEqual(['PUT /api/organizations/'+organizationId+'/billing/plan','POST /api/organizations/'+organizationId+'/billing/terms','POST /api/organizations/'+organizationId+'/billing/activate-free']);
 await expect(page.getByRole('button',{name:'Continue to external payment link',exact:true})).toHaveCount(0);
});

test('Enterprise introduction inquiry records pending review and never requests a payment link or activation',async({page})=>{
 const organizationId='synthetic-qa-enterprise-org',mutations:string[]=[];
 let billing:{plan:string;organizationStatus:string;termsVersion:string;termsText:string;accepted:boolean;subscription:{status:string};enterpriseRequest:null|{status:string}}={plan:'Free',organizationStatus:'Draft',termsVersion:'synthetic-qa-terms',termsText:'Synthetic QA canonical application terms.',accepted:false,subscription:{status:'Pending'},enterpriseRequest:null};
 await page.route('**/api/pricing',route=>route.fulfill({json:{plans:[{plan:'Free',amount:0,currency:'KRW',interval:'month',configured:true,requiresPayment:false},{plan:'Startup',amount:49000,currency:'KRW',interval:'month',configured:false,requiresPayment:true},{plan:'Business',amount:149000,currency:'KRW',interval:'month',configured:false,requiresPayment:true},{plan:'Enterprise',amount:null,currency:'KRW',interval:'custom',configured:true,requiresPayment:false}],paymentVerificationAvailable:false}}));
 await page.route('**/api/account',route=>route.fulfill({json:{user:{id:'synthetic-qa-owner',name:'Synthetic QA Owner',email:'synthetic-qa@example.com'},organizations:[{id:organizationId,name:'Synthetic QA Enterprise',role:'Owner',plan:'Free',status:'Draft',workspaceId:'synthetic-qa-workspace'}],pending:[]}}));
 await page.route('**/api/organizations/'+organizationId+'/billing',route=>route.fulfill({json:billing}));
 await page.route('**/api/organizations/'+organizationId+'/billing/plan',async route=>{expect(route.request().postDataJSON()).toEqual({plan:'Enterprise'});billing={...billing,plan:'Enterprise'};await route.fulfill({json:billing})});
 await page.route('**/api/organizations/'+organizationId+'/billing/terms',async route=>{expect(route.request().postDataJSON()).toEqual({termsVersion:'synthetic-qa-terms',accepted:true});billing={...billing,accepted:true};await route.fulfill({json:billing})});
 await page.route('**/api/organizations/'+organizationId+'/billing/enterprise',async route=>{expect(billing.plan).toBe('Enterprise');expect(billing.accepted).toBe(true);expect(route.request().postDataJSON()).toEqual({notes:'Synthetic QA introduction inquiry. Not a real contract or order.'});billing={...billing,enterpriseRequest:{status:'Pending'}};await route.fulfill({json:billing})});
 page.on('request',request=>{if(['POST','PUT','PATCH','DELETE'].includes(request.method()))mutations.push(request.method()+' '+new URL(request.url()).pathname)});
 await page.goto('/pricing?organizationId='+organizationId);
 await expect(page.getByRole('combobox',{name:'Requested plan',exact:true})).toHaveValue('Free');
 await page.getByRole('button',{name:'Contact sales',exact:true}).click();
 await page.getByRole('button',{name:'Save requested plan',exact:true}).click();
 await page.getByRole('checkbox',{name:/I accept these application terms/}).check();
 await page.getByRole('button',{name:'Record current terms acceptance',exact:true}).click();
 await page.getByLabel('Enterprise inquiry notes',{exact:true}).fill('Synthetic QA introduction inquiry. Not a real contract or order.');
 await page.getByRole('button',{name:'Submit Enterprise inquiry',exact:true}).click();
 await expect(page.getByText('Request status: Pending',{exact:true})).toBeVisible();
 await expect(page.getByText('Enterprise inquiry submitted for human review. No contract, payment or activation was completed.',{exact:true})).toBeVisible();
 expect(billing.organizationStatus).toBe('Draft');expect(billing.subscription.status).toBe('Pending');
 expect(mutations).toEqual(['PUT /api/organizations/'+organizationId+'/billing/plan','POST /api/organizations/'+organizationId+'/billing/terms','POST /api/organizations/'+organizationId+'/billing/enterprise']);
 await expect(page.getByRole('button',{name:'Continue to external payment link',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Activate Free workspace',exact:true})).toHaveCount(0);
});

test('operator inbox clears inquiry details when server permission is lost',async({page})=>{
 const adminSession=await isolatedAdminSession(page);
 let allowed=true;
 const inquiry={id:'synthetic-qa-inquiry',organizationId:'synthetic-qa-org',companyName:'Synthetic QA Inbox Company',requesterName:'Synthetic QA Requester',requesterEmail:'synthetic-qa-requester@example.com',notes:'Synthetic QA confidential inquiry notes',status:'Pending',createdAt:new Date().toISOString(),reviewedAt:null,reviewNotes:''};
 await page.route('**/api/admin/session',route=>route.fulfill({json:adminSession}));
 await page.route(new RegExp('/api/admin/inquiries(?:[?].*)?$'),route=>allowed?route.fulfill({json:{inquiries:[inquiry]}}):route.fulfill({status:403,json:{error:{code:'PLATFORM_ADMIN_REQUIRED',message:'Explicit platform operator authorization is required.',retryable:false}}}));
 await page.route('**/api/admin/inquiries/'+inquiry.id,route=>route.fulfill({json:{inquiry,notes:[],activity:[],notifications:[]}}));
 await page.goto('/admin/inquiries');
 await page.getByRole('button',{name:inquiry.companyName,exact:true}).click();
 await expect(page.getByRole('region',{name:'Selected enterprise inquiry',exact:true}).getByText(inquiry.notes,{exact:true})).toBeVisible();
 allowed=false;
 await page.getByRole('button',{name:'Refresh inquiries',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Operator access required',exact:true})).toBeVisible();
 await expect(page.getByText(inquiry.companyName,{exact:true})).toHaveCount(0);
 await expect(page.getByText(inquiry.requesterEmail,{exact:true})).toHaveCount(0);
 await expect(page.getByText(inquiry.notes,{exact:true})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Selected enterprise inquiry',exact:true})).toHaveCount(0);
});
test('SyntheticQA real Enterprise inquiry reaches only the authorized platform operator inbox',async({page,browser})=>{
 test.setTimeout(60000);
 const base=process.env.BORDERLESS_QA_URL||'http://localhost:3217';
 const target=new URL(base);
 test.skip(!['localhost','127.0.0.1'].includes(target.hostname)||target.port!=='3219','Real operator QA requires the explicitly isolated local server3219.');
 const {readFile,access}=await import('node:fs/promises');
 let ready=true;try{await access('/tmp/borderless-qa-fixture.json')}catch{ready=false}
 test.skip(!ready,'Private isolated QA operator fixture is required.');
 const fixture=JSON.parse(await readFile('/tmp/borderless-qa-fixture.json','utf8')) as {reviewerEmail:string;reviewerPassword:string;adminLogin:string;adminPassword:string};
 const marker='SyntheticQA-Inquiry-'+Date.now(),email=marker.toLowerCase()+'@example.com';
 await page.context().setExtraHTTPHeaders({'x-test-ip':'198.19.'+Math.floor(Math.random()*255)+'.'+(1+Math.floor(Math.random()*253))});
 async function call(method:'get'|'post'|'put',path:string,data?:unknown){const response=await page.request[method](path,{headers:{origin:base},...(data===undefined?{}:{data})});expect(response.status()).toBe(200);return response.json()}
 await call('post','/api/auth/sign-up/email',{name:marker+' Requester',email,password:'SyntheticQA-inquiry-password-2026!'});
 const org=await call('post','/api/organizations',{name:marker+' Company'});
 await call('put','/api/organizations/'+org.id+'/billing/plan',{plan:'Enterprise'});
 const current=await call('get','/api/organizations/'+org.id+'/billing');
 await call('post','/api/organizations/'+org.id+'/billing/terms',{termsVersion:current.termsVersion,accepted:true});
 await call('post','/api/organizations/'+org.id+'/billing/enterprise',{notes:marker+' requested enterprise introduction. Synthetic QA, not a contract or order.'});
 expect((await call('get','/api/account')).platformAdmin).not.toBe(true);
 expect((await page.request.get('/api/admin/inquiries')).status()).toBe(401);
 const operatorContext=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true,extraHTTPHeaders:{origin:base,'x-test-ip':'198.19.'+Math.floor(Math.random()*255)+'.'+(1+Math.floor(Math.random()*253))}});
 try{
  expect((await operatorContext.request.post('/api/admin/login',{data:{loginId:fixture.adminLogin,password:fixture.adminPassword}})).status()).toBe(200);
  const operator=await operatorContext.newPage();
  await operator.goto('/admin/inquiries');
  await operator.getByRole('button',{name:marker+' Company',exact:true}).click();
  const detail=operator.getByRole('region',{name:'Selected enterprise inquiry',exact:true});
  await expect(detail.getByText(email,{exact:true})).toBeVisible();
  await expect(detail.getByText(marker+' requested enterprise introduction. Synthetic QA, not a contract or order.',{exact:true})).toBeVisible();
  await detail.getByText('Legacy operator review',{exact:true}).click();
  await detail.getByRole('combobox',{name:'Operator review status',exact:true}).selectOption('In Review');
  await detail.getByRole('textbox',{name:'Operator review notes',exact:true}).fill('Synthetic QA operator handling review only; no agreement or payment.');
  await detail.getByRole('button',{name:'Save inquiry review',exact:true}).click();
  await expect(operator.getByText('Inquiry review updated. No payment, contract or paid activation was performed.',{exact:true})).toBeVisible();
  await operator.getByRole('combobox',{name:'Inquiry status filter',exact:true}).selectOption('In Review');
  await operator.getByRole('button',{name:marker+' Company',exact:true}).click();
  await operator.getByText('Legacy operator review',{exact:true}).click();
  await expect(operator.getByRole('textbox',{name:'Operator review notes',exact:true})).toHaveValue('Synthetic QA operator handling review only; no agreement or payment.');
  const recorded=await call('get','/api/organizations/'+org.id+'/billing');
  expect(recorded.enterpriseRequest.status).toBe('In Review');
  expect(recorded.organizationStatus).toBe('Draft');expect(recorded.subscription.status).toBe('Pending');
 }finally{await operatorContext.close()}
});

test('SyntheticQA Enterprise Sales CRM persists assignment, notes and pipeline without activating payment',async({page,browser})=>{
 test.setTimeout(60000);
 const base=process.env.BORDERLESS_QA_URL||'http://localhost:3217',target=new URL(base);
 test.skip(!['localhost','127.0.0.1'].includes(target.hostname)||target.port!=='3219','Real sales CRM QA requires the explicitly isolated local server3219.');
 const {readFile,access}=await import('node:fs/promises');let ready=true;try{await access('/tmp/borderless-qa-fixture.json')}catch{ready=false}
 test.skip(!ready,'Private isolated QA operator fixture is required.');
 const fixture=JSON.parse(await readFile('/tmp/borderless-qa-fixture.json','utf8')) as {reviewerEmail:string;reviewerPassword:string;adminLogin:string;adminPassword:string};
 const marker='SyntheticQA-Sales-'+Date.now(),companyName=marker+' Company';
 await page.context().setExtraHTTPHeaders({'x-test-ip':'198.19.'+Math.floor(Math.random()*255)+'.'+(1+Math.floor(Math.random()*253))});
 async function companyCall(method:'get'|'post'|'put',path:string,data?:unknown){const response=await page.request[method](path,{headers:{origin:base},...(data===undefined?{}:{data})});expect(response.status()).toBe(200);return response.json()}
 await companyCall('post','/api/auth/sign-up/email',{name:marker+' Requester',email:marker.toLowerCase()+'@example.com',password:'SyntheticQA-sales-password-2026!'});
 const org=await companyCall('post','/api/organizations',{name:companyName});
 await companyCall('put','/api/organizations/'+org.id+'/billing/plan',{plan:'Enterprise'});
 const before=await companyCall('get','/api/organizations/'+org.id+'/billing');
 await companyCall('post','/api/organizations/'+org.id+'/billing/terms',{termsVersion:before.termsVersion,accepted:true});
 const submitted=await companyCall('post','/api/organizations/'+org.id+'/billing/enterprise',{notes:marker+' sales inquiry. Synthetic QA only, not a signed agreement.'});
 const inquiryId=submitted.enterpriseRequest.id;
 const context=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true,extraHTTPHeaders:{origin:base,'x-test-ip':'198.19.'+Math.floor(Math.random()*255)+'.'+(1+Math.floor(Math.random()*253))}});
 try{
  expect((await context.request.post('/api/admin/login',{data:{loginId:fixture.adminLogin,password:fixture.adminPassword}})).status()).toBe(200);
  const account=await (await context.request.get('/api/admin/session')).json();expect(account.user).toBeTruthy();expect(account.user.isDemo).toBe(false);
  const operator=await context.newPage();
  await operator.goto('/admin/inquiries?'+new URLSearchParams({inquiryId}));
  const detail=operator.getByRole('region',{name:'Selected enterprise inquiry',exact:true});
  await expect(detail.getByRole('heading',{name:companyName,exact:true})).toBeVisible();
  await detail.getByRole('combobox',{name:'Sales assignee',exact:true}).selectOption(account.user.id);
  for(const stage of ['Contacted','Negotiating','Won']){
   await detail.getByRole('combobox',{name:'Sales stage',exact:true}).selectOption(stage);
   const saved=operator.waitForResponse(response=>new URL(response.url()).pathname==='/api/admin/inquiries/'+inquiryId&&response.request().method()==='PATCH');
   await detail.getByRole('button',{name:'Save sales pipeline',exact:true}).click();
   const response=await saved;expect(response.status()).toBe(200);expect((await response.json()).salesStatus).toBe(stage);
   await expect(operator.getByText('Sales pipeline updated. No subscription or contract was activated.',{exact:true})).toBeVisible();
  }
  const note=marker+' operator follow-up note. Won does not activate paid service.';
  await detail.getByLabel('New sales note',{exact:true}).fill(note);
  await detail.getByRole('button',{name:'Add sales note',exact:true}).click();
  await expect(detail.locator('.sales-notes article').getByText(note,{exact:true})).toBeVisible();
  await operator.getByLabel('Search enterprise inquiries',{exact:true}).fill(marker);
  const searchResponse=operator.waitForResponse(response=>new URL(response.url()).pathname==='/api/admin/inquiries'&&new URL(response.url()).searchParams.get('q')===marker);
  await operator.getByRole('button',{name:'Search inquiries',exact:true}).click();
  expect((await searchResponse).status()).toBe(200);
  await expect(operator.locator('.inquiry-table tbody tr')).toHaveCount(1);
  await operator.getByRole('combobox',{name:'Sales pipeline filter',exact:true}).selectOption('Won');
  await operator.getByRole('combobox',{name:'Assignee filter',exact:true}).selectOption(account.user.id);
  await operator.getByRole('button',{name:companyName,exact:true}).click();
  await expect(detail.getByRole('combobox',{name:'Sales assignee',exact:true})).toHaveValue(account.user.id);
  await expect(detail.locator('.sales-notes article').getByText(note,{exact:true})).toBeVisible();
  await expect(detail.locator('.sales-activity li').first()).toBeVisible();
  await expect(detail.locator('.sales-activity')).not.toContainText('[object Object]');
  await expect(detail.locator('.sales-activity')).toContainText('Negotiating → Won');
  const actual=await (await context.request.get('/api/admin/inquiries/'+inquiryId)).json();
  expect(actual.inquiry.salesStatus).toBe('Won');expect(actual.inquiry.assigneeId).toBe(account.user.id);
  expect(actual.notes.some((item:{body:string})=>item.body===note)).toBe(true);
  expect(actual.activity.length).toBeGreaterThan(0);
  expect(actual.notifications.length).toBeGreaterThan(0);
  for(const notification of actual.notifications)expect(['Pending','Sent','Failed','Retry Scheduled','Disabled']).toContain(notification.status);
  const billing=await companyCall('get','/api/organizations/'+org.id+'/billing');
  expect(billing.plan).toBe('Enterprise');expect(billing.organizationStatus).toBe('Draft');expect(billing.subscription.status).toBe('Pending');
  await operator.screenshot({path:'/tmp/borderless-sales-crm-qa.png',fullPage:true});
 }finally{await context.close()}
});
