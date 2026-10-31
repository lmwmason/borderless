import { z } from 'zod';
export const CompanySchema = z.object({
 id:z.string().min(1), name:z.string().trim().min(1).max(160), homeCountry:z.literal('KR'), industry:z.literal('b2b_saas'),
 targetStates:z.array(z.string().min(2).max(80)).max(50), usEntity:z.boolean().nullable(), usEmployees:z.number().int().min(0).max(1000000).nullable(), usOffice:z.boolean().nullable(),
 salesModel:z.enum(['remote','subsidiary','unknown']), customerType:z.enum(['b2b','b2c','mixed']),
 annualUsRevenueUsd:z.number().min(0).nullable(), processesPersonalData:z.boolean().nullable(), updatedAt:z.string()
}).strict();
export type Company=z.infer<typeof CompanySchema>;
export type FindingStatus='applicable'|'not_applicable'|'insufficient_data'|'review_required';
export type TaskStatus='todo'|'in_progress'|'in_review'|'done';
export type Source={id:string;title:string;url:string;jurisdiction:string;reviewedAt:string;effectiveFrom?:string;verified:boolean};
export type Finding={id:string;scenarioId:string;topic:string;jurisdiction:string;status:FindingStatus;summary:string;factKeys:string[];missingFacts:string[];sourceIds:string[];assessedAt:string};
export const TaskInputSchema=z.object({findingId:z.string().nullable().default(null),title:z.string().trim().min(1).max(240),status:z.enum(['todo','in_progress','in_review','done']).default('todo'),assignee:z.string().max(160).nullable().default(null),notes:z.string().max(10000).default(''),evidenceRefs:z.array(z.string().max(1000)).max(30).default([])}).strict();
export type Task=z.infer<typeof TaskInputSchema>&{id:string;updatedAt:string};
export type Scenario={id:string;name:string;company:Company};
export type Assessment={id:string;scenarioId:string;findings:Finding[];questions:string[];coverage:string[];limitations:string[];partial:boolean;modelId?:string;ruleVersion?:string;sourceVersion?:string;kind?:'quick'|'deep';modelStatus?:'available'|'unavailable'|'not_requested'|'pending';metrics?:{nodes:number;modelCalls:number;maxDepth:number;latencyMs?:number;promptTokens?:number|null;completionTokens?:number|null;totalTokens?:number|null}};
export type ReviewJob={id:string;scenarioId:string;status:'queued'|'running'|'completed'|'partial'|'cancelled'|'failed'|'interrupted';assessmentId:string|null;result:Assessment|null;completedTopics:string[];currentTopic:string|null;createdAt:string;updatedAt:string;error:string|null};
export type Activity={id:string;at:string;type:string;message:string};
export type Workspace={company:Company|null;scenarios:Scenario[];tasks:Task[];activity:Activity[];assessments:Assessment[];reviewJobs?:ReviewJob[]};
export const ScenarioInputSchema=z.object({name:z.string().trim().min(1).max(120),company:CompanySchema}).strict();
