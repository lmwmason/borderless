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
 let authUserId:string|undefined,loginCookie:string|undefined;
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
  await t.test('all nine payload tables enable and force RLS',async()=>{
   const rows=(await owner.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1)",[['company_profiles','scenarios','assessments','findings','tasks','review_jobs','project_activity','documents','change_impacts']])).rows;
   assert.equal(rows.length,9);assert.ok(rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity));
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
  await t.test('regulatory change impacts enforce scoped CRUD and deny auth role',async()=>{
   await assert.rejects(getAuthPool().query('SELECT * FROM change_impacts LIMIT 1'),(error:unknown)=>(error as {code?:string}).code==='42501');
   assert.equal((await getPool().query('SELECT id FROM change_impacts WHERE project_id=$1',[project])).rowCount,0);
   const client=await getPool().connect();
   try{
    await client.query('BEGIN');
    await client.query("SELECT set_config('borderless.organization_id',$1,true),set_config('borderless.project_id',$2,true)",[org,project]);
    await client.query('INSERT INTO change_impacts(id,organization_id,project_id,payload) VALUES($1,$2,$3,$4)',[marker+'-scoped',org,project,{synthetic:true,status:'review_required'}]);
    assert.equal((await client.query('SELECT id FROM change_impacts WHERE id=$1',[marker+'-scoped'])).rowCount,1);
    assert.equal((await client.query('UPDATE change_impacts SET payload=$1 WHERE id=$2',[{synthetic:true,status:'human_reviewed'},marker+'-scoped'])).rowCount,1);
    assert.equal((await client.query('DELETE FROM change_impacts WHERE id=$1',[marker+'-scoped'])).rowCount,1);
    await assert.rejects(client.query('INSERT INTO change_impacts(id,organization_id,project_id,payload) VALUES($1,$2,$3,$4)',[marker+'-cross',otherOrg,otherProject,{}]),(error:unknown)=>(error as {code?:string}).code==='42501');
   }finally{await client.query('ROLLBACK');client.release();}
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
   loginCookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
   const logout=await auth.handler(request('sign-out',{},cookie));assert.equal(logout.status,200);
   await assert.rejects(requireUser(new Request(base+'/api/workspace',{headers:{Cookie:cookie}})),(error:unknown)=>error instanceof ApiError&&error.status===401);
   const limiter=(await owner.query('SELECT count(*)::int count FROM "rateLimit"')).rows[0].count;
   assert.ok(limiter>0);
  });
  await t.test('repeated and concurrent migrations preserve seeded records, sessions and privileges',async()=>{
   assert.ok(authUserId);assert.ok(loginCookie);
   const payloadTables=['company_profiles','scenarios','assessments','findings','review_jobs','project_activity','documents','change_impacts'];
   for(const table of payloadTables)await owner.query('INSERT INTO '+table+'(id,organization_id,project_id,payload) VALUES($1,$2,$3,$4)',[marker+'-payload',org,project,{synthetic:true,notes:'Preserve exactly',nested:{values:[1,null,false]}}]);
   await owner.query("INSERT INTO memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,'Owner')",[marker+'-member',org,authUserId]);
   await owner.query("INSERT INTO contract_acceptances(id,organization_id,actor_id,terms_version,terms_hash) VALUES($1,$2,$3,'synthetic-v1',$4)",[marker+'-terms',org,authUserId,randomUUID()]);
   await owner.query("INSERT INTO audit_logs(id,organization_id,project_id,actor_id,action,detail) VALUES($1,$2,$3,$4,'synthetic_preservation_check',$5)",[marker+'-audit',org,project,authUserId,{synthetic:true,retained:'unchanged'}]);
   await owner.query("INSERT INTO subscriptions(id,organization_id,plan,status) VALUES($1,$2,'Free','Pending')",[marker+'-subscription',org]);
   const fingerprints=async()=>{
    const snapshots:Record<string,unknown>={};
    const scope=async(table:string,filter:string,params:unknown[])=>{
     snapshots[table]=(await owner.query(`SELECT count(*)::int AS count,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) AS checksum FROM "${table}" t WHERE ${filter}`,params)).rows[0];
    };
    for(const table of [...payloadTables,'tasks'])await scope(table,'project_id=ANY($1)',[[project,otherProject]]);
    for(const table of ['organization_workspaces','memberships','contract_acceptances','audit_logs','subscriptions','projects'])await scope(table,'organization_id=$1',[org]);
    await scope('organizations','id=$1',[org]);
    await scope('user','id=$1',[authUserId]);
    for(const table of ['session','account'])await scope(table,'"userId"=$1',[authUserId]);
    snapshots.grants=(await owner.query("SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN (current_database()||'_runtime',current_database()||'_auth') ORDER BY table_name,grantee,privilege_type")).rows;
    snapshots.rls=(await owner.query("SELECT tablename,policyname,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname")).rows;
    snapshots.journal=(await owner.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at')).rows;
    return snapshots;
   };
   const before=await fingerprints();
   await migrateDatabase();await migrateDatabase();
   await Promise.all([migrateDatabase(),migrateDatabase(),migrateDatabase()]);
   assert.deepEqual(await fingerprints(),before);
   assert.equal((await requireUser(new Request(base+'/api/workspace',{headers:{Cookie:loginCookie!}}))).id,authUserId);
   await assert.rejects(getPool().query('UPDATE contract_acceptances SET terms_version=terms_version WHERE id=$1',[marker+'-terms']),(error:unknown)=>(error as {code?:string}).code==='42501');
   await assert.rejects(getPool().query('DELETE FROM audit_logs WHERE id=$1',[marker+'-audit']),(error:unknown)=>(error as {code?:string}).code==='42501');
  });
  await t.test('failed restricted-role migration releases advisory lock and its restricted connection',async()=>{
   const direct=process.env.DIRECT_DATABASE_URL;
   const failingRole=(await getPool().query('SELECT current_user AS role')).rows[0].role as string;
   try{
    process.env.DIRECT_DATABASE_URL=process.env.DATABASE_URL_RUNTIME;
    await assert.rejects(migrateDatabase(),(error:unknown)=>{const failure=error as {code?:string;cause?:{code?:string}};return failure.code==='42501'||failure.cause?.code==='42501';});
   }finally{process.env.DIRECT_DATABASE_URL=direct;}
   const client=await owner.connect();
   try{
    const acquired=(await client.query("SELECT pg_try_advisory_lock(hashtext('borderless_schema_migration')) AS acquired")).rows[0].acquired;
    assert.equal(acquired,true);
    if(acquired)await client.query("SELECT pg_advisory_unlock(hashtext('borderless_schema_migration'))");
   }finally{client.release();}
   // Other test files may legitimately migrate as owner concurrently. Only
   // the restricted-role connection created by this fault must be gone.
   assert.equal((await owner.query("SELECT count(*)::int count FROM pg_stat_activity WHERE datname=current_database() AND application_name='borderless-migrate' AND usename=$1",[failingRole])).rows[0].count,0);
   await migrateDatabase();
  });
  await t.test('session advisory lock serializes migrators and releases after success',async()=>{
   const client=await owner.connect();let settled=false;
   let pending:Promise<void>|undefined;
   try{
    await client.query("SELECT pg_advisory_lock(hashtext('borderless_schema_migration'))");
    pending=migrateDatabase().finally(()=>{settled=true;});
    await new Promise(resolve=>{ setTimeout(resolve,40); });
    assert.equal(settled,false);
   }finally{
    await client.query("SELECT pg_advisory_unlock(hashtext('borderless_schema_migration'))");client.release();
    if(pending)await pending;
   }
   assert.equal(settled,true);
  });
  await t.test('production migration refuses pooled/default fallback without direct owner URL',async()=>{
   const direct=process.env.DIRECT_DATABASE_URL,nodeEnv=process.env.NODE_ENV;
   try{
    Object.assign(process.env,{NODE_ENV:'production'});delete process.env.DIRECT_DATABASE_URL;
    await assert.rejects(migrateDatabase(),/Production migrations require DIRECT_DATABASE_URL/);
   }finally{
    process.env.DIRECT_DATABASE_URL=direct;
    if(nodeEnv===undefined)Reflect.deleteProperty(process.env,'NODE_ENV');else Object.assign(process.env,{NODE_ENV:nodeEnv});
   }
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
  await owner.query('DELETE FROM audit_logs WHERE id=$1',[marker+'-audit']);
  await owner.query('DELETE FROM organizations WHERE id=ANY($1)',[[org,otherOrg]]);
  if(authUserId)await owner.query('DELETE FROM "user" WHERE id=$1',[authUserId]);
  await closePools();await owner.end();
 }
});
