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

test('structured review receives rule and missing facts, and aggregates measured telemetry',async()=>{
 let calls=0;
 const a=await assess(base,'s',async input=>{
  calls++;assert.ok(input.ruleStatus);assert.ok(Array.isArray(input.missingFacts));
  return {sourceIds:input.sourceIds,questions:[],childTopics:[],review:{proposedStatus:input.ruleStatus!,missingFacts:[],counterexampleFactKeys:[]},telemetry:{latencyMs:12,promptTokens:10,completionTokens:20,totalTokens:30}};
 });
 assert.equal(a.metrics!.modelCalls,calls);assert.equal(a.metrics!.latencyMs,calls*12);
 assert.equal(a.metrics!.promptTokens,calls*10);assert.equal(a.metrics!.completionTokens,calls*20);assert.equal(a.metrics!.totalTokens,calls*30);
});
test('structured contradiction can only downgrade definite outcomes to review',async()=>{
 const a=await assess(base,'s',async input=>({sourceIds:input.sourceIds,questions:[],childTopics:[],review:{proposedStatus:'applicable',missingFacts:[],counterexampleFactKeys:input.topic==='California employment'?['workerClassification']:[]}}));
 const employment=a.findings.find(f=>f.topic==='California employment')!;
 assert.equal(employment.status,'review_required');assert.match(employment.summary,/disagreement/);
 assert.ok(a.questions.some(q=>q.includes('workerClassification')));
 assert.ok(a.findings.every(f=>f.status!=='applicable'&&f.status!=='not_applicable'));
});
test('model definite conclusion cannot override unknown required facts',async()=>{
 const a=await assess({...base,usEmployees:null},'s',async input=>({sourceIds:input.sourceIds,questions:[],childTopics:[],review:{proposedStatus:'not_applicable',missingFacts:[],counterexampleFactKeys:[]}}));
 assert.equal(a.findings.find(f=>f.topic==='California employment')!.status,'insufficient_data');
 assert.equal(a.findings.find(f=>f.topic==='California privacy')!.status,'insufficient_data');
});
test('structured unknown facts become insufficient and arbitrary fact keys are rejected',async()=>{
 const a=await assess(base,'s',async input=>({sourceIds:input.sourceIds,questions:[],childTopics:[],review:{proposedStatus:input.ruleStatus!,missingFacts:['quarterlyWages'],counterexampleFactKeys:[]}}));
 assert.ok(a.findings.every(f=>f.status==='insufficient_data'));
 const bad=await assess(base,'s',async input=>({sourceIds:input.sourceIds,questions:[],childTopics:[],review:{proposedStatus:'not_applicable',missingFacts:['inventedThreshold'],counterexampleFactKeys:[]}}));
 assert.equal(bad.partial,true);assert.equal(bad.modelStatus,'unavailable');
});
test('missing usage and failure usage stay unknown rather than claiming zero',async()=>{
 const a=await assess(base,'s',async input=>({sourceIds:input.sourceIds,questions:[],childTopics:[]}));
 assert.equal(a.metrics!.totalTokens,null);assert.equal(a.metrics!.promptTokens,null);
 const b=await assess(base,'s',async()=>{throw new Error('outage');});
 assert.equal(b.metrics!.totalTokens,null);assert.equal(b.metrics!.modelCalls,1);
});

test('later failure preserves earlier validated challenge and reports usage unknown honestly',async()=>{
 let count=0;
 const a=await assess(base,'s',async input=>{
  if(++count===2)throw new Error('later outage');
  return {sourceIds:input.sourceIds,questions:[],childTopics:[],review:{proposedStatus:'not_applicable',missingFacts:[],counterexampleFactKeys:['usOffice']},telemetry:{latencyMs:8,promptTokens:10,completionTokens:3,totalTokens:13}};
 });
 assert.equal(a.partial,true);assert.equal(a.modelStatus,'available');
 assert.equal(a.metrics!.modelCalls,2);assert.equal(a.metrics!.totalTokens,null);
 assert.match(a.findings.find(f=>f.topic==='Federal tax presence')!.summary,/disagreement/);
 assert.ok(a.limitations.some(l=>l.includes('earlier validated reviews')));
 assert.ok(!a.limitations.some(l=>l.includes('Issue budget reached')));
});
test('invalid source retains actual reported telemetry but never applies its review',async()=>{
 const a=await assess(base,'s',async()=>({sourceIds:['invented'],questions:[],childTopics:[],review:{proposedStatus:'not_applicable',missingFacts:[],counterexampleFactKeys:[]},telemetry:{latencyMs:7,promptTokens:11,completionTokens:4,totalTokens:15}}));
 assert.equal(a.metrics!.totalTokens,15);assert.equal(a.metrics!.modelCalls,1);
 assert.equal(a.partial,true);assert.equal(a.modelStatus,'unavailable');
 assert.equal(a.findings.find(f=>f.topic==='Federal tax presence')!.status,'review_required');
});
