import { randomUUID } from 'node:crypto';
import type { Company, Finding, FindingStatus } from '../contracts';
export const RULE_VERSION='conservative-entry-v1';
export const TOPIC_SOURCES:Record<string,string[]>={
 'Federal tax presence':['irs-eci'],'California business registration':['ca-business-start'],
 'US entity maintenance':['ca-statements','ca-business-start'],'California employment':['ca-employer'],
 'California privacy':['ca-privacy'],'California sales and use tax':['ca-sales-tax'],
 'Payroll wage and location review':['ca-employer'],'Entity registration details':['ca-statements'],
 'Data role and statutory criteria':['ca-privacy'],'Transaction classification':['ca-sales-tax'],
 'US service performance':['irs-eci'],'Foreign qualification activities':['ca-business-start']
};
export const ROOT_TOPICS=Object.keys(TOPIC_SOURCES).slice(0,6);
export const TOPIC_FACTS:Record<string,string[]>={
 'Federal tax presence':['usOffice','usEmployees','salesModel'],
 'California business registration':['targetStates','usOffice','usEmployees','usEntity'],
 'US entity maintenance':['usEntity','salesModel','targetStates'],
 'California employment':['usEmployees','targetStates'],
 'California privacy':['processesPersonalData','customerType','targetStates'],
 'California sales and use tax':['annualUsRevenueUsd','salesModel','targetStates'],
 'Payroll wage and location review':['usEmployees','targetStates'],
 'Entity registration details':['usEntity','salesModel','targetStates'],
 'Data role and statutory criteria':['processesPersonalData','targetStates'],
 'Transaction classification':['annualUsRevenueUsd','salesModel','targetStates'],
 'US service performance':['usOffice','usEmployees','salesModel'],
 'Foreign qualification activities':['targetStates','usOffice','usEmployees','usEntity']
};
export function evaluateTopic(company:Company,scenarioId:string,topic:string):Finding {
 let status:FindingStatus='review_required',summary='',missingFacts:string[]=[];
 const ca=company.targetStates.some(s=>['ca','california'].includes(s.toLowerCase()));
 const factKeys=TOPIC_FACTS[topic]??[];
 if(topic==='Federal tax presence'){
  missingFacts=['servicePerformanceLocation','incomeClassification','treatyEligibility'];
  if(company.usEmployees===null)missingFacts.push('usEmployees');
  if(company.usOffice===null)missingFacts.push('usOffice');
  status=company.usOffice===null||company.usEmployees===null||company.salesModel==='unknown'?'insufficient_data':'review_required';
  summary='US trade or business, income sourcing and treaty treatment require tax review. Remote sales alone do not establish either tax liability or exemption.';
 } else if(topic==='California business registration'){
  missingFacts=['californiaActivities','foreignQualificationExceptions'];
  status=company.targetStates.length===0||company.usOffice===null||company.usEmployees===null?'insufficient_data':'review_required';
  summary='Confirm actual California activities and foreign qualification requirements. A target market or remote sale alone does not decide registration.';
 } else if(topic==='US entity maintenance'){
  if(company.usEntity===null){status='insufficient_data';missingFacts=['usEntity'];summary='Confirm whether a US entity exists or is proposed before reviewing entity maintenance.';}
  else if(!company.usEntity && company.salesModel==='unknown'){status='insufficient_data';missingFacts=['salesModel'];summary='Confirm whether a US subsidiary is proposed before excluding entity maintenance review.';}
  else if(!company.usEntity && company.salesModel!=='subsidiary'){status='not_applicable';summary='Existing US entity maintenance is outside this scenario because no US entity is reported. Foreign qualification and tax duties remain separate reviews.';}
  else {status='review_required';missingFacts=['formationState','entityType','registrationDate'];summary='Existing or proposed US subsidiary adds entity formation/maintenance review. Confirm formation state and entity type; California filing duties are not assumed for every US entity.';}
 } else if(topic==='California employment'){
  if(company.usEmployees===null){status='insufficient_data';missingFacts=['usEmployees'];summary='Employee headcount is unknown. Employment registration cannot be excluded.';}
  else if(company.usEmployees===0){status='not_applicable';summary='Employee payroll registration is not triggered by reported US employee headcount of zero in this scenario. Contractor classification and future hiring require separate review.';}
  else {status='review_required';missingFacts=['employeeWorkStates','quarterlyWages','workerClassification'];summary=ca?'Reported US hiring adds California employer registration and payroll review. Confirm where employees work and wages before deciding applicability.':'Reported US hiring requires employee work-state confirmation. California applicability cannot be inferred from headcount alone.';}
 } else if(topic==='California privacy'){
  status='insufficient_data';missingFacts=['globalRevenue','californiaResidentDataVolume','saleSharingRevenue','dataControllerRole'];
  if(company.processesPersonalData===null)missingFacts.push('processesPersonalData');
  summary='CCPA applicability requires statutory business criteria, California resident data and processing role. B2B customers and US revenue alone do not establish exemption.';
 } else if(topic==='California sales and use tax'){
  status='insufficient_data';missingFacts=['softwareDelivery','bundledGoods','transactionLocations','nexusFacts'];
  summary='Classify delivery, bundled goods and California nexus before determining sales/use-tax duties. The SaaS label and total US revenue alone are insufficient.';
 } else {
  status='review_required';missingFacts=topic==='Payroll wage and location review'?['employeeWorkStates','quarterlyWages']:topic==='Entity registration details'?['formationState','entityType']:topic==='Data role and statutory criteria'?['dataControllerRole','californiaResidentDataVolume']:topic==='Transaction classification'?['softwareDelivery','bundledGoods']:topic==='US service performance'?['servicePerformanceLocation']:['californiaActivities'];
  summary='Additional issue discovered for human review; confirm the listed facts against the cited official source. No additional obligation has been established.';
 }
 return {id:randomUUID(),scenarioId,topic,jurisdiction:topic==='Federal tax presence'||topic==='US service performance'?'US federal':topic==='US entity maintenance'?'US / state to confirm':'California',status,summary,factKeys,missingFacts,sourceIds:TOPIC_SOURCES[topic]??[],assessedAt:new Date().toISOString()};
}
export function evaluateRules(company:Company,scenarioId:string):Finding[]{return ROOT_TOPICS.map(t=>evaluateTopic(company,scenarioId,t));}
