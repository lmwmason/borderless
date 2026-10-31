import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,randomInt} from 'node:crypto';
import {Pool} from 'pg';
import {register,registerAdmin,ownerProject,testOrigin,responseCookie} from './helpers';
import {getPool,getAuthPool,closePools} from '../src/lib/db';
import {migrateDatabase} from '../src/lib/db/migrate';
import {adminService} from '../src/lib/admin/service';
import {templateService} from '../src/lib/admin/templates';
import {provisionAdmin,adminSignIn,getAdminSession,isEnabledAdminUser,adminDemoAllowed} from '../src/lib/admin/auth';
import {withPlatformActor} from '../src/lib/billing/inquiries';
import {PLAN_PRESETS,resolveEntitlements,reserveDeepReview,type ContractInput} from '../src/lib/entitlements';
import {GET as overview} from '../src/app/api/admin/overview/route';
import {POST as revokeSessions} from '../src/app/api/admin/users/[id]/revoke-sessions/route';
import {GET as account} from '../src/app/api/account/route';
import {requireUser} from '../src/lib/auth';
const denied=(code:string)=>(error:any)=>error?.code===code;
function request(path:string,cookie:string,body?:unknown){return new Request(testOrigin()+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin:testOrigin(),host:new URL(testOrigin()).host,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
const contract=(kind:'test'|'production'):ContractInput=>({kind,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),contractReference:'SYNTHETIC-SECURITY-'+randomUUID(),notes:'Isolated synthetic approval, not an actual commercial agreement.',features:{...PLAN_PRESETS.Business.features},limits:{members:20,projects:10,monthlyDeepReviews:10}});
async function approve(admin:any,organizationId:string,kind:'test'|'production'){
 const preview=await adminService.previewContract(admin.user,organizationId,contract(kind));
 return adminService.approveContract(admin.user,organizationId,preview.proposalId,{attested:true,reason:'Explicit synthetic security test approval'});
}
async function actor<T>(userId:string,run:(client:import('pg').PoolClient)=>Promise<T>,forgedOrg=''){
 const client=await getPool().connect();try{await client.query('BEGIN');await client.query("SELECT set_config('borderless.user_id',$1,true),set_config('borderless.organization_id',$2,true)",[userId,forgedOrg]);return await run(client);}finally{await client.query('ROLLBACK');client.release();}
}
function assertNoCredentials(value:unknown){
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)){for(const entry of value)assertNoCredentials(entry);return;}
 for(const [key,child] of Object.entries(value)){
  assert.ok(!/^(password|passwordHash|token|secret|accessToken|refreshToken|sessionToken)$/i.test(key),'Credential-bearing key must not be exposed');assertNoCredentials(child);
 }
}

test('administrator console denies ordinary/legacy operators, revokes regular sessions and audits without credentials',async()=>{
 const admin=await registerAdmin('independent-security-admin'),ordinary=await ownerProject('independent-security-user');
 const previous=process.env.BORDERLESS_PLATFORM_ADMIN_IDS;
 try{
  process.env.BORDERLESS_PLATFORM_ADMIN_IDS=ordinary.user.id;
  assert.equal((await overview(request('/api/admin/overview',ordinary.cookie))).status,401);
  assert.equal((await overview(request('/api/admin/overview',''))).status,401);
  const response=await overview(request('/api/admin/overview',admin.cookie));assert.equal(response.status,200);
  const payload=await response.json();assert.ok(payload.stats.users>=2);assert.ok(payload.stats.organizations>=1);assertNoCredentials(payload);
  const encoded=JSON.stringify(payload);assert.ok(!encoded.includes(admin.password));assert.ok(!encoded.includes(ordinary.password));
  const route='/api/admin/users/'+ordinary.user.id+'/revoke-sessions',context={params:Promise.resolve({id:ordinary.user.id})};
  assert.equal((await revokeSessions(request(route,ordinary.cookie,{reason:'Synthetic unauthorized attempt'}),context)).status,401);
  assert.equal((await account(request('/api/account',ordinary.cookie))).status,200);
  assert.equal((await revokeSessions(request(route,admin.cookie,{reason:'Synthetic session revocation QA'}),context)).status,200);
  const signedOut=await account(request('/api/account',ordinary.cookie));assert.equal(signedOut.status,200);assert.equal((await signedOut.json()).user,null);
  await assert.rejects(requireUser(request('/api/workspace',ordinary.cookie)),denied('UNAUTHENTICATED'));
  assert.equal((await getAdminSession(new Headers({cookie:admin.cookie})))?.user.id,admin.user.id);
  const rows=(await getPool().query("SELECT action,detail FROM audit_logs WHERE actor_id=$1 AND detail->>'userId'=$2 ORDER BY created_at",[admin.user.id,ordinary.user.id])).rows;
  assert.ok(rows.some(row=>row.action==='admin.user_sessions_revoke_requested'));assert.ok(rows.some(row=>row.action==='admin.user_sessions_revoked'));
  assertNoCredentials(rows);assert.ok(!JSON.stringify(rows).includes(admin.password));
  await assert.rejects(adminService.overview(ordinary.user),denied('ADMIN_REQUIRED'));
 }finally{if(previous===undefined)delete process.env.BORDERLESS_PLATFORM_ADMIN_IDS;else process.env.BORDERLESS_PLATFORM_ADMIN_IDS=previous;}
});

/** A dedicated local database prevents another test process's normal-mode staff
 * sync from revoking this fixture's explicitly development-only demo operator.
 * No external database is accepted and no existing records are modified. */
async function isolatedDemoDatabase(run:()=>Promise<void>){
 const direct=process.env.DIRECT_DATABASE_URL!;const source=new URL(direct);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(source.hostname),'Demo QA only mutates an isolated loopback database');
 const keys=['DIRECT_DATABASE_URL','DATABASE_URL','DATABASE_URL_RUNTIME','DATABASE_URL_AUTH','NODE_ENV','BETTER_AUTH_URL','BORDERLESS_LOCAL_ADMIN_DEMO','BORDERLESS_ADMIN_AUTH_SECRET'] as const;
 const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const name='adminsec_'+randomUUID().replaceAll('-','').slice(0,18),runtime=name+'_runtime',auth=name+'_auth',password=randomBytes(32).toString('hex');
 const owner=new Pool({connectionString:direct,max:1});let databaseCreated=false;
 const connection=(user:string)=>{const url=new URL(direct);url.pathname='/'+name;url.username=user;url.password=password;return url.toString();};
 try{
  await owner.query('CREATE ROLE '+runtime+" LOGIN PASSWORD '"+password+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
  await owner.query('CREATE ROLE '+auth+" LOGIN PASSWORD '"+password+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
  await owner.query('CREATE DATABASE '+name);databaseCreated=true;
  const ownerUrl=new URL(direct);ownerUrl.pathname='/'+name;
  await closePools();Object.assign(process.env,{DIRECT_DATABASE_URL:ownerUrl.toString(),DATABASE_URL:connection(runtime),DATABASE_URL_RUNTIME:connection(runtime),DATABASE_URL_AUTH:connection(auth),NODE_ENV:'development',BETTER_AUTH_URL:'http://localhost:3000',BORDERLESS_LOCAL_ADMIN_DEMO:'true',BORDERLESS_ADMIN_AUTH_SECRET:randomBytes(32).toString('hex')});
  await migrateDatabase();await run();
 }finally{
  await closePools();for(const key of keys){const value=before[key];if(value===undefined)Reflect.deleteProperty(process.env,key);else Object.assign(process.env,{[key]:value});}
  if(databaseCreated)await owner.query('DROP DATABASE '+name);
  await owner.query('DROP ROLE IF EXISTS '+runtime);await owner.query('DROP ROLE IF EXISTS '+auth);await owner.end();
 }
}

test('latest test contracts never fall back to an earlier production approval and demo authority disappears in production',async()=>{
 await isolatedDemoDatabase(async()=>{
  assert.equal(adminDemoAllowed(),true);
  const staff=await registerAdmin('isolated-real-staff'),first=await ownerProject('isolated-contract-first'),second=await ownerProject('isolated-contract-second');
  const production=await approve(staff,first.organization.id,'production');assert.equal(production.contract.version,1);
  const devTest=await approve(staff,first.organization.id,'test');assert.equal(devTest.contract.version,2);
  const loginId='isolated-demo-'+randomUUID(),password=randomUUID()+randomUUID()+'aA1!';
  const demoUser=await provisionAdmin({loginId,password,demo:true});
  const login=await adminSignIn(new Request(testOrigin()+'/api/admin/login',{method:'POST',headers:{origin:testOrigin(),'x-test-ip':'198.18.'+randomInt(1,250)+'.'+randomInt(1,250)}}),{loginId,password});assert.equal(login.status,200);
  const demoCookie=responseCookie(login);assert.ok(await getAdminSession(new Headers({cookie:demoCookie})));
  const demoTest=await approve({user:demoUser},second.organization.id,'test');assert.equal(demoTest.contract.kind,'test');
  await assert.rejects(adminService.previewContract(demoUser,second.organization.id,contract('production')),denied('PRODUCTION_ADMIN_REQUIRED'));
  const active=await actor(first.user.id,client=>resolveEntitlements(client,first.organization.id));assert.equal(active.active,true);assert.equal(active.contract!.version,2);
  Object.assign(process.env,{NODE_ENV:'production',BETTER_AUTH_URL:'https://localhost:3000'});
  assert.equal(adminDemoAllowed(),false);assert.equal(await isEnabledAdminUser(demoUser.id),false);
  assert.equal(await getAdminSession(new Headers({cookie:demoCookie.replace('borderless-admin.session_token','__Secure-borderless-admin.session_token')})),null);
  for(const company of [first,second]){
   const snapshot=await actor(company.user.id,client=>resolveEntitlements(client,company.organization.id),company.organization.id);
   assert.equal(snapshot.active,false);assert.equal(snapshot.contract!.kind,'test');assert.ok(Object.values(snapshot.features).every(enabled=>enabled===false));
  }
  const head=await actor(first.user.id,async client=>(await client.query('SELECT version,kind FROM enterprise_contracts WHERE organization_id=$1 ORDER BY version DESC LIMIT 1',[first.organization.id])).rows[0]);
  assert.deepEqual(head,{version:2,kind:'test'},'Latest test head stays visible so production cannot fall back');
  await assert.rejects(adminService.previewContract(staff.user,first.organization.id,contract('test')),denied('TEST_CONTRACT_FORBIDDEN'));
 });
});

test('template, contract and usage tables enforce forced RLS, tenant isolation and immutable version history',async()=>{
 const admin=await registerAdmin('independent-rls-admin'),first=await ownerProject('independent-rls-first'),second=await ownerProject('independent-rls-second');
 const firstContract=await approve(admin,first.organization.id,'production'),secondContract=await approve(admin,second.organization.id,'production');
 const template=await templateService.create(admin.user,{name:'Independent RLS '+randomUUID(),description:'Synthetic security fixture',features:{...PLAN_PRESETS.Business.features},limits:{members:20,projects:10,monthlyDeepReviews:10},defaultDurationDays:30,notes:'No automatic application'});
 await withPlatformActor(admin.user,async client=>{await reserveDeepReview(client,first.organization.id,'synthetic-'+randomUUID());await reserveDeepReview(client,second.organization.id,'synthetic-'+randomUUID());});
 const tables=['enterprise_contract_templates','enterprise_contract_template_versions','enterprise_contracts','enterprise_contract_proposals','entitlement_usage'];
 const flags=(await getPool().query('SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1)',[tables])).rows;
 assert.equal(flags.length,tables.length);assert.ok(flags.every(row=>row.relrowsecurity&&row.relforcerowsecurity));
 for(const table of tables){
  assert.equal((await getPool().query('SELECT 1 FROM '+table+' LIMIT 1')).rowCount,0,'Unscoped runtime '+table);
  await assert.rejects(getAuthPool().query('SELECT 1 FROM '+table+' LIMIT 1'),(error:any)=>error.code==='42501');
 }
 await actor(first.user.id,async client=>{
  const owned=(await client.query('SELECT id FROM enterprise_contracts WHERE id=ANY($1)',[[firstContract.contract.id,secondContract.contract.id]])).rows;assert.deepEqual(owned,[{id:firstContract.contract.id}]);
  assert.equal((await client.query('SELECT id FROM entitlement_usage WHERE organization_id=$1',[second.organization.id])).rowCount,0);
  assert.equal((await client.query('SELECT id FROM entitlement_usage WHERE organization_id=$1',[first.organization.id])).rowCount,1);
  assert.equal((await client.query('SELECT id FROM enterprise_contract_proposals WHERE organization_id=$1',[first.organization.id])).rowCount,0);
  assert.equal((await client.query('SELECT id FROM enterprise_contract_templates WHERE id=$1',[template.id])).rowCount,0);
 },second.organization.id);
 await withPlatformActor(admin.user,async client=>{await assert.rejects(client.query('UPDATE enterprise_contract_template_versions SET payload=payload WHERE template_id=$1',[template.id]),(error:any)=>error.code==='42501');});
 await withPlatformActor(admin.user,async client=>{await assert.rejects(client.query('DELETE FROM enterprise_contract_template_versions WHERE template_id=$1',[template.id]),(error:any)=>error.code==='42501');});
 await withPlatformActor(admin.user,async client=>{await assert.rejects(client.query('UPDATE enterprise_contracts SET features=features WHERE id=$1',[firstContract.contract.id]),(error:any)=>error.code==='42501');});
 await actor(first.user.id,async client=>{await assert.rejects(client.query('DELETE FROM entitlement_usage WHERE organization_id=$1',[first.organization.id]),(error:any)=>error.code==='42501');});
 assert.equal((await templateService.get(admin.user,template.id)).versions.length,1);
});
