import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {CompanySchema,TaskInputSchema,type Workspace} from '../contracts';
import {getSource} from '../legal';
import {importProjectWorkspace,type ProjectScope} from './postgres';
const ID=z.string().min(1).max(200);
const Finding=z.object({id:ID,scenarioId:ID,topic:z.string(),jurisdiction:z.string(),status:z.enum(['applicable','not_applicable','insufficient_data','review_required']),summary:z.string(),factKeys:z.array(z.string()),missingFacts:z.array(z.string()),sourceIds:z.array(z.string()),assessedAt:z.string()});
const Legacy=z.object({company:CompanySchema.nullable(),scenarios:z.array(z.object({id:ID,name:z.string(),company:CompanySchema})).max(10000),tasks:z.array(TaskInputSchema.extend({id:ID,updatedAt:z.string()})).max(10000),activity:z.array(z.object({id:ID,at:z.string(),type:z.string(),message:z.string()})).max(100000),assessments:z.array(z.object({id:ID,scenarioId:ID,findings:z.array(Finding),questions:z.array(z.string()),coverage:z.array(z.string()),limitations:z.array(z.string()),partial:z.boolean()}).passthrough()).max(10000)});
export async function importLegacy(scope:ProjectScope,path:string,dryRun=true){
 const raw=await readFile(path);if(raw.length>20_000_000)throw new Error('Legacy file exceeds import limit.');
 const parsed=Legacy.parse(JSON.parse(raw.toString())) as Workspace;
 const scenarioIds=new Set(parsed.scenarios.map(s=>s.id)),findingIds=new Set(parsed.assessments.flatMap(a=>a.findings.map(f=>f.id)));
 if(scenarioIds.size!==parsed.scenarios.length||new Set(parsed.tasks.map(t=>t.id)).size!==parsed.tasks.length||new Set(parsed.assessments.map(a=>a.id)).size!==parsed.assessments.length)throw new Error('Duplicate legacy identifiers.');
 for(const a of parsed.assessments){
  if(!scenarioIds.has(a.scenarioId))throw new Error('Legacy assessment has an unknown scenario.');
  a.partial=true;a.limitations.push('Imported legacy assessment requires source and fact review.');
  for(const f of a.findings){if(f.scenarioId!==a.scenarioId||f.sourceIds.some(id=>!getSource(id)))throw new Error('Legacy finding reference is invalid.');f.status='review_required';}
 }
 for(const t of parsed.tasks)if(t.findingId&&!findingIds.has(t.findingId))throw new Error('Legacy task has an unknown finding.');
 parsed.reviewJobs=[];
 return importProjectWorkspace(scope,parsed,dryRun);
}
