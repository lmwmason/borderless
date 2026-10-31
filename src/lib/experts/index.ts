import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {CountryCode,LicensedJurisdiction} from './geography';
export {COUNTRY_CODES,CountryCode,LicensedJurisdiction,localizedText} from './geography';
import type {PoolClient} from 'pg';
import type {AccountUser} from '../organization-contracts';
import type {ExpertProfile,ExpertService,PublicExpert} from '../expert-contracts';
import {ApiError} from '../http';
import {withExpertActor,isExpertReviewer} from './context';
export {withExpertActor,isExpertReviewer} from './context';
const httpsUrl=z.string().trim().max(2000).refine(value=>{if(!value)return true;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}},'Use an HTTPS URL or leave blank.');
const short=z.string().trim().max(240);
const list=z.array(z.string().trim().min(1).max(120)).max(30);
const profileTranslation=z.object({bio:z.string().max(5000).default(''),specialtiesDescription:z.string().max(5000).default(''),experience:z.string().max(10000).default(''),portfolioDescription:z.string().max(10000).default('')}).strict();
const serviceTranslation=z.object({description:z.string().max(5000).default(''),scope:z.string().max(5000).default(''),conditions:z.string().max(5000).default('')}).strict();
export const ExpertProfileInput=z.object({
 residenceCountry:CountryCode.nullable().default(null),qualificationCountry:CountryCode.nullable().default(null),licensedJurisdictions:z.array(LicensedJurisdiction).max(100).default([]),serviceCountries:z.array(CountryCode).max(249).default([]),consultationModes:z.array(z.enum(['remote','in_person'])).max(2).default([]),originalLanguage:z.enum(['en','ko']).default('en'),localizedContent:z.object({en:profileTranslation.optional(),ko:profileTranslation.optional()}).strict().default({}),
 visibility:z.enum(['private','public']).default('private'),displayName:z.string().trim().min(1).max(160),photoUrl:httpsUrl.default(''),bio:z.string().trim().max(5000).default(''),specialties:list.default([]),regions:list.default([]),credentialType:short.default(''),licenseIssuer:short.default(''),licenseJurisdiction:short.default(''),licenseNumber:short.default(''),licenseNumberPublic:z.boolean().default(false),education:z.string().max(5000).default(''),experience:z.string().max(10000).default(''),affiliation:short.default(''),languages:list.default([]),available:z.boolean().default(true),
 portfolio:z.array(z.object({title:short,url:httpsUrl,visibility:z.enum(['private','public'])}).strict()).max(30).default([]),
 resume:z.object({text:z.string().max(20000),url:httpsUrl,visibility:z.enum(['private','public'])}).strict().default({text:'',url:'',visibility:'private'})
}).strict();
export type ProfileInput=z.input<typeof ExpertProfileInput>;
const Currency=z.enum(['USD','KRW','EUR','GBP','CAD','JPY']);
const ServiceType=z.enum(['Initial Consultation','Document Review','Legal Assessment Review','Ongoing Advisory','Custom Engagement']);
export const ExpertServiceInput=z.object({id:z.string().min(1).max(128).optional(),originalLanguage:z.enum(['en','ko']).default('en'),localizedContent:z.object({en:serviceTranslation.optional(),ko:serviceTranslation.optional()}).strict().default({}),title:z.string().trim().min(1).max(200),description:z.string().trim().max(5000).default(''),scope:z.string().trim().min(1).max(5000),serviceType:ServiceType,pricingType:z.enum(['hourly','fixed','quote']),priceMinor:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),currency:Currency,estimatedTime:short.default(''),conditions:z.string().max(5000).default(''),published:z.boolean().default(false)}).strict().superRefine((value,ctx)=>{
 if(value.pricingType==='quote'&&value.priceMinor!==null)ctx.addIssue({code:'custom',path:['priceMinor'],message:'Quote pricing has no preset amount.'});
 if(value.pricingType!=='quote'&&value.priceMinor===null)ctx.addIssue({code:'custom',path:['priceMinor'],message:'Enter an amount in minor currency units.'});
});
export type ServiceInput=z.input<typeof ExpertServiceInput>;
const ReviewInput=z.object({decision:z.enum(['Verified','Rejected']),notes:z.string().trim().min(1).max(5000),evidenceRefs:z.array(z.string().trim().min(1).max(2000)).min(1).max(20),attested:z.literal(true)}).strict();
export const ExpertSearchInput=z.object({residenceCountry:CountryCode.optional(),qualificationCountry:CountryCode.optional(),licensedJurisdiction:LicensedJurisdiction.optional(),serviceCountry:CountryCode.optional(),q:z.string().trim().max(200).optional(),specialty:short.optional(),credentialType:short.optional(),jurisdiction:short.optional(),language:short.optional(),minPriceMinor:z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),maxPriceMinor:z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),currency:Currency.optional(),serviceType:ServiceType.optional(),status:z.enum(['Verified','Pending Verification']).optional()}).strict().superRefine((value,ctx)=>{
 if((value.minPriceMinor!==undefined||value.maxPriceMinor!==undefined)&&!value.currency)ctx.addIssue({code:'custom',path:['currency'],message:'Choose a currency when filtering amounts.'});
 if(value.minPriceMinor!==undefined&&value.maxPriceMinor!==undefined&&value.minPriceMinor>value.maxPriceMinor)ctx.addIssue({code:'custom',path:['maxPriceMinor'],message:'Maximum must be at least minimum.'});
});
export type ExpertSearchFilters=z.input<typeof ExpertSearchInput>;
type ProfileRow={id:string;user_id:string;status:ExpertProfile['status'];visibility:ExpertProfile['visibility'];payload:ExpertProfile;updated_at:Date};
function normalizeProfile<T extends Record<string,unknown>>(value:T){return {residenceCountry:null,qualificationCountry:null,licensedJurisdictions:[],serviceCountries:[],consultationModes:[],originalLanguage:'en',localizedContent:{},...value};}
function normalizeService<T extends Record<string,unknown>>(value:T){return {originalLanguage:'en',localizedContent:{},...value};}
function ownProfile(row:ProfileRow):ExpertProfile{return {...normalizeProfile(row.payload),id:row.id,userId:row.user_id,status:row.status,visibility:row.visibility,updatedAt:new Date(row.updated_at).toISOString()};}
function projection(profile:ExpertProfile):Omit<PublicExpert,'services'>{
 const {userId:_userId,verification:_verification,licenseNumber,portfolio,resume,...publicFields}=profile;
 const localizedContent=Object.fromEntries(Object.entries(profile.localizedContent).map(([locale,text])=>[locale,{...text,...(portfolio.some(item=>item.visibility==='public')?{}:{portfolioDescription:''})}])) as ExpertProfile['localizedContent'];
 return {...publicFields,localizedContent,...(profile.licenseNumberPublic?{licenseNumber}:{}),portfolio:portfolio.filter(item=>item.visibility==='public'),resume:resume.visibility==='public'?resume:{text:'',url:'',visibility:'private'}};
}
async function own(client:PoolClient,user:AccountUser,lock=false):Promise<ExpertProfile|null>{
 const row=(await client.query('SELECT * FROM expert_profiles WHERE user_id=$1'+(lock?' FOR UPDATE':''),[user.id])).rows[0] as ProfileRow|undefined;
 return row?ownProfile(row):null;
}
async function writeProfile(client:PoolClient,profile:ExpertProfile){
 const visible=profile.visibility==='public'&&['Pending Verification','Verified'].includes(profile.status);
 await client.query('UPDATE expert_profiles SET status=$1,visibility=$2,payload=$3,public_payload=$4,updated_at=$5 WHERE id=$6',[profile.status,profile.visibility,profile,visible?projection(profile):null,profile.updatedAt,profile.id]);
}
async function audit(client:PoolClient,user:AccountUser,action:string,detail:Record<string,unknown>){
 await client.query('INSERT INTO audit_logs(id,actor_id,action,detail) VALUES($1,$2,$3,$4)',[randomUUID(),user.id,action,detail]);
}
function equalCase(a:string,b:string){return a.toLocaleLowerCase()===b.toLocaleLowerCase();}
async function publicProfiles(client:PoolClient,id?:string,filters:z.output<typeof ExpertSearchInput>={}):Promise<PublicExpert[]>{
 const params:unknown[]=[],conditions:string[]=[];
 const bind=(value:unknown)=>{params.push(value);return '$'+params.length;};
 if(id)conditions.push('d.id='+bind(id));
 const matchArray=(key:string,value:string)=>"exists(select 1 from jsonb_array_elements_text(d.payload->'"+key+"') v where lower(v)=lower("+bind(value)+'))';
 for(const key of ['residenceCountry','qualificationCountry'] as const)if(filters[key])conditions.push("d.payload->>'"+key+"'="+bind(filters[key]));
 if(filters.licensedJurisdiction)conditions.push(matchArray('licensedJurisdictions',filters.licensedJurisdiction));
 if(filters.serviceCountry)conditions.push(matchArray('serviceCountries',filters.serviceCountry));
 if(filters.status)conditions.push('d.status='+bind(filters.status));
 if(filters.specialty)conditions.push(matchArray('specialties',filters.specialty));
 if(filters.language)conditions.push(matchArray('languages',filters.language));
 if(filters.credentialType)conditions.push("lower(d.payload->>'credentialType')=lower("+bind(filters.credentialType)+')');
 if(filters.jurisdiction)conditions.push('('+matchArray('regions',filters.jurisdiction)+" or lower(d.payload->>'licenseJurisdiction')=lower("+bind(filters.jurisdiction)+'))');
 if(filters.q){const pattern=bind('%'+filters.q.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')+'%');conditions.push("((d.payload->>'displayName') ILIKE "+pattern+" OR (d.payload->>'bio') ILIKE "+pattern+" OR exists(select 1 from expert_service_directory q where q.expert_id=d.id AND ((q.payload->>'title') ILIKE "+pattern+" OR (q.payload->>'description') ILIKE "+pattern+')))' );}
 const offering:string[]=[];
 if(filters.currency)offering.push("s.payload->>'currency'="+bind(filters.currency));
 if(filters.serviceType)offering.push("s.payload->>'serviceType'="+bind(filters.serviceType));
 const amount="CASE WHEN jsonb_typeof(s.payload->'priceMinor')='number' THEN (s.payload->>'priceMinor')::numeric ELSE NULL END";
 if(filters.minPriceMinor!==undefined)offering.push('('+amount+')>='+bind(filters.minPriceMinor));
 if(filters.maxPriceMinor!==undefined)offering.push('('+amount+')<='+bind(filters.maxPriceMinor));
 if(offering.length)conditions.push('exists(select 1 from expert_service_directory s where s.expert_id=d.id AND '+offering.join(' AND ')+')');
 const rows=(await client.query('SELECT d.id,d.payload FROM expert_directory d'+(conditions.length?' WHERE '+conditions.join(' AND '):'')+' ORDER BY d.id LIMIT 200',params)).rows;
 if(!rows.length)return [];
 const services=(await client.query('SELECT expert_id,payload FROM expert_service_directory WHERE expert_id=ANY($1) ORDER BY id',[rows.map(row=>row.id)])).rows;
 return rows.map(row=>({...normalizeProfile(row.payload),services:services.filter(service=>service.expert_id===row.id).map(service=>normalizeService(service.payload))})) as PublicExpert[];
}
export const expertService={
 async me(user:AccountUser):Promise<{profile:ExpertProfile|null;services:ExpertService[]}>{
  return withExpertActor(user,async client=>{
   const profile=await own(client,user);
   const services=profile?(await client.query('SELECT id,payload FROM expert_services WHERE expert_id=$1 ORDER BY created_at,id',[profile.id])).rows.map(row=>({...normalizeService(row.payload),id:row.id,expertId:profile.id})):[];
   return {profile,services};
  });
 },
 async saveProfile(user:AccountUser,input:ProfileInput):Promise<ExpertProfile>{
  const fields=ExpertProfileInput.parse(input);
  return withExpertActor(user,async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['expert-profile:'+user.id]);
   const existing=await own(client,user,true);
   if(existing?.status==='Verified'){
    const previous=ExpertProfileInput.parse(existingFields(existing));
    if(JSON.stringify(previous)===JSON.stringify(fields))return existing;
   }
   const profile:ExpertProfile={...fields,id:existing?.id||randomUUID(),userId:user.id,status:'Draft',updatedAt:new Date().toISOString()};
   if(existing)await writeProfile(client,profile);
   else await client.query('INSERT INTO expert_profiles(id,user_id,status,visibility,payload,public_payload,updated_at) VALUES($1,$2,$3,$4,$5,NULL,$6)',[profile.id,user.id,profile.status,profile.visibility,profile,profile.updatedAt]);
   await audit(client,user,'expert.profile_saved',{expertId:profile.id,status:'Draft'});return profile;
  });
 },
 async submit(user:AccountUser):Promise<ExpertProfile>{
  return withExpertActor(user,async client=>{
   const profile=await own(client,user,true);
   if(!profile)throw new ApiError(404,'NOT_FOUND','Create your expert profile first.');
   if(profile.status==='Verified')throw new ApiError(409,'ALREADY_VERIFIED','This profile is already human-reviewed.');
   if(!profile.bio.trim()||!profile.specialties.length||!profile.languages.length)throw new ApiError(400,'PROFILE_INCOMPLETE','Add a biography, specialty and language before submitting.');
   const pending:ExpertProfile={...profile,status:'Pending Verification',updatedAt:new Date().toISOString()};delete pending.verification;
   await writeProfile(client,pending);await audit(client,user,'expert.profile_submitted',{expertId:pending.id});return pending;
  });
 },
 async saveService(user:AccountUser,input:ServiceInput):Promise<ExpertService>{
  const fields=ExpertServiceInput.parse(input);
  return withExpertActor(user,async client=>{
   const profile=await own(client,user,true);
   if(!profile)throw new ApiError(404,'NOT_FOUND','Create your expert profile first.');
   const {id:requestedId,...content}=fields;
   const id=requestedId||randomUUID();
   if(requestedId&&!(await client.query('SELECT id FROM expert_services WHERE id=$1 AND expert_id=$2 FOR UPDATE',[id,profile.id])).rowCount)throw new ApiError(404,'NOT_FOUND','Service not found.');
   const service:ExpertService={...content,id,expertId:profile.id};
   if(requestedId)await client.query('UPDATE expert_services SET payload=$1,published=$2,public_payload=$3 WHERE id=$4 AND expert_id=$5',[service,service.published,service.published?service:null,id,profile.id]);
   else await client.query('INSERT INTO expert_services(id,expert_id,payload,published,public_payload) VALUES($1,$2,$3,$4,$5)',[id,profile.id,service,service.published,service.published?service:null]);
   await audit(client,user,'expert.service_saved',{expertId:profile.id,serviceId:id});return service;
  });
 },
 async deleteService(user:AccountUser,id:string):Promise<{ok:true}>{
  z.string().min(1).max(128).parse(id);
  return withExpertActor(user,async client=>{
   const profile=await own(client,user,true);
   if(!profile||!(await client.query('DELETE FROM expert_services WHERE id=$1 AND expert_id=$2 RETURNING id',[id,profile.id])).rowCount)throw new ApiError(404,'NOT_FOUND','Service not found.');
   await audit(client,user,'expert.service_deleted',{expertId:profile.id,serviceId:id});return {ok:true};
  });
 },
 async search(user:AccountUser,input:ExpertSearchFilters={}):Promise<{experts:PublicExpert[]}>{
  const filters=ExpertSearchInput.parse(input);
  return withExpertActor(user,async client=>{
   const all=await publicProfiles(client,undefined,filters);
   const experts=all.filter(profile=>{
    if(filters.specialty&&!profile.specialties.some(value=>equalCase(value,filters.specialty!)))return false;
    if(filters.credentialType&&!equalCase(profile.credentialType,filters.credentialType))return false;
    if(filters.jurisdiction&&!profile.regions.some(value=>equalCase(value,filters.jurisdiction!))&&!equalCase(profile.licenseJurisdiction,filters.jurisdiction))return false;
    if(filters.language&&!profile.languages.some(value=>equalCase(value,filters.language!)))return false;
    if(filters.status&&profile.status!==filters.status)return false;
    const hasServiceFilter=filters.serviceType||filters.currency||filters.minPriceMinor!==undefined||filters.maxPriceMinor!==undefined;
    if(hasServiceFilter&&!profile.services.some(service=>(!filters.serviceType||service.serviceType===filters.serviceType)&&(!filters.currency||service.currency===filters.currency)&&(filters.minPriceMinor===undefined||(service.priceMinor!==null&&service.priceMinor>=filters.minPriceMinor))&&(filters.maxPriceMinor===undefined||(service.priceMinor!==null&&service.priceMinor<=filters.maxPriceMinor))))return false;
    return true;
   });return {experts};
  });
 },
 async detail(user:AccountUser,id:string):Promise<PublicExpert>{
  z.string().min(1).max(128).parse(id);
  return withExpertActor(user,async client=>{
   const profile=(await publicProfiles(client,id))[0];if(!profile)throw new ApiError(404,'NOT_FOUND','Public expert profile not found.');return profile;
  });
 },
 async review(user:AccountUser,id:string,input:z.input<typeof ReviewInput>):Promise<ExpertProfile>{
  z.string().min(1).max(128).parse(id);
  const fields=ReviewInput.parse(input);
  if(!isExpertReviewer(user))throw new ApiError(403,'REVIEWER_REQUIRED','An explicitly configured human reviewer is required.');
  return withExpertActor(user,async client=>{
   const row=(await client.query('SELECT * FROM expert_profiles WHERE id=$1 FOR UPDATE',[id])).rows[0] as ProfileRow|undefined;
   if(!row)throw new ApiError(404,'NOT_FOUND','Expert profile not found.');
   if(row.user_id===user.id)throw new ApiError(403,'SELF_REVIEW','You cannot verify your own profile.');
   if(row.status!=='Pending Verification')throw new ApiError(409,'REVIEW_NOT_PENDING','Only submitted profiles may be reviewed.');
   const profile:ExpertProfile={...ownProfile(row),status:fields.decision,updatedAt:new Date().toISOString(),verification:{reviewedAt:new Date().toISOString(),notes:fields.notes,evidenceRefs:fields.evidenceRefs}};
   await writeProfile(client,profile);
   await audit(client,user,'expert.profile_reviewed',{expertId:id,decision:fields.decision,attested:true,evidenceRefs:fields.evidenceRefs});return profile;
  },{reviewer:true});
 }
};
function existingFields(profile:ExpertProfile){const {id:_id,userId:_userId,status:_status,verification:_verification,updatedAt:_updatedAt,...fields}=profile;return fields;}
