import type { Source } from '../contracts';

export const SOURCE_VERSION = 'official-pages-2026-10-31';
export type LegalSource = Source & {
 sourceId:string; agency:string; officialUrl:string; effectiveFrom?:string;
 applicabilityConditions:string[]; exceptions:string[]; requiredFacts:string[];
 excerptOrSection:string; verificationStatus:'verified'|'unverified';
};
const record=(id:string,title:string,url:string,agency:string,jurisdiction:string,conditions:string[],requiredFacts:string[],section:string):LegalSource=>({
 id,sourceId:id,title,url,officialUrl:url,agency,jurisdiction,reviewedAt:'2026-10-31',
 verified:true,verificationStatus:'verified',applicabilityConditions:conditions,
 exceptions:['Scope, classification and statutory exceptions require human review.'],
 requiredFacts,excerptOrSection:section
});
export const sources:LegalSource[] = [
 record('irs-eci','Effectively connected income (ECI)','https://www.irs.gov/individuals/international-taxpayers/effectively-connected-income-eci','Internal Revenue Service','US federal',
 ['Foreign person engaged in US trade or business; income sourcing and exceptions require review.'],['usOffice','usEmployees','salesModel','servicePerformanceLocation','incomeClassification'],
 'ECI discussion: US business activities and income connection. This is not a determination of treaty relief.'),
 record('ca-business-start','Starting a Business','https://www.sos.ca.gov/business-programs/business-entities/starting-business','California Secretary of State','California',
 ['Business structure, tax identification, licenses and permits depend on actual activities.'],['usEntity','targetStates','usOffice','entityType','formationState'],
 'Steps 3–5: select structure, tax/employer identification, investigate licenses.'),
 record('ca-statements','Statements of Information Filing Tips','https://www.sos.ca.gov/business-programs/business-entities/statements','California Secretary of State','California',
 ['Required filings depend on entity type, registration and dates.'],['usEntity','targetStates','formationState','entityType','registrationDate'],
 'Required statements and information changes; entity-specific filing periods must be confirmed.'),
 record('ca-employer','Step 1: Register as an Employer','https://edd.ca.gov/en/payroll_taxes/step-1-register-as-an-employer/','California Employment Development Department','California',
 ['Employee hiring and quarterly wages determine employer registration.'],['usEmployees','employeeWorkStates','quarterlyWages','workerClassification'],
 'Register as an employer: hiring and wage conditions. No wage threshold is inferred from headcount.'),
 record('ca-privacy','Frequently Asked Questions (CCPA)','https://cppa.ca.gov/faq.html','California Privacy Protection Agency','California',
 ['For-profit business, collection/control of personal information, California business activity and statutory criteria must be evaluated.'],['processesPersonalData','targetStates','globalRevenue','californiaResidentDataVolume','saleSharingRevenue','dataControllerRole'],
 'Who must comply with the CCPA; California residents include business contacts and employees. FAQ is informational, not legal advice.'),
 record('ca-sales-tax','Sales & Use Tax in California','https://cdtfa.ca.gov/taxes-and-fees/sutprograms.htm','California Department of Tax and Fee Administration','California',
 ['Retail sales of goods and merchandise and use-tax transactions; software delivery and nexus classification need separate review.'],['targetStates','annualUsRevenueUsd','softwareDelivery','bundledGoods','transactionLocations','nexusFacts'],
 'Sales/use tax overview and registration. This page alone does not establish SaaS taxability.')
];
export function getSource(id:string):LegalSource|undefined { return sources.find(s=>s.id===id); }
export function validateSourceIds(ids:string[]):boolean {return ids.every(id=>Boolean(getSource(id)));}
export function sourceIsFresh(source:Source,now=Date.now()):boolean {
 const date=Date.parse(source.reviewedAt); return source.verified && Number.isFinite(date) && now-date<=90*86400000 && now>=date;
}
