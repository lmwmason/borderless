import {test,expect,type Page} from '@playwright/test';
import {access,readFile} from 'node:fs/promises';
import {randomUUID,randomInt} from 'node:crypto';
import adminCopy from '../src/i18n/catalogs/admin.json';
import commonCopy from '../src/i18n/catalogs/common.json';
import errorCopy from '../src/i18n/catalogs/errors.json';

const baseURL=process.env.BORDERLESS_QA_URL||'https://localhost:3219';
const fixturePath='/tmp/borderless-qa-fixture.json';
const ko=(source:string)=>({...commonCopy,...errorCopy,...adminCopy} as Record<string,string>)[source]||source;
test.use({baseURL,ignoreHTTPSErrors:true,actionTimeout:10000,viewport:{width:1440,height:1000},timezoneId:'UTC'});
test.beforeEach(async({context})=>{
 const target=new URL(baseURL);
 test.skip(!['localhost','127.0.0.1'].includes(target.hostname)||target.protocol!=='https:'||target.port!=='3219','Korean administrator QA requires the isolated HTTPS server on port 3219.');
 let ready=true;try{await access(fixturePath)}catch{ready=false}test.skip(!ready,'Private isolated administrator fixture is required.');
 await context.setExtraHTTPHeaders({'x-test-ip':`198.19.${randomInt(1,250)}.${randomInt(1,250)}`});
 await context.addCookies([{name:'borderless_locale',value:'ko',url:baseURL},{name:'borderless_locale_source',value:'manual',url:baseURL}]);
});
async function contained(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)}

test('SyntheticQA Korean administrator login, overview, CRM, templates and logout preserve localized controls and mobile containment',async({page})=>{
 test.setTimeout(90000);
 const credentials=JSON.parse(await readFile(fixturePath,'utf8')) as {adminLogin:string;adminPassword:string};
 expect(typeof credentials.adminLogin).toBe('string');expect(typeof credentials.adminPassword).toBe('string');
 const unexpectedRequests:string[]=[];
 page.on('request',request=>{if(!request.url().startsWith(baseURL))unexpectedRequests.push(new URL(request.url()).origin)});
 await page.goto('/ko/admin/login');await expect(page.locator('html')).toHaveAttribute('lang','ko');
 await expect(page.getByRole('heading',{name:ko('Admin Console sign in'),exact:true})).toBeVisible();
 const login=page.getByLabel(ko('Admin login ID'),{exact:true}),password=page.getByLabel(ko('Admin password'),{exact:true});
 await expect(login).toHaveValue('');await expect(password).toHaveValue('');
 expect(await login.evaluate((input:HTMLInputElement)=>input.required&&!input.checkValidity())).toBe(true);
 await login.fill(credentials.adminLogin);await password.fill(randomUUID()+randomUUID());
 await page.getByRole('button',{name:ko('Sign in to Admin Console'),exact:true}).click();
 await expect(page.locator('.alert.error[role=alert]')).toHaveText(ko('Invalid administrator credentials.'));await expect(password).toHaveValue('');
 await password.fill(credentials.adminPassword);await page.getByRole('button',{name:ko('Sign in to Admin Console'),exact:true}).click();
 await expect(page).toHaveURL(/\/ko\/admin$/);await expect(page.locator('html')).toHaveAttribute('lang','ko');
 await expect(page.getByRole('heading',{name:ko('Admin Console'),exact:true})).toBeVisible();
 const adminNav=page.getByRole('navigation',{name:ko('Admin Console navigation'),exact:true});
 await expect(adminNav.getByRole('link',{name:ko('Enterprise inquiries'),exact:true})).toHaveAttribute('href','/ko/admin/inquiries');
 const sections=page.getByRole('navigation',{name:ko('Administration sections'),exact:true});
 for(const label of ['Overview','Organizations','Users','Audit activity'])await expect(sections.getByRole('button',{name:ko(label),exact:true})).toBeVisible();
 await expect(page.locator('.admin-stats')).toContainText(ko('Active subscriptions'));
 await page.setViewportSize({width:390,height:844});await contained(page);
 await page.screenshot({path:'/tmp/borderless-admin-ko-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await sections.getByRole('button',{name:ko('Organizations'),exact:true}).click();
 await expect(page.getByRole('columnheader',{name:ko('Plan / subscription'),exact:true})).toBeVisible();
 const organization=page.locator('.admin-console-main tbody .table-link').first();
 if(await organization.count()){
  await organization.click();
  await page.getByLabel(ko('Contract starts at'),{exact:true}).fill('2026-11-02T00:00');
  await page.getByLabel(ko('Contract ends at'),{exact:true}).fill('2026-11-01T00:00');
  await page.getByLabel(ko('Contract reference'),{exact:true}).fill('SyntheticQA locale validation only '+randomUUID());
  await page.getByRole('button',{name:ko('Preview contract changes'),exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:ko('Choose valid contract dates with the end after the start.')})).toBeVisible();
 }
 await adminNav.getByRole('link',{name:ko('Enterprise inquiries'),exact:true}).click();
 await expect(page).toHaveURL(/\/ko\/admin\/inquiries$/);
 await expect(page.getByRole('heading',{name:ko('Enterprise inquiry inbox'),exact:true})).toBeVisible();
 const salesFilter=page.getByRole('combobox',{name:ko('Sales pipeline filter'),exact:true});
 await expect(salesFilter.locator('option[value="Won"]')).toHaveText(ko('Won'));await salesFilter.selectOption('Won');await expect(salesFilter).toHaveValue('Won');
 await page.setViewportSize({width:390,height:844});await contained(page);await page.setViewportSize({width:1440,height:1000});
 await adminNav.getByRole('link',{name:ko('Templates'),exact:true}).click();
 await expect(page).toHaveURL(/\/ko\/admin\/subscriptions\/templates$/);
 await expect(page.getByRole('heading',{name:ko('Subscription templates'),exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:ko('Template status filter'),exact:true}).locator('option[value="Archived"]')).toHaveText(ko('Archived'));
 await page.getByRole('button',{name:ko('New template'),exact:true}).click();
 await expect(page.getByRole('status')).toHaveText(ko('New template draft. No organization has been changed.'));
 await expect(page.getByText(ko('Member limit'),{exact:true})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:new RegExp('^'+ko('Expert collaboration'))})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await contained(page);
 await page.screenshot({path:'/tmp/borderless-admin-templates-ko-mobile.png',fullPage:true});
 await page.getByRole('button',{name:ko('Admin sign out'),exact:true}).click();
 await expect(page).toHaveURL(/\/ko\/admin\/login$/);await expect(page.locator('html')).toHaveAttribute('lang','ko');
 const session=await page.request.get('/api/admin/session');expect(session.status()).toBe(200);expect((await session.json()).user).toBeNull();
 expect((await page.context().cookies()).find(cookie=>cookie.name==='borderless_locale')?.value).toBe('ko');
 expect(unexpectedRequests).toEqual([]);
});
