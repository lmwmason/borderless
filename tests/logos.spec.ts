import {test,expect,type APIRequestContext} from '@playwright/test';
import {access,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
const baseURL=process.env.BORDERLESS_QA_URL||'https://localhost:3219';
const password='SyntheticQA-logo-isolated-password-2026!';
const ip=()=>`198.19.${Math.floor(Math.random()*255)}.${1+Math.floor(Math.random()*253)}`;
test.use({baseURL,ignoreHTTPSErrors:true,actionTimeout:10000});
test.beforeEach(async({context})=>{const url=new URL(baseURL);test.skip(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='3219','Logo browser QA requires the explicitly isolated local PostgreSQL server3219.');let ready=true;try{await access('/tmp/borderless-qa-fixture.json')}catch{ready=false}test.skip(!ready,'Private isolated QA fixture is required.');await context.setExtraHTTPHeaders({'x-test-ip':ip()});});
async function call(api:APIRequestContext,method:'get'|'post'|'patch',path:string,data?:unknown){const response=await api[method](path,{headers:{origin:baseURL},...(data===undefined?{}:{data})});expect(response.status(),method+' '+path).toBe(200);return response.json()}
async function signup(api:APIRequestContext,marker:string){await call(api,'post','/api/auth/sign-up/email',{name:marker,email:marker.toLowerCase()+'@example.com',password})}
const image=async(width=80,height=40)=>({name:'synthetic-logo.png',mimeType:'image/png',buffer:await sharp({create:{width,height,channels:4,background:{r:30,g:70,b:110,alpha:0.7}}}).png().toBuffer()});
test('SyntheticQA organization logos preview, persist, preserve aspect ratio and respect company/admin roles',async({page,browser})=>{
 test.setTimeout(120000);
 const marker='SyntheticQA-Logo-'+randomUUID().slice(0,8),name=marker+' Company',first=await image();
 await signup(page.request,marker);await page.goto('/en/');
 await page.getByRole('textbox',{name:'Organization name',exact:true}).fill(name);
 await page.getByLabel('Organization logo (optional)',{exact:true}).setInputFiles(first);
 await expect(page.getByRole('img',{name:'Organization logo preview',exact:true})).toBeVisible();
 expect((await call(page.request,'get','/api/account')).organizations).toHaveLength(0);
 const createdResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/organizations'&&response.request().method()==='POST');
 const uploadedResponse=page.waitForResponse(response=>/\/api\/organizations\/[^/]+\/logo$/.test(new URL(response.url()).pathname)&&response.request().method()==='PUT');
 await page.getByRole('button',{name:'Create organization',exact:true}).click();
 const created=await createdResponse;expect(created.status()).toBe(200);const org=await created.json();
 const uploaded=await uploadedResponse;expect(uploaded.status()).toBe(200);const firstLogo=(await uploaded.json()).logo;
 expect(firstLogo.mimeType).toBe('image/webp');expect(firstLogo.width/firstLogo.height).toBe(2);
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 const settings=page.getByRole('region',{name:'Organization logo settings',exact:true});
 await expect(settings.getByRole('button',{name:'Delete organization logo',exact:true})).toBeVisible();
 const logo=page.locator(`img[src*="/api/organizations/${org.id}/logo"]`).first();await expect(logo).toBeVisible();await expect(logo).toHaveCSS('object-fit','contain');
 await page.reload();await page.getByRole('button',{name:new RegExp(name)}).filter({has:page.getByRole('heading',{name,exact:true})}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(settings.locator('img[src*="/logo"]')).toBeVisible();
 await settings.getByLabel('Organization logo (optional)',{exact:true}).setInputFiles(await image(40,80));
 await settings.getByRole('button',{name:'Replace organization logo',exact:true}).click();await expect(settings.getByText('Organization logo saved.',{exact:true})).toBeVisible();
 const current=(await call(page.request,'get','/api/account')).organizations.find((item:{id:string})=>item.id===org.id);expect(current.logo.id).not.toBe(firstLogo.id);expect(current.logo.width/current.logo.height).toBe(0.5);
 const billing=await call(page.request,'get','/api/organizations/'+org.id+'/billing');await call(page.request,'post','/api/organizations/'+org.id+'/billing/terms',{termsVersion:billing.termsVersion,accepted:true});await call(page.request,'post','/api/organizations/'+org.id+'/billing/activate-free',{});
 const project=await call(page.request,'post','/api/organizations/'+org.id+'/projects',{name:marker+' Project'});
 await page.goto('/en/');await page.locator('.organization-tile').filter({has:page.getByRole('heading',{name,exact:true})}).click();await page.locator('.project-tile').filter({has:page.getByRole('heading',{name:project.name,exact:true})}).click();
 await expect(page.locator('.sidebar img[src*="/logo"]')).toBeVisible();
 await page.setViewportSize({width:375,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'/tmp/borderless-organization-logo-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});
 const viewerContext=await browser.newContext({baseURL,ignoreHTTPSErrors:true,extraHTTPHeaders:{'x-test-ip':ip()}}),adminContext=await browser.newContext({baseURL,ignoreHTTPSErrors:true,extraHTTPHeaders:{'x-test-ip':ip()}});
 try{
  await signup(viewerContext.request,marker+'-viewer');const invite=await call(page.request,'post','/api/organizations/'+org.id+'/invites',{expiresInHours:1});await call(viewerContext.request,'post','/api/organizations/join',{code:invite.code});const account=await call(viewerContext.request,'get','/api/account'),detail=await call(page.request,'get','/api/organizations/'+org.id);const pending=detail.requests.find((item:{userId:string})=>item.userId===account.user.id);await call(page.request,'patch','/api/organizations/'+org.id+'/requests/'+pending.id,{decision:'approve',role:'Viewer'});
  const viewer=await viewerContext.newPage();await viewer.goto('/en/');await viewer.locator('.organization-tile').filter({has:viewer.getByRole('heading',{name,exact:true})}).click();await viewer.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(viewer.getByRole('region',{name:'Organization logo settings',exact:true}).locator('img')).toBeVisible();await expect(viewer.locator('input[type=file]')).toHaveCount(0);await expect(viewer.getByRole('button',{name:'Delete organization logo',exact:true})).toHaveCount(0);
  expect((await viewer.request.put('/api/organizations/'+org.id+'/logo',{headers:{origin:baseURL},multipart:{file:first}})).status()).toBe(403);
  const fixture=JSON.parse(await readFile('/tmp/borderless-qa-fixture.json','utf8'));await call(adminContext.request,'post','/api/admin/login',{loginId:fixture.adminLogin,password:fixture.adminPassword});await call(adminContext.request,'post','/api/locale',{locale:'en'});
  const admin=await adminContext.newPage();await admin.goto('/en/admin?organizationId='+org.id);await expect(admin.locator(`img[src*="/api/admin/organizations/${org.id}/logo"]`).first()).toBeVisible();
  await page.goto('/en/');await page.locator('.organization-tile').filter({has:page.getByRole('heading',{name,exact:true})}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await settings.getByRole('button',{name:'Delete organization logo',exact:true}).click();await expect(settings.getByText('Organization logo removed. Company initials are displayed instead.',{exact:true})).toBeVisible();expect((await call(page.request,'get','/api/account')).organizations.find((item:{id:string})=>item.id===org.id).logo).toBeNull();await expect(settings.locator('img')).toHaveCount(0);
 }finally{await viewerContext.close();await adminContext.close()}
});
test('SyntheticQA failed creation logo upload preserves the organization and retries the selected file',async({page})=>{
 const marker='SyntheticQA-LogoRetry-'+randomUUID().slice(0,8),name=marker+' Company';await signup(page.request,marker);await page.goto('/en/');
 await page.getByRole('textbox',{name:'Organization name',exact:true}).fill(name);
 await page.getByLabel('Organization logo (optional)',{exact:true}).setInputFiles({name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')});await expect(page.getByText('Choose a PNG, JPEG or WebP image.',{exact:true})).toBeVisible();
 await page.getByLabel('Organization logo (optional)',{exact:true}).setInputFiles(await image());
 let failed=false;await page.route('**/api/organizations/*/logo',async route=>{if(route.request().method()==='PUT'&&!failed){failed=true;await route.fulfill({status:503,json:{error:{message:'The organization logo could not be saved. Please retry.'}}})}else await route.continue()});
 await page.getByRole('button',{name:'Create organization',exact:true}).click();
 await expect(page.getByText('Organization created. Its logo upload did not finish. Retry in Organization settings.',{exact:true})).toBeVisible();
 const settings=page.getByRole('region',{name:'Organization logo settings',exact:true});await expect(settings.getByRole('img',{name:'Organization logo preview',exact:true})).toBeVisible();await expect(settings.getByRole('button',{name:'Upload organization logo',exact:true})).toBeEnabled();
 await settings.getByRole('button',{name:'Upload organization logo',exact:true}).click();await expect(settings.getByText('Organization logo saved.',{exact:true})).toBeVisible();const organizations=(await call(page.request,'get','/api/account')).organizations;expect(organizations).toHaveLength(1);expect(organizations[0].logo).toBeTruthy();
});
