import test from 'node:test';
import assert from 'node:assert/strict';
import type {Company} from '../contracts';
import {assess,evaluateRules,getSource,issueFingerprint,LIMITS,sources,validateSourceIds} from './index';
const base:Company={id:'co',name:'Example',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:true,updatedAt:'2026-10-31'};
const finding=(c:Company,t:string)=>evaluateRules(c,'s').find(f=>f.topic===t)!;
test('A remote / B California hire / C subsidiary produce distinct meaningful results',()=>{
 assert.equal(finding(base,'California employment').status,'not_applicable');
 assert.equal(finding({...base,usEmployees:1},'California employment').status,'review_required');
 assert.equal(finding(base,'US entity maintenance').status,'not_applicable');
 assert.equal(finding({...base,usEntity:true,salesModel:'subsidiary'},'US entity maintenance').status,'review_required');
});
test('unknown facts never become definite non-applicability',()=>{
 for(const f of evaluateRules({...base,usEntity:null,usEmployees:null,usOffice:null,salesModel:'unknown',processesPersonalData:null},'s'))assert.notEqual(f.status,'not_applicable');
});
test('registry has complete official source records and rejects unknown source ids',()=>{
 for(const s of sources){assert.match(s.url,/^https:\/\/([a-z.]+\.)?(gov|ca\.gov)\//);assert.equal(s.verified,true);assert.ok(s.agency&&s.requiredFacts.length&&s.excerptOrSection);}
 assert.equal(validateSourceIds(['fabricated']),false);assert.equal(getSource('fabricated'),undefined);
});
test('without model deterministic review is explicitly partial and unavailable',async()=>{
 const a=await assess(base,'s');assert.equal(a.partial,true);assert.equal(a.modelStatus,'unavailable');assert.equal(a.metrics?.modelCalls,0);
 assert.ok(a.limitations.some(l=>l.includes('NVIDIA unavailable')));
});
test('adversarial fabricated source or arbitrary topic is discarded',async()=>{
 for(const output of [{sourceIds:['fake'],questions:[],childTopics:[]},{sourceIds:[],questions:[],childTopics:['invented law']}]){const a=await assess(base,'s',async()=>output);assert.equal(a.partial,true);assert.ok(a.findings.every(f=>validateSourceIds(f.sourceIds)));assert.equal(a.modelStatus,'unavailable');}
});
test('cycles deduplicate and the planner remains within every budget',async()=>{
 const a=await assess(base,'s',async i=>({sourceIds:i.sourceIds,questions:[],childTopics:[i.topic,'Payroll wage and location review','Entity registration details']}));
 assert.ok(a.metrics!.nodes<=LIMITS.maxNodes);assert.ok(a.metrics!.modelCalls<=LIMITS.maxModelCalls);assert.ok(a.metrics!.maxDepth<=LIMITS.maxDepth);
 assert.equal(new Set(a.findings.map(f=>f.topic)).size,a.findings.length);
});
test('timeout returns promptly with visible partial assessment and no success',async()=>{
 const before=Date.now();const a=await assess(base,'s',()=>new Promise(()=>{}),{timeoutMs:20,callTimeoutMs:10});
 assert.ok(Date.now()-before<1000);assert.equal(a.partial,true);assert.equal(a.modelStatus,'unavailable');assert.ok(a.limitations.some(l=>l.includes('timed out')));
});
test('stale sources force review and partial state',async()=>{
 const a=await assess(base,'s',undefined,{now:Date.parse('2027-06-01')});assert.ok(a.findings.every(f=>f.status==='review_required'));assert.equal(a.partial,true);
});
test('fingerprint ignores company name but tracks relevant facts',()=>{
 assert.equal(issueFingerprint('California employment',base),issueFingerprint('California employment',{...base,name:'Other'}));
 assert.notEqual(issueFingerprint('California employment',base),issueFingerprint('California employment',{...base,usEmployees:1}));
 assert.equal(issueFingerprint('California employment',base),issueFingerprint('California employment',{...base,usEntity:true}));
});
test('model URLs are never surfaced as citation or question',async()=>{
 const a=await assess(base,'s',async()=>({sourceIds:[],questions:['see https://fake.example'],childTopics:[]}));
 assert.equal(a.partial,true);assert.ok(!a.questions.some(q=>q.includes('fake.example')));
});

test('model numeric thresholds and free-form assertions never enter user-facing output',async()=>{
 const a=await assess(base,'s',async i=>({sourceIds:i.sourceIds,questions:['You must file when revenue exceeds 12345','Confirm globalRevenue above 12345'],childTopics:[]}));
 assert.ok(a.questions.every(q=>!q.includes('12345')));
 assert.ok(a.questions.some(q=>q==='Confirm globalRevenue for California privacy.'));
});

test('unknown subsidiary plan is insufficient even if no existing US entity',()=>{
 assert.equal(finding({...base,salesModel:'unknown'},'US entity maintenance').status,'insufficient_data');
});
test('valid registry source cannot be attached to an unrelated model topic',async()=>{
 const a=await assess(base,'s',async()=>({sourceIds:['ca-employer'],questions:[],childTopics:[]}));
 assert.equal(a.partial,true);assert.equal(a.modelStatus,'unavailable');
});
