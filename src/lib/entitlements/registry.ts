import {z} from 'zod';
export const FEATURE_IDS=['deep_legal_review','scenario_comparison','expert_collaboration','expert_marketplace','cost_review','audit_log_export','priority_support'] as const;
export type FeatureId=typeof FEATURE_IDS[number];
export type FeatureFlags=Record<FeatureId,boolean>;
export type FeatureLimits={members:number;projects:number;monthlyDeepReviews:number};
export const FEATURE_REGISTRY:{id:FeatureId;label:string;description:string;dependencies:FeatureId[]}[]=[
 {id:'deep_legal_review',label:'Deep legal review',description:'Bounded NVIDIA review with explicit consent.',dependencies:[]},
 {id:'scenario_comparison',label:'Scenario comparison',description:'Create and compare proposed business scenarios.',dependencies:[]},
 {id:'expert_collaboration',label:'Expert collaboration',description:'Contract-gated sharing and professional collaboration.',dependencies:['expert_marketplace']},
 {id:'expert_marketplace',label:'Expert marketplace',description:'Discover registered professionals and their offerings.',dependencies:[]},
 {id:'cost_review',label:'Cost review',description:'Human review of scoped cost-related findings; no guaranteed savings.',dependencies:['scenario_comparison']},
 {id:'audit_log_export',label:'Audit log export',description:'Export authorized activity for human review.',dependencies:[]},
 {id:'priority_support',label:'Priority support request',description:'Record a support request; no automatic dispatch or SLA guarantee.',dependencies:[]}
];
export const EMPTY_FEATURES:FeatureFlags=Object.fromEntries(FEATURE_IDS.map(id=>[id,false])) as FeatureFlags;
const core={...EMPTY_FEATURES,deep_legal_review:true,scenario_comparison:true,expert_collaboration:true,expert_marketplace:true,cost_review:true};
export const PLAN_PRESETS={
 Free:{features:{...core},limits:{members:5,projects:3,monthlyDeepReviews:10}},
 Startup:{features:{...core,audit_log_export:true},limits:{members:20,projects:10,monthlyDeepReviews:100}},
 Business:{features:{...core,audit_log_export:true,priority_support:true},limits:{members:100,projects:50,monthlyDeepReviews:1000}}
} as const;
export const FeatureFlagsSchema=z.object(Object.fromEntries(FEATURE_IDS.map(id=>[id,z.boolean()])) as Record<FeatureId,z.ZodBoolean>).strict();
export const FeatureLimitsSchema=z.object({members:z.number().int().min(0).max(1000000),projects:z.number().int().min(0).max(1000000),monthlyDeepReviews:z.number().int().min(0).max(1000000)}).strict();
export const ContractInputSchema=z.object({kind:z.enum(['test','production']),startsAt:z.iso.datetime(),endsAt:z.iso.datetime(),contractReference:z.string().trim().min(1).max(2000),notes:z.string().trim().max(10000),features:FeatureFlagsSchema,limits:FeatureLimitsSchema,templateSource:z.object({id:z.string().min(1).max(160),version:z.number().int().positive()}).strict().optional()}).strict().superRefine((value,ctx)=>{
 if(Date.parse(value.endsAt)<=Date.parse(value.startsAt))ctx.addIssue({code:'custom',path:['endsAt'],message:'Contract end must be after its start.'});
 for(const feature of FEATURE_REGISTRY)if(value.features[feature.id])for(const dependency of feature.dependencies)if(!value.features[dependency])ctx.addIssue({code:'custom',path:['features',feature.id],message:feature.label+' requires '+dependency+'.'});
});
export type ContractInput=z.infer<typeof ContractInputSchema>;

export const TemplateInputSchema=z.object({name:z.string().trim().min(1).max(160),description:z.string().trim().max(5000),features:FeatureFlagsSchema,limits:FeatureLimitsSchema,defaultDurationDays:z.number().int().min(1).max(3660),notes:z.string().trim().max(10000)}).strict().superRefine((value,ctx)=>{
 for(const feature of FEATURE_REGISTRY)if(value.features[feature.id])for(const dependency of feature.dependencies)if(!value.features[dependency])ctx.addIssue({code:'custom',path:['features',feature.id],message:feature.label+' requires '+dependency+'.'});
});
export type TemplateInput=z.infer<typeof TemplateInputSchema>;
export type TemplateDTO=TemplateInput&{id:string;status:'Active'|'Inactive'|'Archived';version:number;createdAt:string;updatedAt:string};
