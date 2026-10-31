import {NextRequest} from 'next/server';
import {proxy} from '../src/proxy';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import ts from 'typescript';
import {parse} from '@formatjs/icu-messageformat-parser';
import {detectLocale,isLocale,localePath} from '../src/i18n/text';
import {catalogs,translateCopy} from '../src/i18n/messages';
import {legalText,generatedTaskTitle} from '../src/lib/legal/presentation';
import {evaluateRules,evaluateTopic,TOPIC_SOURCES} from '../src/lib/legal/rules';
import type {Company} from '../src/lib/contracts';
import {GET as getLocale,POST as saveLocale} from '../src/app/api/locale/route';
import {POST as adminLogout} from '../src/app/api/admin/logout/route';
import {getAuth} from '../src/lib/auth';
import {register,registerAdmin,testOrigin,responseCookie} from './helpers';

test('locale negotiation respects highest supported preference, language region, quality and English fallback',()=>{
 assert.equal(detectLocale('ko-KR,ko;q=0.9,en;q=0.8'),'ko');
 assert.equal(detectLocale('en-US;q=1,ko;q=0.9'),'en');
 assert.equal(detectLocale('ja;q=1,ko;q=0.9'),'en','top non-Korean preference defaults to English');
 assert.equal(detectLocale('en;q=0.2,KO-kr;q=0.9'),'ko');
 assert.equal(detectLocale('ko;q=invalid,en;q=0.8'),'en');
 assert.equal(detectLocale('ko;q=0,en;q=0.1'),'en');
 assert.equal(detectLocale('ko;q=2,en;q=1'),'en','out-of-range quality is invalid');
 assert.equal(detectLocale('ko;q=-1,en;q=1'),'en');
 assert.equal(detectLocale(null),'en');assert.equal(detectLocale(''),'en');
 assert.equal(isLocale('ko'),true);assert.equal(isLocale('en'),true);assert.equal(isLocale('ko-KR'),false);assert.equal(isLocale('fr'),false);
});

test('localized links preserve query and hash while APIs, external links and assets stay unchanged',()=>{
 assert.equal(localePath('/pricing?plan=Free#details','ko'),'/ko/pricing?plan=Free#details');
 assert.equal(localePath('/en/workspace?projectId=p#tasks','ko'),'/ko/workspace?projectId=p#tasks');
 assert.equal(localePath('/ko/account?auth=signin#form','en'),'/en/account?auth=signin#form');
 assert.equal(localePath('/','ko'),'/ko/');
 for(const path of ['/api/locale','/api/projects/p?x=1','/_next/static/chunk.js','/borderless-logo.png','/report.pdf?download=1#page=2','https://example.test/path','//example.test/path','#tasks'])assert.equal(localePath(path,'ko'),path);
});

test('curated legal translations preserve structured judgments, original explanations and unknown text without inference',()=>{
 const company:Company={id:'i18n-fixture',name:'Original company 이름',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:0,processesPersonalData:null,updatedAt:'2026-10-31T00:00:00.000Z'};
 const findings=[...evaluateRules(company,'i18n-scenario'),...Object.keys(TOPIC_SOURCES).slice(6).map(topic=>evaluateTopic(company,'i18n-scenario',topic))];
 const before=structuredClone(findings),companyBefore=structuredClone(company);
 for(const finding of findings){
  assert.notEqual(legalText(finding.topic,'ko'),finding.topic);
  assert.notEqual(legalText(finding.summary,'ko'),finding.summary);
  assert.equal(legalText(finding.summary,'en'),finding.summary);
  for(const key of finding.missingFacts){const original=`Confirm ${key} for ${finding.topic}.`;assert.notEqual(legalText(original,'ko'),original);}
  const amended=finding.summary+' Structured model review flagged a possible exception or disagreement; human review is required. Source verification is stale or unavailable; recheck before relying on this finding.';
  assert.notEqual(legalText(amended,'ko'),amended);assert.equal(legalText(amended,'en'),amended);
 }
 assert.deepEqual(findings,before);assert.deepEqual(company,companyBefore);
 assert.equal(legalText('Unknown model-authored explanation','ko'),'Unknown model-authored explanation');
 assert.equal(legalText('https://official.example.test/legal','ko'),'https://official.example.test/legal');
 assert.equal(generatedTaskTitle('User-authored work 메모','ko'),'User-authored work 메모');
 assert.equal(generatedTaskTitle('Review: Unknown topic','ko'),'Review: Unknown topic');
 assert.equal(generatedTaskTitle('Review: California privacy','ko'),'검토: 캘리포니아 개인정보 보호');
 assert.equal(generatedTaskTitle('Review: California privacy','en'),'Review: California privacy');
 // These presentation functions are synchronous and receive only text/locale;
 // no model client, inference invocation or stored assessment update is involved.
});

test('all catalogs are valid ICU and user-flow literal copies have Korean catalog coverage',()=>{
 for(const [scope,catalog] of Object.entries(catalogs))for(const [source,translation] of Object.entries(catalog)){
  assert.doesNotThrow(()=>parse(source),`${scope} English ICU: ${source}`);
  assert.doesNotThrow(()=>parse(translation),`${scope} Korean ICU: ${source}`);
 }
 let calls=0;
 for(const [name,scope] of [['account-app','account'],['workspace-app','workspace'],['change-impact','workspace'],['admin-console','admin'],['admin-contract-builder','admin'],['admin-feature-editor','admin'],['admin-login','admin'],['admin-shared','admin'],['admin-templates','admin'],['operator-inquiries','admin'],['expert-engagements','experts'],['expert-hub','experts'],['expert-marketplace','experts'],['expert-profile','experts'],['expert-resources','experts'],['expert-shared','experts'],['expert-geography','experts'],['expert-localized','experts'],['pricing-page','billing'],['billing-return-page','billing'],['billing-comparison','billing'],['korean-checkout-consent','billing'],['organization-logo','common'],['organization-logo-uploader','common']] as const){
  const source=readFileSync(new URL(`../src/components/${name}.tsx`,import.meta.url),'utf8');
  const ast=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const merged={...catalogs.common,...catalogs.errors,...catalogs[scope]};
  const walk=(node:ts.Node)=>{
   if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='option'&&node.getText(ast).includes('t('))assert.ok(node.openingElement.attributes.properties.some(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(ast)==='value'),`${name}: translated option needs a stable server value`);
   if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='t'&&node.arguments[0]){
    const leaves=(value:ts.Node):string[]=>ts.isStringLiteral(value)?[value.text]:ts.isConditionalExpression(value)?[...leaves(value.whenTrue),...leaves(value.whenFalse)]:[];
    for(const text of leaves(node.arguments[0])){calls++;assert.ok(Object.hasOwn(merged,text),`${name}: missing ${text}`);}
    let ancestor:ts.Node|undefined=node.parent;
    while(ancestor&&!ts.isSourceFile(ancestor)){
     if(ts.isJsxAttribute(ancestor)){
      assert.ok(!['value','key','className','type','autoComplete','aria-current','initialTab','href','aria-describedby'].includes(ancestor.name.getText(ast)),`${name}: translating a machine attribute`);break;
     }
     ancestor=ancestor.parent;
    }
   }
   ts.forEachChild(node,walk);
  };
  walk(ast);
 }
 assert.ok(calls>400,'the complete account and workspace flows must be covered');
 assert.equal(translateCopy('ko','workspace','Current topic: {topic}',{topic:'Company 이름'}),'현재 검토 주제: Company 이름');
 assert.equal(translateCopy('en','workspace','{count} references',{count:3}),'3 references');
 assert.equal(translateCopy('ko','workspace','{count} references',{count:3}),'참조 3개');
});

const localeRequest=(cookie='',body?:unknown)=>new Request(testOrigin()+'/api/locale',{
 method:body===undefined?'GET':'POST',headers:{cookie,origin:testOrigin(),host:new URL(testOrigin()).host,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})
});

test('locale HTTP API persists separate regular/admin preferences and keeps browser locale after logout',async()=>{
 const regular=await register('locale-http-user'),other=await register('locale-http-other'),admin=await registerAdmin('locale-http-admin');
 const owner=new Pool({connectionString:process.env.DIRECT_DATABASE_URL,max:1});
 try{
  const before=Number((await owner.query('SELECT count(*) FROM user_preferences')).rows[0].count);
  const anonymous=await saveLocale(localeRequest('',{locale:'ko'}));assert.equal(anonymous.status,200);
  assert.deepEqual(await anonymous.json(),{locale:'ko',authenticated:false});
  const browserCookie=responseCookie(anonymous);
  assert.match(browserCookie,/borderless_locale=ko/);assert.match(browserCookie,/borderless_locale_source=manual/);
  const setCookies=anonymous.headers.getSetCookie().join(';');assert.match(setCookies,/Path=\//);assert.match(setCookies,/SameSite=Lax/);assert.match(setCookies,/Max-Age=31536000/);
  assert.equal(Number((await owner.query('SELECT count(*) FROM user_preferences')).rows[0].count),before,'anonymous locale selection must not write a preference row');
  assert.deepEqual(await (await getLocale(localeRequest(browserCookie))).json(),{locale:null,authenticated:false});
  const invalid=await saveLocale(localeRequest(regular.cookie,{locale:'fr'}));assert.equal(invalid.status,400);assert.equal(invalid.headers.getSetCookie().length,0);
  assert.deepEqual(await (await getLocale(localeRequest(regular.cookie))).json(),{locale:null,authenticated:true});
  const regularSave=await saveLocale(localeRequest(regular.cookie,{locale:'ko'}));assert.equal(regularSave.status,200);assert.deepEqual(await regularSave.json(),{locale:'ko',authenticated:true});
  assert.deepEqual(await (await getLocale(localeRequest(other.cookie))).json(),{locale:null,authenticated:true});
  const adminSave=await saveLocale(localeRequest(admin.cookie,{locale:'en'}));assert.equal(adminSave.status,200);assert.deepEqual(await adminSave.json(),{locale:'en',authenticated:true});
  assert.deepEqual(await (await getLocale(localeRequest(admin.cookie))).json(),{locale:'en',authenticated:true});
  assert.deepEqual(await (await getLocale(localeRequest(regular.cookie))).json(),{locale:'ko',authenticated:true});
  const regularBrowserCookie=responseCookie(regularSave),adminBrowserCookie=responseCookie(adminSave);
  const logout=await getAuth().handler(new Request(testOrigin()+'/api/auth/sign-out',{method:'POST',headers:{cookie:regular.cookie+'; '+regularBrowserCookie,origin:testOrigin(),host:new URL(testOrigin()).host,'Content-Type':'application/json'},body:'{}'}));
  assert.equal(logout.status,200);assert.ok(!logout.headers.getSetCookie().some(value=>/^borderless_locale(?:_source)?=/.test(value)),'regular logout must leave locale cookies alone');
  const adminOut=await adminLogout(new Request(testOrigin()+'/api/admin/logout',{method:'POST',headers:{cookie:admin.cookie+'; '+adminBrowserCookie,origin:testOrigin(),host:new URL(testOrigin()).host,'Content-Type':'application/json'},body:'{}'}));
  assert.equal(adminOut.status,200);assert.ok(!adminOut.headers.getSetCookie().some(value=>/^borderless_locale(?:_source)?=/.test(value)),'administrator logout must leave locale cookies alone');
  assert.deepEqual(await (await getLocale(localeRequest(regularBrowserCookie))).json(),{locale:null,authenticated:false});
  const rows=(await owner.query('SELECT user_id,locale FROM user_preferences WHERE user_id=ANY($1::text[]) ORDER BY user_id',[[regular.user.id,admin.user.id]])).rows;
  assert.deepEqual(new Map(rows.map(row=>[row.user_id,row.locale])),new Map([[regular.user.id,'ko'],[admin.user.id,'en']]));
 }finally{await owner.end();}
});


test('locale proxy uses real page segments without rewrite recursion and leaves APIs unprefixed',()=>{
 for(const locale of ['ko','en']){
  const response=proxy(new NextRequest('https://example.test/'+locale+'/pricing?plan=Startup'));
  assert.equal(response.status,200);assert.equal(response.headers.get('x-middleware-rewrite'),null);assert.equal(response.headers.get('location'),null);
  assert.equal(response.headers.get('x-middleware-request-x-borderless-locale'),locale);
 }
 const legacy=proxy(new NextRequest('https://example.test/pricing?plan=Free',{headers:{'accept-language':'ko-KR'}}));
 assert.equal(legacy.status,307);assert.equal(legacy.headers.get('location'),'https://example.test/ko/pricing?plan=Free');
 assert.equal(proxy(new NextRequest('https://example.test/api/pricing')).status,200);
 assert.equal(proxy(new NextRequest('https://example.test/ko/api/pricing')).status,404);
});


test('temporary Korean checkout preserves account language and restores the English page route',()=>{
 const start=proxy(new NextRequest('https://example.test/ko/pricing?checkoutFrom=en&returnLocale=en',{headers:{cookie:'borderless_locale=en; borderless_locale_source=manual'}}));
 assert.equal(start.status,200);assert.match(start.headers.getSetCookie().join(';'),/borderless_locale_source=checkout/);assert.match(start.headers.getSetCookie().join(';'),/borderless_checkout_return_locale=en/);
 const browserCookie='borderless_locale=ko; borderless_locale_source=checkout; borderless_checkout_return_locale=en';
 const returned=proxy(new NextRequest('https://example.test/ko/billing/return',{headers:{cookie:browserCookie}}));assert.equal(returned.status,200);
 const leaving=proxy(new NextRequest('https://example.test/ko/?view=billing',{headers:{cookie:browserCookie}}));assert.equal(leaving.status,307);assert.equal(leaving.headers.get('location'),'https://example.test/en/?view=billing');assert.match(leaving.headers.getSetCookie().join(';'),/borderless_locale=en/);
 const api=proxy(new NextRequest('https://example.test/api/pricing',{headers:{cookie:browserCookie,'x-borderless-locale':'en'}}));assert.equal(api.headers.get('x-middleware-request-x-borderless-locale'),'ko','proxy overwrites an untrusted locale header');
});
