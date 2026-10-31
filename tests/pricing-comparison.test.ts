import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {PRICING_COMPARISON,COMPARISON_PLANS} from '../src/lib/billing/comparison';import {PLAN_PRESETS,FEATURE_IDS,type FeatureId} from '../src/lib/entitlements/registry';
test('pricing comparison derives real capacities and feature availability from the central registry',()=>{
 for(const [label,metric] of [['Workspace members','members'],['Projects','projects'],['Monthly Deep Reviews','monthlyDeepReviews']] as const){const row=PRICING_COMPARISON.find(r=>r.label===label)!;for(const plan of COMPARISON_PLANS){assert.equal(row.values[plan],plan==='Enterprise'?'Custom configuration':PLAN_PRESETS[plan].limits[metric]);}}
 for(const label of ['Task management','Quick Assessment','Change Impact'])assert.deepEqual(Object.values(PRICING_COMPARISON.find(r=>r.label===label)!.values),['Included','Included','Included','Included']);
 const featureRows:Record<string,FeatureId>={'Deep legal review':'deep_legal_review','Decision Twin':'scenario_comparison','Cost review':'cost_review','Expert search':'expert_marketplace','Expert requests':'expert_collaboration','Expert collaboration':'expert_collaboration','Audit log export':'audit_log_export','Priority support':'priority_support'};
 assert.deepEqual([...new Set(Object.values(featureRows))].sort(),[...FEATURE_IDS].sort(),'Every registered feature needs comparison coverage');
 for(const [label,feature] of Object.entries(featureRows)){const row=PRICING_COMPARISON.find(r=>r.label===label)!;assert.ok(row,label);for(const plan of COMPARISON_PLANS){const expected=plan==='Enterprise'?'Custom configuration':!PLAN_PRESETS[plan].features[feature]?'Not included':feature==='priority_support'?'Request recording':'Included';assert.equal(row.values[plan],expected,label+' / '+plan);}}
 for(const row of PRICING_COMPARISON){assert.deepEqual(Object.keys(row.values),[...COMPARISON_PLANS]);if(!['Task management','Quick Assessment','Change Impact'].includes(row.label))assert.equal(row.values.Enterprise,'Custom configuration',row.label);}
 assert.ok(PRICING_COMPARISON.some(row=>row.category==='Legal Intelligence'));
 assert.equal(PRICING_COMPARISON.find(r=>r.label==='Audit log export')!.values.Free,'Not included');assert.equal(PRICING_COMPARISON.find(r=>r.label==='Priority support')!.values.Business,'Request recording');
});
test('comparison is additive below existing plan cards and preserves prices and payment flow',()=>{
 const text=readFileSync('src/components/pricing-page.tsx','utf8');assert.ok(text.indexOf('<BillingComparison')>text.indexOf('pricing-plans'));assert.ok(text.includes('/payment-link'));assert.ok(text.includes('/enterprise'));assert.ok(text.includes('/activate-free'));assert.ok(text.includes('49000')||text.includes('49,000'));assert.ok(text.includes('149000')||text.includes('149,000'));
});
