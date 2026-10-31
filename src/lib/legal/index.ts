import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Assessment, Company, Finding, FindingStatus } from '../contracts';
import { getSource, sources, sourceIsFresh, SOURCE_VERSION, validateSourceIds } from './registry';
import { evaluateRules, evaluateTopic, ROOT_TOPICS, RULE_VERSION, TOPIC_FACTS, TOPIC_SOURCES } from './rules';
export {sources,getSource,validateSourceIds,sourceIsFresh,SOURCE_VERSION} from './registry';
export {evaluateRules,evaluateTopic,RULE_VERSION,TOPIC_FACTS,TOPIC_SOURCES} from './rules';
export type ModelInput={topic:string;facts:Partial<Company>;sourceIds:string[];ruleStatus?:FindingStatus;missingFacts?:string[]};
export type ModelOutput={sourceIds:string[];questions:string[];childTopics:string[];
 review?:{proposedStatus:FindingStatus;missingFacts:string[];counterexampleFactKeys:string[]};
 telemetry?:{latencyMs:number;promptTokens:number|null;completionTokens:number|null;totalTokens:number|null}};

export type LegalModel=(input:ModelInput)=>Promise<ModelOutput>;
export const LIMITS={maxDepth:3,maxNodes:12,maxModelCalls:15,totalTimeoutMs:90000,callTimeoutMs:30000} as const;
export type AssessOptions={timeoutMs?:number;callTimeoutMs?:number;now?:number};
const Output=z.object({sourceIds:z.array(z.string()).max(12),questions:z.array(z.string().max(500)).max(12),childTopics:z.array(z.string().max(120)).max(12),
 review:z.object({proposedStatus:z.enum(['applicable','not_applicable','insufficient_data','review_required']),missingFacts:z.array(z.string().max(120)).max(50),counterexampleFactKeys:z.array(z.string().max(120)).max(50)}).strict().optional(),
 telemetry:z.object({latencyMs:z.number().finite().nonnegative(),promptTokens:z.number().int().nonnegative().nullable(),completionTokens:z.number().int().nonnegative().nullable(),totalTokens:z.number().int().nonnegative().nullable()}).strict().optional()
}).strict();
export function issueFingerprint(topic:string,company:Company):string {
 const keys=TOPIC_FACTS[topic]??Object.keys(company).filter(k=>!['id','name','updatedAt'].includes(k));
 const facts=Object.fromEntries([...keys].sort().map(k=>[k,company[k as keyof Company]]));
 return createHash('sha256').update(JSON.stringify({topic,facts,version:SOURCE_VERSION})).digest('hex');
}
function deadline<T>(p:Promise<T>,ms:number):Promise<T>{
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('model_timeout')),ms);p.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
}
export async function assess(company:Company,scenarioId:string,model?:LegalModel,options:AssessOptions={}):Promise<Assessment>{
 const started=Date.now(), timeout=Math.max(1,Math.min(options.timeoutMs??LIMITS.totalTimeoutMs,LIMITS.totalTimeoutMs));
 const findings:Finding[]=evaluateRules(company,scenarioId), questions=new Set<string>();
 const limitations=['Coverage: selected US federal and California topics only; other jurisdictions and laws are unexamined.',
 'Preparation support only. Human legal/tax review is required before commercial reliance or external actions.',
 'Task completion is not legal compliance certification. No fees, savings, filings or payments are calculated or performed.'];
 let partial=!model,modelCalls=0,maxDepth=0,nodes=0,modelAvailable=false,latencyMs=0;
 const usage:{promptTokens:number|null;completionTokens:number|null;totalTokens:number|null}={promptTokens:0,completionTokens:0,totalTokens:0};
 const factKeysAllowed=new Set([...sources.flatMap(s=>s.requiredFacts),...Object.keys(company),...findings.flatMap(f=>f.missingFacts)]);

 const queue=ROOT_TOPICS.map(topic=>({topic,depth:0})),seen=new Set<string>();
 if(!model)limitations.push('NVIDIA unavailable: no model review was performed. Findings below are deterministic source-based screening only.');
 while(queue.length && nodes<LIMITS.maxNodes){
  const node=queue.shift()!,fingerprint=issueFingerprint(node.topic,company);
  if(seen.has(fingerprint))continue;
  seen.add(fingerprint);nodes++;maxDepth=Math.max(maxDepth,node.depth);
  if(!model)continue;
  if(modelCalls>=LIMITS.maxModelCalls || Date.now()-started>=timeout){partial=true;limitations.push('Recursive review stopped at its request budget; remaining issues need review.');break;}
  const facts:Partial<Company>={};
  for(const key of TOPIC_FACTS[node.topic]??Object.keys(company).filter(k=>!['id','name','updatedAt'].includes(k))){Object.assign(facts,{[key]:company[key as keyof Company]});}
  modelCalls++;
  const callStarted=Date.now();
  let telemetryRecorded=false;
  const current=findings.find(f=>f.topic===node.topic)!;
  try{
   const output=Output.parse(await deadline(Promise.resolve().then(()=>model({topic:node.topic,facts,sourceIds:TOPIC_SOURCES[node.topic]??[],ruleStatus:current.status,missingFacts:[...current.missingFacts]})),Math.max(1,Math.min(options.callTimeoutMs??LIMITS.callTimeoutMs,LIMITS.callTimeoutMs,timeout-(Date.now()-started)))));
   latencyMs+=output.telemetry?.latencyMs??(Date.now()-callStarted);
   for(const key of ['promptTokens','completionTokens','totalTokens'] as const){
    const value=output.telemetry?.[key];
    usage[key]=usage[key]===null||value==null?null:usage[key]!+value;
   }
   telemetryRecorded=true;
   if(output.review && [...output.review.missingFacts,...output.review.counterexampleFactKeys].some(k=>!factKeysAllowed.has(k)))throw new Error('unknown_fact_key');
   if(!validateSourceIds(output.sourceIds)||output.sourceIds.some(id=>!(TOPIC_SOURCES[node.topic]??[]).includes(id)))throw new Error('unknown_source');
   if(output.childTopics.some(t=>!TOPIC_SOURCES[t]))throw new Error('unknown_topic');
   if(output.questions.some(q=>/https?:|www\./i.test(q)))throw new Error('model_url');
   modelAvailable=true;
   if(output.review){
    const review=output.review;
    const challenged=review.proposedStatus!==current.status||review.counterexampleFactKeys.length>0;
    const unknownFacts=review.missingFacts.filter(key=>!(key in company)||company[key as keyof Company]===null||company[key as keyof Company]==='unknown'||(key==='targetStates'&&company.targetStates.length===0));
    current.missingFacts=[...new Set([...current.missingFacts,...unknownFacts])];
    // A model may challenge a deterministic conclusion, never certify one.
    // Unknown facts remain unknown even when the proposed status is definite.
    if(current.status==='insufficient_data'||unknownFacts.length){
     current.status='insufficient_data';
    }else if(challenged){
     current.status='review_required';
    }
    if(challenged){
     current.summary+=' Structured model review flagged a possible exception or disagreement; human review is required.';
    }
    for(const key of review.counterexampleFactKeys){
     if(!current.factKeys.includes(key))current.factKeys.push(key);
     questions.add('Review possible exception involving '+key+' for '+node.topic+'.');
    }
   }
   // Free-form model prose is never a legal assertion. Retain only known fact
   // requests and render deterministic wording; numbers and obligations cannot
   // be smuggled into the UI through a model-generated question.
   const allowedFacts=new Set((TOPIC_SOURCES[node.topic]??[]).flatMap(id=>getSource(id)?.requiredFacts??[]));
   for(const q of output.questions)for(const key of allowedFacts)if(q.includes(key))questions.add('Confirm '+key+' for '+node.topic+'.');
   for(const topic of output.childTopics){
    if(node.depth>=LIMITS.maxDepth){if(!seen.has(issueFingerprint(topic,company)))partial=true;continue;}
    if(seen.has(issueFingerprint(topic,company))||queue.some(n=>n.topic===topic))continue;
    if(findings.length<LIMITS.maxNodes && !findings.some(f=>f.topic===topic)) findings.push(evaluateTopic(company,scenarioId,topic));
    queue.push({topic,depth:node.depth+1});
   }
  }catch{
   if(!telemetryRecorded){
    latencyMs+=Date.now()-callStarted;
    usage.promptTokens=null;usage.completionTokens=null;usage.totalTokens=null;
   }
   partial=true;
   limitations.push('NVIDIA review unavailable, timed out, or returned unsupported content. The failed issue review was not applied; earlier validated reviews, if any, are retained.');
   break;
  }
 }
 if(queue.length){partial=true;limitations.push(nodes>=LIMITS.maxNodes?'Issue budget reached; additional issues require human review.':'Additional issues were not model-reviewed and require human review.');}
 for(const finding of findings){
  for(const key of finding.missingFacts)questions.add('Confirm '+key+' for '+finding.topic+'.');
  if(finding.sourceIds.some(id=>{const source=getSource(id);return !source || !sourceIsFresh(source,options.now??Date.now());})){
   finding.status='review_required';finding.summary+=' Source verification is stale or unavailable; recheck before relying on this finding.';partial=true;
  }
 }
 return {id:randomUUID(),scenarioId,findings,questions:[...questions],coverage:ROOT_TOPICS,limitations:[...new Set(limitations)],partial,ruleVersion:RULE_VERSION,sourceVersion:SOURCE_VERSION,modelStatus:modelAvailable?'available':'unavailable',metrics:{nodes,modelCalls,maxDepth,latencyMs,promptTokens:modelCalls?usage.promptTokens:null,completionTokens:modelCalls?usage.completionTokens:null,totalTokens:modelCalls?usage.totalTokens:null}};
}
