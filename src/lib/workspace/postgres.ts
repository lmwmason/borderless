import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {getPool} from '../db';
import {authorizeProject} from '../organizations';
import type {Workspace} from '../contracts';
import {createRepository,type WorkspaceStore} from './index';
export type ProjectScope={user:{id:string;name:string;email:string};organizationId:string;projectId:string;role:string};
const tables={company:'company_profiles',scenarios:'scenarios',assessments:'assessments',tasks:'tasks',reviewJobs:'review_jobs',activity:'project_activity'} as const;
async function transaction<T>(scope:ProjectScope,write:boolean,run:(client:PoolClient)=>Promise<T>):Promise<T>{
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');
  const actual=await authorizeProject(scope.user.id,scope.projectId,write,client);
  if(actual.organizationId!==scope.organizationId)throw new (await import('../http')).ApiError(403,'FORBIDDEN','Project scope mismatch.');
  await client.query("SELECT set_config('borderless.organization_id',$1,true),set_config('borderless.project_id',$2,true)",[scope.organizationId,scope.projectId]);
  // Serialize whole-workspace transitions across server processes.
  await client.query('SELECT id FROM projects WHERE id=$1 AND organization_id=$2 FOR UPDATE',[scope.projectId,scope.organizationId]);
  const result=await run(client);await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function read(client:PoolClient,scope:ProjectScope):Promise<Workspace>{
 const workspace:Workspace={company:null,scenarios:[],assessments:[],tasks:[],activity:[],reviewJobs:[]};
 for(const [key,table] of Object.entries(tables)){
  const {rows}=await client.query("SELECT payload FROM "+table+" WHERE organization_id=$1 AND project_id=$2 ORDER BY COALESCE((payload->>'_order')::int,0),id",[scope.organizationId,scope.projectId]);
  const values=rows.map(({payload})=>{const {_order,...value}=payload;return value;});
  if(key==='company')workspace.company=values[0] as Workspace['company']??null;
  else Object.assign(workspace,{[key]:values});
 }
 return workspace;
}
async function writeRows(client:PoolClient,scope:ProjectScope,table:string,rows:{id:string}[]){
 const ids=rows.map(row=>row.id);
 await client.query('DELETE FROM '+table+' WHERE organization_id=$1 AND project_id=$2 AND NOT(id=ANY($3::text[]))',[scope.organizationId,scope.projectId,ids]);
 for(const [position,row] of rows.entries())await client.query('INSERT INTO '+table+' (id,organization_id,project_id,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(project_id,id) DO UPDATE SET payload=excluded.payload',[row.id,scope.organizationId,scope.projectId,JSON.stringify({...row,_order:position})]);
}
export function createProjectRepository(scope:ProjectScope){
 const store:WorkspaceStore={
  read:()=>transaction(scope,false,client=>read(client,scope)),
  mutate:fn=>transaction(scope,true,async client=>{
   const state=await read(client,scope),before=JSON.stringify(state),oldEvents=new Set(state.activity.map(a=>a.id));
   const result=fn(state);
   if(JSON.stringify(state)!==before){
    for(const [key,table] of Object.entries(tables)){
     const rows=key==='company'?(state.company?[state.company]:[]):state[key as keyof typeof tables] as {id:string}[];
     await writeRows(client,scope,table,rows??[]);
    }
    await writeRows(client,scope,'findings',state.assessments.flatMap(a=>a.findings));
    for(const event of state.activity.filter(a=>!oldEvents.has(a.id)))await client.query('INSERT INTO audit_logs(id,organization_id,project_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[randomUUID(),scope.organizationId,scope.projectId,scope.user.id,event.type,JSON.stringify({message:event.message})]);
   }
   return structuredClone(result);
  })
 };
 return createRepository('postgres:'+scope.organizationId+':'+scope.projectId,store);
}
export async function projectDocuments(scope:ProjectScope){
 return transaction(scope,false,async client=>(await client.query('SELECT payload FROM documents WHERE organization_id=$1 AND project_id=$2 ORDER BY id',[scope.organizationId,scope.projectId])).rows.map(r=>r.payload));
}
export async function saveDocument(scope:ProjectScope,input:{title:string;content:string}){
 return transaction(scope,true,async client=>{
  const doc={id:randomUUID(),...input,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  await client.query('INSERT INTO documents(id,organization_id,project_id,payload) VALUES($1,$2,$3,$4)',[doc.id,scope.organizationId,scope.projectId,doc]);
  await client.query('INSERT INTO audit_logs(id,organization_id,project_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),scope.organizationId,scope.projectId,scope.user.id,'document.created',{documentId:doc.id}]);
  return doc;
 });
}
export async function deleteDocument(scope:ProjectScope,id:string){
 return transaction(scope,true,async client=>{
  const result=await client.query('DELETE FROM documents WHERE id=$1 AND organization_id=$2 AND project_id=$3',[id,scope.organizationId,scope.projectId]);if(!result.rowCount)throw new Error('Not found');
  await client.query('INSERT INTO audit_logs(id,organization_id,project_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),scope.organizationId,scope.projectId,scope.user.id,'document.deleted',{documentId:id}]);
 });
}

export async function importProjectWorkspace(scope:ProjectScope,workspace:Workspace,dryRun=true){
 return transaction(scope,true,async client=>{
  const access=await authorizeProject(scope.user.id,scope.projectId,true,client);
  if(access.role!=='Owner')throw new (await import('../http')).ApiError(403,'FORBIDDEN','Only the organization Owner can import legacy data.');
  const existing=await read(client,scope);
  const documents=await client.query('SELECT id FROM documents WHERE organization_id=$1 AND project_id=$2 LIMIT 1',[scope.organizationId,scope.projectId]);
  if(existing.company||existing.scenarios.length||existing.tasks.length||existing.assessments.length||documents.rowCount)throw new Error('Target project is not empty; import refused.');
  if(!dryRun){
   for(const [key,table] of Object.entries(tables)){
    const rows=key==='company'?(workspace.company?[workspace.company]:[]):workspace[key as keyof typeof tables] as {id:string}[];
    await writeRows(client,scope,table,rows??[]);
   }
   await writeRows(client,scope,'findings',workspace.assessments.flatMap(a=>a.findings));
   await client.query('INSERT INTO audit_logs(id,organization_id,project_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),scope.organizationId,scope.projectId,scope.user.id,'legacy.imported',{scenarios:workspace.scenarios.length,tasks:workspace.tasks.length,assessments:workspace.assessments.length}]);
  }
  return {dryRun,scenarios:workspace.scenarios.length,tasks:workspace.tasks.length,assessments:workspace.assessments.length};
 });
}
