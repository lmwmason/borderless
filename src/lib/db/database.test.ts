import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { getPool,getAuthPool,closePools } from './index';
import { migrateDatabase } from './migrate';
import { getAuth,requireUser } from '../auth';
import { ApiError } from '../http';

const configured=Boolean(process.env.DIRECT_DATABASE_URL&&process.env.DATABASE_URL_RUNTIME&&process.env.DATABASE_URL_AUTH);
test('PostgreSQL migrations, restricted roles, RLS and Better Auth lifecycle',{skip:!configured},async t=>{
 const owner=new Pool({connectionString:process.env.DIRECT_DATABASE_URL,max:1});
 const marker='db-test-'+randomUUID();
 const org=marker+'-org',otherOrg=marker+'-other',project=marker+'-project',otherProject=marker+'-other-project';
 const base=process.env.BETTER_AUTH_URL!;
 const previousIpHeader=process.env.BORDERLESS_TRUSTED_IP_HEADER;
 process.env.BORDERLESS_TRUSTED_IP_HEADER='x-borderless-test-client-ip';
 const testIp='127.0.0.'+(1+Math.floor(Math.random()*250));
 let authUserId:string|undefined;
 try{
  await t.test('generated migrations apply idempotently',async()=>{await migrateDatabase();await migrateDatabase();});
  await t.test('runtime and auth roles have no superuser or RLS bypass privileges',async()=>{
   for(const pool of [getPool(),getAuthPool()]){
    const row=(await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    assert.equal(row.rolsuper,false);assert.equal(row.rolbypassrls,false);
   }
  });
  await owner.query('INSERT INTO organizations(id,name) VALUES($1,$1),($2,$2)',[org,otherOrg]);
  await owner.query('INSERT INTO organization_workspaces(id,organization_id) VALUES($1,$2),($3,$4)',[org+'-ws',org,otherOrg+'-ws',otherOrg]);
  await owner.query('INSERT INTO projects(id,organization_id,workspace_id,name) VALUES($1,$2,$3,$1),($4,$5,$6,$4)',[project,org,org+'-ws',otherProject,otherOrg,otherOrg+'-ws']);
  await owner.query("INSERT INTO tasks(id,organization_id,project_id,payload) VALUES('task',$1,$2,$3),('task',$4,$5,$6)",[org,project,{title:'Synthetic A'},otherOrg,otherProject,{title:'Synthetic B'}]);
  await t.test('all eight payload tables enable and force RLS',async()=>{
   const rows=(await owner.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1)",[['company_profiles','scenarios','assessments','findings','tasks','review_jobs','project_activity','documents']])).rows;
   assert.equal(rows.length,8);assert.ok(rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity));
  });
  await t.test('unscoped runtime cannot read rows; scoped transaction sees only its project',async()=>{
   assert.equal((await getPool().query('SELECT id FROM tasks WHERE project_id=ANY($1)',[[project,otherProject]])).rowCount,0);
   const client=await getPool().connect();
   try{
    await client.query('BEGIN');
    await client.query("SELECT set_config('borderless.organization_id',$1,true),set_config('borderless.project_id',$2,true)",[org,project]);
    const rows=(await client.query('SELECT payload FROM tasks WHERE project_id=ANY($1)',[[project,otherProject]])).rows;
    assert.deepEqual(rows,[{payload:{title:'Synthetic A'}}]);
    await assert.rejects(client.query("INSERT INTO tasks(id,organization_id,project_id,payload) VALUES('forbidden',$1,$2,'{}')",[otherOrg,otherProject]),(error:unknown)=>(error as {code?:string}).code==='42501');
   }finally{await client.query('ROLLBACK');client.release();}
   assert.equal((await getPool().query('SELECT id FROM tasks WHERE project_id=$1',[project])).rowCount,0);
  });
  await t.test('runtime cannot read credential/session tables; auth cannot read domain tables',async()=>{
   for(const table of ['user','session','account','verification','rateLimit']){
    await assert.rejects(getPool().query('SELECT * FROM "'+table+'" LIMIT 1'),(error:unknown)=>(error as {code?:string}).code==='42501');
   }
   await getPool().query('SELECT id,name,email FROM account_public LIMIT 1');
   await assert.rejects(getAuthPool().query('SELECT * FROM organizations LIMIT 1'),(error:unknown)=>(error as {code?:string}).code==='42501');
  });
  await t.test('composite FK prevents cross-organization project payload references',async()=>{
   await assert.rejects(owner.query("INSERT INTO tasks(id,organization_id,project_id,payload) VALUES('bad-fk',$1,$2,'{}')",[otherOrg,project]),(error:unknown)=>(error as {code?:string}).code==='23503');
  });
  await t.test('real password signup issues HttpOnly session, verifies it and revokes sign-out',async()=>{
   const email=marker+'@example.invalid',password='SyntheticPassword-'+randomUUID();
   const request=(path:string,body:unknown,cookie?:string)=>new Request(base+'/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'x-borderless-test-client-ip':testIp,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
   const auth=getAuth();
   const response=await auth.handler(request('sign-up/email',{name:'Synthetic database test',email,password}));
   assert.equal(response.status,200);
   const payload=await response.json();authUserId=payload.user.id;
   const setCookie=response.headers.getSetCookie();assert.ok(setCookie.some(c=>/httponly/i.test(c)));
   const cookie=setCookie.map(c=>c.split(';')[0]).join('; ');
   const session=await requireUser(new Request(base+'/api/workspace',{headers:{Cookie:cookie}}));
   assert.equal(session.id,authUserId);assert.equal(session.email,email);
   const hash=(await owner.query('SELECT password FROM account WHERE "userId"=$1',[authUserId])).rows[0].password;
   assert.notEqual(hash,password);assert.ok(hash.length>32);
   const login=await auth.handler(request('sign-in/email',{email,password}));assert.equal(login.status,200);
   const logout=await auth.handler(request('sign-out',{},cookie));assert.equal(logout.status,200);
   await assert.rejects(requireUser(new Request(base+'/api/workspace',{headers:{Cookie:cookie}})),(error:unknown)=>error instanceof ApiError&&error.status===401);
   const limiter=(await owner.query('SELECT count(*)::int count FROM "rateLimit"')).rows[0].count;
   assert.ok(limiter>0);
  });
  await t.test('login limiter is enforced from database storage even in development',async()=>{
   const auth=getAuth();
   let limited=false;
   for(let i=0;i<12;i++){
    const response=await auth.handler(new Request(base+'/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'x-borderless-test-client-ip':testIp},body:JSON.stringify({email:'invalid-format',password:'SyntheticNotARealPassword'})}));
    if(response.status===429){limited=true;break;}
   }
   assert.equal(limited,true);
  });
 }finally{
  if(previousIpHeader===undefined)delete process.env.BORDERLESS_TRUSTED_IP_HEADER;else process.env.BORDERLESS_TRUSTED_IP_HEADER=previousIpHeader;
  await owner.query('DELETE FROM organizations WHERE id=ANY($1)',[[org,otherOrg]]);
  if(authUserId)await owner.query('DELETE FROM "user" WHERE id=$1',[authUserId]);
  await closePools();await owner.end();
 }
});
