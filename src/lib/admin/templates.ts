import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {AccountUser} from '../organization-contracts';
import {isEnabledAdminUser} from './auth';
import {withPlatformActor} from '../billing/inquiries';
import {audit} from '../organizations';
import {ApiError} from '../http';
import {TemplateInputSchema,PLAN_PRESETS,type TemplateInput,type TemplateDTO} from '../entitlements/registry';
export type {TemplateInput,TemplateDTO} from '../entitlements/registry';
const idInput=z.string().min(1).max(160),nameInput=z.string().trim().min(1).max(160),Status=z.enum(['Active','Inactive','Archived']);
const iso=(value:unknown)=>new Date(value as string|Date).toISOString();
async function platform<T>(user:AccountUser,run:(client:PoolClient)=>Promise<T>):Promise<T>{if(!await isEnabledAdminUser(user.id))throw new ApiError(403,'ADMIN_REQUIRED','An enabled administrator account is required.');return withPlatformActor(user,run);}
const select=`SELECT t.id,t.name,t.status,t.current_version,t.created_at,t.updated_at,v.payload FROM enterprise_contract_templates t JOIN enterprise_contract_template_versions v ON v.template_id=t.id AND v.version=t.current_version`;
function record(row:Record<string,any>):TemplateDTO{return {...TemplateInputSchema.parse(row.payload),id:row.id,name:row.name,status:row.status,version:row.current_version,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)};}
async function current(client:PoolClient,id:string,lock=false){
 const parent=(await client.query('SELECT * FROM enterprise_contract_templates WHERE id=$1'+(lock?' FOR UPDATE':''),[idInput.parse(id)])).rows[0];
 if(!parent)throw new ApiError(404,'NOT_FOUND','Enterprise template not found.');
 const row=(await client.query(select+' WHERE t.id=$1',[id])).rows[0];if(!row)throw new ApiError(409,'TEMPLATE_VERSION_MISSING','Template version is unavailable.');return {parent,template:record(row)};
}
async function createRecord(client:PoolClient,user:AccountUser,input:TemplateInput,id:string=randomUUID(),example=false){
 const value=TemplateInputSchema.parse(input);
 await client.query("INSERT INTO enterprise_contract_templates(id,name,current_version,status,created_by,created_at,updated_at) VALUES($1,$2,1,'Active',$3,now(),now())",[id,value.name,user.id]);
 await client.query('INSERT INTO enterprise_contract_template_versions(template_id,version,payload,created_by,created_at) VALUES($1,1,$2,$3,now())',[id,value,user.id]);
 await audit(client,user.id,null,'enterprise.template_created',{templateId:id,version:1,example,organizationApplied:false});return (await current(client,id)).template;
}
async function ensureExamples(client:PoolClient,user:AccountUser){
 await client.query("SELECT pg_advisory_xact_lock(hashtext('borderless:enterprise-template-examples'))");
 const examples=[{id:'example-enterprise-launch',name:'Enterprise Standard',preset:PLAN_PRESETS.Free},{id:'example-enterprise-expansion',name:'Legal Operations',preset:PLAN_PRESETS.Startup},{id:'example-enterprise-operations',name:'Enterprise Plus',preset:PLAN_PRESETS.Business}];
 for(const example of examples){if((await client.query('SELECT id FROM enterprise_contract_templates WHERE id=$1',[example.id])).rowCount)continue;
  await createRecord(client,user,{name:example.name,description:'Editable example settings. Review the actual company agreement before applying.',features:{...example.preset.features},limits:{...example.preset.limits},defaultDurationDays:365,notes:'Example only. No organization, subscription or contract is automatically assigned or activated.'},example.id,true);
 }
}
export async function ensureDefaultTemplates(user:AccountUser){return platform(user,async client=>{await ensureExamples(client,user);return {ok:true as const};});}
export const templateService={
 async list(user:AccountUser,input:{q?:string;status?:string}={}){
  const fields=z.object({q:z.string().trim().max(200).optional(),status:Status.optional()}).strict().parse(input);
  return platform(user,async client=>{
   await ensureExamples(client,user);const values:unknown[]=[],where:string[]=[];
   if(fields.status){values.push(fields.status);where.push('t.status=$'+values.length);}
   if(fields.q){values.push('%'+fields.q.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')+'%');where.push("(t.name ILIKE $"+values.length+" OR v.payload->>'description' ILIKE $"+values.length+')');}
   const rows=(await client.query(select+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY t.updated_at DESC,t.id LIMIT 200',values)).rows;
   await audit(client,user.id,null,'enterprise.templates_viewed',{count:rows.length});return {templates:rows.map(record)};
  });
 },
 async get(user:AccountUser,id:string){return platform(user,async client=>{
  const {template}=await current(client,id);
  const versions=(await client.query('SELECT version,payload,created_by,created_at FROM enterprise_contract_template_versions WHERE template_id=$1 ORDER BY version DESC LIMIT 200',[id])).rows.map(row=>({version:row.version,payload:TemplateInputSchema.parse(row.payload),createdBy:row.created_by,createdAt:iso(row.created_at)}));
  const applications=(await client.query('SELECT c.organization_id,o.name,c.id,c.version,c.template_version,c.status,c.created_at FROM enterprise_contracts c JOIN organizations o ON o.id=c.organization_id WHERE c.template_id=$1 ORDER BY c.created_at DESC LIMIT 200',[id])).rows.map(row=>({organizationId:row.organization_id,organizationName:row.name,contractId:row.id,contractVersion:row.version,templateVersion:row.template_version,status:row.status,createdAt:iso(row.created_at)}));
  await audit(client,user.id,null,'enterprise.template_viewed',{templateId:id});return {template,versions,applications};
 });},
 async create(user:AccountUser,input:TemplateInput){const value=TemplateInputSchema.parse(input);return platform(user,client=>createRecord(client,user,value));},
 async update(user:AccountUser,id:string,input:TemplateInput&{expectedVersion:number}){
  const {expectedVersion,...content}=input;z.number().int().positive().parse(expectedVersion);const value=TemplateInputSchema.parse(content);
  return platform(user,async client=>{
   const {parent}=await current(client,id,true);
   if(parent.current_version!==expectedVersion)throw new ApiError(409,'TEMPLATE_VERSION_CONFLICT','The template changed. Reload its latest version before saving.');
   const version=expectedVersion+1;
   await client.query('INSERT INTO enterprise_contract_template_versions(template_id,version,payload,created_by,created_at) VALUES($1,$2,$3,$4,now())',[id,version,value,user.id]);
   await client.query('UPDATE enterprise_contract_templates SET name=$1,current_version=$2,updated_at=now() WHERE id=$3',[value.name,version,id]);
   await audit(client,user.id,null,'enterprise.template_updated',{templateId:id,version,previousVersion:expectedVersion,existingContractsChanged:false});return (await current(client,id)).template;
  });
 },
 async clone(user:AccountUser,id:string,input:{name:string}){
  const name=nameInput.parse(input.name);return platform(user,async client=>{
   const {template}=await current(client,id);const {id:_id,status:_status,version:_version,createdAt:_createdAt,updatedAt:_updatedAt,...payload}=template;
   const cloned=await createRecord(client,user,{...payload,name});await audit(client,user.id,null,'enterprise.template_cloned',{templateId:cloned.id,sourceTemplateId:id,sourceVersion:template.version});return cloned;
  });
 },
 async setStatus(user:AccountUser,id:string,input:{status:'Active'|'Inactive'|'Archived';reason:string}){
  const value=z.object({status:Status,reason:z.string().trim().min(1).max(5000)}).strict().parse(input);
  return platform(user,async client=>{
   const {parent}=await current(client,id,true);
   if(parent.status!==value.status){await client.query('UPDATE enterprise_contract_templates SET status=$1,updated_at=now() WHERE id=$2',[value.status,id]);await audit(client,user.id,null,'enterprise.template_status_changed',{templateId:id,from:parent.status,to:value.status,reason:value.reason,existingContractsChanged:false});}
   return (await current(client,id)).template;
  });
 }
};
