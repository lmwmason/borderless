import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Assessment, Company, Finding } from '../contracts';
import { getSource, sourceIsFresh, SOURCE_VERSION, validateSourceIds } from './registry';
import { evaluateRules, evaluateTopic, ROOT_TOPICS, RULE_VERSION, TOPIC_FACTS, TOPIC_SOURCES } from './rules';
export {sources,getSource,validateSourceIds,sourceIsFresh,SOURCE_VERSION} from './registry';
export {evaluateRules,evaluateTopic,RULE_VERSION,TOPIC_FACTS,TOPIC_SOURCES} from './rules';
export type ModelInput={topic:string;facts:Partial<Company>;sourceIds:string[]};
export type ModelOutput={sourceIds:string[];questions:string[];childTopics:string[]};
export type LegalModel=(input:ModelInput)=>Promise<ModelOutput>;
export const LIMITS={maxDepth:3,maxNodes:12,maxModelCalls:15,totalTimeoutMs:20000,callTimeoutMs:5000} as const;
export type AssessOptions={timeoutMs?:number;callTimeoutMs?:number;now?:number};
const Output=z.object({sourceIds:z.array(z.string()).max(12),questions:z.array(z.string().max(500)).max(12),childTopics:z.array(z.string().max(120)).max(12)}).strict();
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
 let partial=!model,modelCalls=0,maxDepth=0,nodes=0,modelAvailable=false;
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
  try{
   const output=Output.parse(await deadline(Promise.resolve().then(()=>model({topic:node.topic,facts,sourceIds:TOPIC_SOURCES[node.topic]??[]})),Math.max(1,Math.min(options.callTimeoutMs??LIMITS.callTimeoutMs,LIMITS.callTimeoutMs,timeout-(Date.now()-started)))));
   if(!validateSourceIds(output.sourceIds)||output.sourceIds.some(id=>!(TOPIC_SOURCES[node.topic]??[]).includes(id)))throw new Error('unknown_source');
   if(output.childTopics.some(t=>!TOPIC_SOURCES[t]))throw new Error('unknown_topic');
   if(output.questions.some(q=>/https?:|www\./i.test(q)))throw new Error('model_url');
   modelAvailable=true;
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
   partial=true;
   limitations.push('NVIDIA review unavailable, timed out, or returned unsupported content. No model conclusions were applied.');
   break;
  }
 }
 if(queue.length){partial=true;limitations.push('Issue budget reached; additional issues require human review.');}
 for(const finding of findings){
  for(const key of finding.missingFacts)questions.add('Confirm '+key+' for '+finding.topic+'.');
  if(finding.sourceIds.some(id=>{const source=getSource(id);return !source || !sourceIsFresh(source,options.now??Date.now());})){
   finding.status='review_required';finding.summary+=' Source verification is stale or unavailable; recheck before relying on this finding.';partial=true;
  }
 }
 return {id:randomUUID(),scenarioId,findings,questions:[...questions],coverage:ROOT_TOPICS,limitations:[...new Set(limitations)],partial,ruleVersion:RULE_VERSION,sourceVersion:SOURCE_VERSION,modelStatus:modelAvailable?'available':'unavailable',metrics:{nodes,modelCalls,maxDepth}};
}
