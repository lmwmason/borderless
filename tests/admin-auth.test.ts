import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {register,registerAdmin,testOrigin,responseCookie,authRequest} from './helpers';
import {getAdminSession,requireAdmin,provisionAdmin,adminSignIn} from '../src/lib/admin/auth';
import {getAuthPool,getPool} from '../src/lib/db';
import {requireUser} from '../src/lib/auth';
import {GET as overview} from '../src/app/api/admin/overview/route';
import {GET as inbox} from '../src/app/api/admin/inquiries/route';
import {POST as logout} from '../src/app/api/admin/logout/route';
const code=(expected:string)=>(error:any)=>error?.code===expected;
const req=(path:string,cookie='',body?:unknown)=>new Request(testOrigin()+path,{method:body?'POST':'GET',headers:{cookie,origin:testOrigin(),host:new URL(testOrigin()).host,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});

test('separate administrator cookies, safe password hash, audited login/logout and ordinary session isolation',async()=>{
 const ordinary=await register('ordinary-admin-denial'),admin=await registerAdmin();
 const hash=(await getAuthPool().query('SELECT password FROM account WHERE "userId"=$1 AND "providerId"=$2',[admin.user.id,'credential'])).rows[0].password;
 assert.notEqual(hash,admin.password);assert.ok(hash.length>80);
 const cookies=admin.response.headers.getSetCookie().join(';');assert.match(cookies,/HttpOnly/i);assert.match(cookies,/SameSite=Lax/i);assert.match(cookies,/borderless-admin\.session_token/);
 const body=await admin.response.json();assert.deepEqual(Object.keys(body),['user']);assert.ok(!JSON.stringify(body).includes(admin.password));assert.equal(body.token,undefined);
 assert.equal((await getAdminSession(new Headers({cookie:admin.cookie})))?.user.id,admin.user.id);
 await assert.rejects(requireAdmin(req('/api/admin/overview',ordinary.cookie)),code('ADMIN_AUTH_REQUIRED'));
 assert.equal(await getAdminSession(new Headers({cookie:ordinary.cookie.replaceAll('better-auth.','borderless-admin.')})),null);
 await assert.rejects(requireUser(req('/api/account',admin.cookie)),code('UNAUTHENTICATED'));
 assert.equal((await authRequest('sign-in/email',{email:admin.user.email,password:admin.password})).ok,false);
 assert.equal((await authRequest('sign-up/email',{name:'Reserved identity attempt',email:'attempt@admins.borderless.invalid',password:ordinary.password})).ok,false);
 const original=process.env.BORDERLESS_PLATFORM_ADMIN_IDS;
 try{
  process.env.BORDERLESS_PLATFORM_ADMIN_IDS=ordinary.user.id;
  assert.equal((await inbox(req('/api/admin/inquiries',ordinary.cookie))).status,401,'legacy operator allowlist must not replace separate administrator login');
  assert.equal((await overview(req('/api/admin/overview',ordinary.cookie))).status,401);
  assert.equal((await overview(req('/api/admin/overview',admin.cookie))).status,200);
 }finally{if(original===undefined)delete process.env.BORDERLESS_PLATFORM_ADMIN_IDS;else process.env.BORDERLESS_PLATFORM_ADMIN_IDS=original;}
 await assert.rejects(getPool().query('SELECT * FROM admin_accounts'),(error:any)=>error.code==='42501');
 const signedOut=await logout(req('/api/admin/logout',admin.cookie,{}));assert.equal(signedOut.status,200);
 assert.equal(await getAdminSession(new Headers({cookie:admin.cookie})),null);
 const events=(await getPool().query("SELECT action,detail FROM audit_logs WHERE actor_id=$1 AND action LIKE 'admin.%'",[admin.user.id])).rows;
 assert.ok(events.some(e=>e.action==='admin.login_succeeded'));assert.ok(events.some(e=>e.action==='admin.logout'));assert.ok(!JSON.stringify(events).includes(admin.password));
});

test('administrator login attempts are bounded in PostgreSQL, including nonexistent identities',async()=>{
 const id='unknown-'+randomUUID(),headers={origin:testOrigin(),'x-test-ip':'198.18.250.250'};
 const statuses:number[]=[];
 for(let i=0;i<6;i++){
  try{statuses.push((await adminSignIn(new Request(testOrigin()+'/api/admin/login',{method:'POST',headers}),{loginId:id,password:randomUUID()})).status);}
  catch(error){statuses.push((error as {status:number}).status);}
 }
 assert.deepEqual(statuses,[401,401,401,401,401,429]);
 const audit=(await getPool().query("SELECT detail FROM audit_logs WHERE action='admin.login_failed' AND detail->>'category'='rate_limited' ORDER BY created_at DESC LIMIT 1")).rows;assert.equal(audit.length,1);
});

test('local demo administrator provisioning, login and copied sessions are rejected in production',async()=>{
 const original={mode:process.env.NODE_ENV,flag:process.env.BORDERLESS_LOCAL_ADMIN_DEMO,url:process.env.BETTER_AUTH_URL};
 const loginId='demo-'+randomUUID(),password=randomUUID()+randomUUID()+'!aA9';let demoId='';
 try{
  Object.assign(process.env,{NODE_ENV:'development',BORDERLESS_LOCAL_ADMIN_DEMO:'true'});
  const demo=await provisionAdmin({loginId,password,demo:true});demoId=demo.id;
  const login=await adminSignIn(new Request(testOrigin()+'/api/admin/login',{method:'POST',headers:{origin:testOrigin(),'x-test-ip':'198.18.250.251'}}),{loginId,password});assert.equal(login.status,200);
  const cookie=responseCookie(login);assert.ok(await getAdminSession(new Headers({cookie})));
  Object.assign(process.env,{NODE_ENV:'production',BETTER_AUTH_URL:'https://localhost:3000'});
  await assert.rejects(provisionAdmin({loginId:'forbidden-'+randomUUID(),password,demo:true}),code('ADMIN_DEMO_FORBIDDEN'));
  const blocked=await adminSignIn(new Request('https://localhost:3000/api/admin/login',{method:'POST',headers:{origin:'https://localhost:3000','x-test-ip':'198.18.250.252'}}),{loginId,password});assert.equal(blocked.status,401);
  assert.equal(await getAdminSession(new Headers({cookie:cookie.replace('borderless-admin.session_token','__Secure-borderless-admin.session_token')})),null);
 }finally{
  for(const [key,value] of Object.entries({NODE_ENV:original.mode,BORDERLESS_LOCAL_ADMIN_DEMO:original.flag,BETTER_AUTH_URL:original.url}))if(value===undefined)Reflect.deleteProperty(process.env,key);else Object.assign(process.env,{[key]:value});
 }
 assert.ok(demoId);
});

test('administrator expiry is enforced and production provisioning rejects weak non-demo passwords',async()=>{
 const admin=await registerAdmin('expiry-admin');
 await getAuthPool().query('UPDATE session SET "expiresAt"=now()-interval \'1 minute\' WHERE "userId"=$1',[admin.user.id]);
 assert.equal(await getAdminSession(new Headers({cookie:admin.cookie})),null);
 await assert.rejects(provisionAdmin({loginId:'weak-'+randomUUID(),password:'a'.repeat(10),demo:false}),code('ADMIN_PASSWORD_POLICY'));
});
