import {PLAN_PRESETS,type FeatureId} from '../entitlements/registry';
export const COMPARISON_PLANS=['Free','Startup','Business','Enterprise'] as const;
type Plan=typeof COMPARISON_PLANS[number];
export type ComparisonRow={category:'Workspace'|'Legal Intelligence'|'Expert services'|'Administration';label:string;values:Record<Plan,number|'Included'|'Not included'|'Custom configuration'|'Request recording'>};
const limit=(metric:'members'|'projects'|'monthlyDeepReviews')=>Object.fromEntries(COMPARISON_PLANS.map(plan=>[plan,plan==='Enterprise'?'Custom configuration':PLAN_PRESETS[plan].limits[metric]])) as ComparisonRow['values'];
const feature=(id:FeatureId)=>Object.fromEntries(COMPARISON_PLANS.map(plan=>[plan,plan==='Enterprise'?'Custom configuration':PLAN_PRESETS[plan].features[id]?(id==='priority_support'?'Request recording':'Included'):'Not included'])) as ComparisonRow['values'];
const base=()=>Object.fromEntries(COMPARISON_PLANS.map(plan=>[plan,'Included'])) as ComparisonRow['values'];
export const PRICING_COMPARISON:ComparisonRow[]=[
 {category:'Workspace',label:'Workspace members',values:limit('members')},{category:'Workspace',label:'Projects',values:limit('projects')},{category:'Workspace',label:'Task management',values:base()},
 {category:'Legal Intelligence',label:'Quick Assessment',values:base()},{category:'Legal Intelligence',label:'Deep legal review',values:feature('deep_legal_review')},{category:'Legal Intelligence',label:'Monthly Deep Reviews',values:limit('monthlyDeepReviews')},{category:'Legal Intelligence',label:'Decision Twin',values:feature('scenario_comparison')},{category:'Legal Intelligence',label:'Cost review',values:feature('cost_review')},{category:'Legal Intelligence',label:'Change Impact',values:base()},
 {category:'Expert services',label:'Expert search',values:feature('expert_marketplace')},{category:'Expert services',label:'Expert requests',values:feature('expert_collaboration')},{category:'Expert services',label:'Expert collaboration',values:feature('expert_collaboration')},
 {category:'Administration',label:'Audit log export',values:feature('audit_log_export')},{category:'Administration',label:'Priority support',values:feature('priority_support')}
];
