import {test,expect,type Page} from '@playwright/test';
import billing from '../src/i18n/catalogs/billing.json';
import account from '../src/i18n/catalogs/account.json';
import {KOREAN_CHECKOUT_NOTICE} from '../src/components/korean-checkout-consent';
const baseURL=process.env.BORDERLESS_QA_URL||'https://localhost:3219';
const copy=(source:string)=>({...account,...billing} as Record<string,string>)[source]||source;
const pricing={paymentVerificationAvailable:false,plans:[{plan:'Free',amount:0,currency:'KRW',interval:'month',configured:true,requiresPayment:false},{plan:'Startup',amount:49000,currency:'KRW',interval:'month',configured:true,requiresPayment:true},{plan:'Business',amount:149000,currency:'KRW',interval:'month',configured:true,requiresPayment:true},{plan:'Enterprise',amount:null,currency:'KRW',interval:'custom',configured:true,requiresPayment:false}]};
const user={id:'synthetic-selection-user',name:'Synthetic QA',email:'synthetic-selection@example.test'};
test.use({baseURL,ignoreHTTPSErrors:true});
async function setup(page:Page,{signedIn=false,organizations=[] as unknown[]}={}){
 let authenticated=signedIn;const payments:string[]=[],external:string[]=[];
 page.on('request',request=>{if(/\/billing\/(payment-link|checkout)(?:\?|$)/.test(request.url()))payments.push(request.url());if(!request.url().startsWith(baseURL))external.push(new URL(request.url()).origin)});
 await page.route('**/api/pricing',route=>route.fulfill({json:pricing}));
 await page.route('**/api/account',route=>route.fulfill({json:{user:authenticated?user:null,organizations:authenticated?organizations:[],pending:[]}}));
 await page.route('**/api/locale',route=>route.fulfill({json:{locale:'ko',authenticated}}));
 await page.route('**/api/auth/sign-in/email',async route=>{expect(route.request().method()).toBe('POST');authenticated=true;await route.fulfill({json:{user}})});
 return {payments,external};
}
for(const plan of ['Startup','Business'] as const)test(`Korean ${plan} card opens sign in and preserves the chosen plan after authentication`,async({page})=>{
 const requests=await setup(page);await page.goto('/ko/pricing');
 const choose=page.getByRole('link',{name:copy('Select {plan}').replace('{plan}',plan),exact:true});
 await expect(choose).toHaveAttribute('href','/ko/?'+new URLSearchParams({auth:'signin',intent:'checkout',plan}));await choose.click();
 await expect(page.getByText(copy('Sign in to continue with {plan}. Your plan selection will be preserved.').replace('{plan}',plan),{exact:true})).toBeVisible();
 await page.getByLabel(copy('Email'),{exact:true}).fill(user.email);await page.getByLabel(copy('Password'),{exact:true}).fill('SyntheticQA-mocked-login-password!');
 await page.locator('form').getByRole('button',{name:copy('Sign in'),exact:true}).click();await expect(page).toHaveURL(new RegExp('/ko/pricing\\?plan='+plan+'$'));
 await expect(page.getByText(copy('{plan} selected. Choose your organization and review the terms below.').replace('{plan}',plan),{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:copy('Select {plan}').replace('{plan}',plan),exact:true})).toHaveAttribute('aria-pressed','true');
 expect(requests.payments).toEqual([]);expect(requests.external).toEqual([]);
});
test('Korean signed-in paid cards reveal organization setup and retain explicit selection after billing loads',async({page})=>{
 const id='synthetic-pricing-selection-org',requests=await setup(page,{signedIn:true,organizations:[{id,name:'Synthetic QA company',role:'Owner',plan:'Free',status:'Active',workspaceId:'synthetic-selection-workspace'}]});
 await page.route('**/api/organizations/'+id+'/billing',route=>route.fulfill({json:{plan:'Free',termsVersion:'synthetic-terms',termsText:'Synthetic terms only',accepted:false,organizationStatus:'Active',subscription:{status:'Active'}}}));
 await page.goto('/ko/pricing');
 for(const plan of ['Startup','Business']){
  await page.getByRole('button',{name:copy('Select {plan}').replace('{plan}',plan),exact:true}).click();
  await expect(page.locator('#pricing-organization')).toBeFocused();
  await expect(page.getByText(copy('{plan} selected. Choose your organization and review the terms below.').replace('{plan}',plan),{exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:copy('Billing organization'),exact:true}).selectOption(id);
  await expect(page.getByRole('combobox',{name:copy('Requested plan'),exact:true})).toHaveValue(plan);
 }
 await page.goto('/ko/?'+new URLSearchParams({auth:'signin',intent:'checkout',plan:'Business',next:'https://invalid.example/ignored'}));
 await expect(page).toHaveURL(/\/ko\/pricing\?plan=Business$/);await expect(page.getByRole('heading',{name:copy('Review organization and terms'),exact:true})).toBeVisible();
 expect(requests.payments).toEqual([]);expect(requests.external).toEqual([]);
});
test('English paid-card clicks immediately show the exact Korean checkout notice and direct language transition',async({page})=>{
 const requests=await setup(page);await page.route('**/api/locale',route=>route.fulfill({json:{locale:'en',authenticated:false}}));await page.goto('/en/pricing');
 for(const plan of ['Startup','Business']){
  await page.getByRole('button',{name:'Select '+plan,exact:true}).click();
  const card=page.locator('.pricing-plan').filter({has:page.getByRole('heading',{name:plan,exact:true})});const notice=card.getByRole('region',{name:'Korean checkout notice',exact:true});
  await expect(notice).toContainText(KOREAN_CHECKOUT_NOTICE);await expect(notice).toBeInViewport();
  await expect(notice.getByRole('link',{name:'Continue in Korean',exact:true})).toHaveAttribute('href','/ko/pricing?'+new URLSearchParams({plan,returnLocale:'en',checkoutFrom:'en'}));
  await expect(card.getByRole('button',{name:'Continue to checkout',exact:true})).toHaveCount(0);
 }
 expect(requests.payments).toEqual([]);expect(requests.external).toEqual([]);
});
