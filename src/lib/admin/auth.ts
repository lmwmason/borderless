import {betterAuth} from 'better-auth';
import {APIError,createAuthMiddleware} from 'better-auth/api';
import {hashPassword} from 'better-auth/crypto';
import {createHash,randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {z} from 'zod';
import {getAuthPool,getPool} from '../db';
import {ApiError} from '../http';
import type {AccountUser} from '../organization-contracts';
import {ADMIN_EMAIL_DOMAIN,adminDemoAllowed,isAdminManagedUser,isEnabledAdminUser,listEnabledAdmins} from './identity';
export {adminDemoAllowed,adminIsDemo,isAdminManagedUser,isEnabledAdminUser,listEnabledAdmins} from './identity';
export type AdminUser=AccountUser&{loginId:string;isDemo:boolean};
const LoginId=z.string().trim().min(3).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._@+-]*$/).transform(value=>value.toLowerCase());
const Login=z.object({loginId:LoginId,password:z.string().min(1).max(128)}).strict();
function config(){
 const base=process.env.BETTER_AUTH_URL,regular=process.env.BETTER_AUTH_SECRET;
 if(!base)throw new Error('An explicit BETTER_AUTH_URL is required.');
 const url=new URL(base);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('BETTER_AUTH_URL must be an application origin.');
 const production=process.env.NODE_ENV==='production';
 const secret=process.env.BORDERLESS_ADMIN_AUTH_SECRET||(!production&&regular&&regular.length>=32?regular+':borderless-admin':undefined);
 if(!secret||secret.length<32||(production&&secret===regular))throw new Error('A distinct BORDERLESS_ADMIN_AUTH_SECRET of at least 32 characters is required.');
 if(production&&url.protocol!=='https:')throw new Error('Production administrator authentication requires HTTPS.');
 return {baseURL:url.origin,secret,secure:production||url.protocol==='https:'};
}
function createAdminAuth(settings:ReturnType<typeof config>){
 return betterAuth({
  appName:'Borderless Administration',baseURL:settings.baseURL,basePath:'/api/admin/auth',secret:settings.secret,database:getAuthPool(),trustedOrigins:[settings.baseURL],
  emailAndPassword:{enabled:true,disableSignUp:true,minPasswordLength:8,maxPasswordLength:128,autoSignIn:false},
  session:{expiresIn:3600,updateAge:3600,cookieCache:{enabled:false}},
  rateLimit:{enabled:true,storage:'database',window:60,max:5,customRules:{'/sign-in/email':{window:60,max:5}}},
  advanced:{cookiePrefix:'borderless-admin',useSecureCookies:settings.secure,defaultCookieAttributes:{httpOnly:true,sameSite:'lax',secure:settings.secure,path:'/'},ipAddress:{ipAddressHeaders:process.env.BORDERLESS_TRUSTED_IP_HEADER?[process.env.BORDERLESS_TRUSTED_IP_HEADER]:[]}},
  databaseHooks:{session:{create:{before:async session=>{if(!await isEnabledAdminUser(session.userId))throw new APIError('UNAUTHORIZED',{message:'Administrator sign-in is unavailable.'});return {data:{...session,expiresAt:new Date(Date.now()+3600000)}};}}}},
  hooks:{after:createAuthMiddleware(async ctx=>{
   const returned=ctx.context.returned as {user?:{id?:string}}|null;
   const id=returned?.user?.id||ctx.context.newSession?.user.id;
   if(id&&!await isEnabledAdminUser(id))throw new APIError('UNAUTHORIZED',{message:'Administrator sign-in is unavailable.'});
  })},logger:{disabled:true}
 });
}
let cached:{signature:string;instance:ReturnType<typeof createAdminAuth>}|undefined;
function instance(){
 const settings=config(),signature=JSON.stringify([settings,process.env.DATABASE_URL_AUTH||process.env.DATABASE_URL,process.env.BORDERLESS_TRUSTED_IP_HEADER]);
 if(cached?.signature===signature)return cached.instance;
 const auth=createAdminAuth(settings);cached={signature,instance:auth};return auth;
}
async function audit(actorId:string|null,action:string,detail:Record<string,unknown>={}){
 await getPool().query('INSERT INTO audit_logs(id,actor_id,action,detail) VALUES($1,$2,$3,$4)',[randomUUID(),actorId,action,detail]);
}
function originCheck(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==config().baseURL)throw new ApiError(403,'ORIGIN','Cross-origin administrator mutation denied.');}
function hasAdminCookie(headers:Headers){return (headers.get('cookie')||'').split(';').some(part=>['borderless-admin.session_token','__Secure-borderless-admin.session_token'].includes(part.trim().split('=')[0]));}
export async function getAdminSession(headers:Headers):Promise<{user:AdminUser;expiresAt:string}|null>{
 if(!hasAdminCookie(headers))return null;
 let session;
 try{session=await instance().api.getSession({headers});}catch(error){if(error instanceof APIError&&[401,403].includes(error.statusCode))return null;throw error;}
 if(!session?.user||!await isEnabledAdminUser(session.user.id))return null;
 const marker=(await getAuthPool().query('SELECT login_id,is_demo FROM admin_accounts WHERE user_id=$1 AND enabled',[session.user.id])).rows[0];
 if(!marker||marker.is_demo&&!adminDemoAllowed())return null;
 return {user:{id:session.user.id,name:session.user.name,email:session.user.email,loginId:marker.login_id,isDemo:marker.is_demo},expiresAt:new Date(session.session.expiresAt).toISOString()};
}
export async function requireAdmin(req:Request):Promise<AdminUser>{
 const session=await getAdminSession(req.headers);if(!session)throw new ApiError(401,'ADMIN_AUTH_REQUIRED','Administrator sign-in is required.');return session.user;
}
function sanitizedResponse(native:Response,body:unknown,status=native.status):Response{
 const headers=new Headers();
 native.headers.forEach((value,key)=>{if(!['set-cookie','content-type','content-length','set-auth-token','authorization'].includes(key.toLowerCase()))headers.append(key,value);});
 for(const cookie of native.headers.getSetCookie())headers.append('Set-Cookie',cookie);
 headers.set('Content-Type','application/json');headers.set('Cache-Control','no-store');
 return new Response(JSON.stringify(body),{status,headers});
}
async function loginLimit(req:Request){
 const header=process.env.BORDERLESS_TRUSTED_IP_HEADER;
 const candidate=header?req.headers.get(header):null;
 const address=candidate&&isIP(candidate)?candidate:'shared';
 const key='borderless-admin-login:'+createHash('sha256').update(address).digest('hex'),now=Date.now();
 const count=(await getAuthPool().query('INSERT INTO "rateLimit"(id,key,count,"lastRequest") VALUES($1,$2,1,$3) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN "rateLimit"."lastRequest"<=$3-60000 THEN 1 ELSE "rateLimit".count+1 END,"lastRequest"=CASE WHEN "rateLimit"."lastRequest"<=$3-60000 THEN $3 ELSE "rateLimit"."lastRequest" END RETURNING count',[randomUUID(),key,now])).rows[0].count;
 if(count>5){await audit(null,'admin.login_failed',{category:'rate_limited'});throw new ApiError(429,'RATE_LIMIT','Too many administrator sign-in attempts. Try again later.');}
}
export async function adminSignIn(req:Request,input:{loginId:string;password:string}):Promise<Response>{
 originCheck(req);await loginLimit(req);
 const fields=Login.parse(input),fingerprint=createHash('sha256').update(fields.loginId).digest('hex');
 await audit(null,'admin.login_attempted',{loginIdFingerprint:fingerprint});
 const row=(await getAuthPool().query('SELECT a.user_id,a.login_id,a.is_demo,a.enabled,u.name,u.email FROM admin_accounts a JOIN "user" u ON u.id=a.user_id WHERE a.login_id=$1',[fields.loginId])).rows[0];
 if(!row||!row.enabled||row.is_demo&&!adminDemoAllowed()){
  await hashPassword(fields.password);await audit(row?.user_id??null,'admin.login_failed',{category:'invalid_credentials',loginIdFingerprint:fingerprint});
  return Response.json({error:{code:'INVALID_CREDENTIALS',message:'Invalid administrator credentials.',retryable:false}},{status:401,headers:{'Cache-Control':'no-store'}});
 }
 const native=await instance().api.signInEmail({body:{email:row.email,password:fields.password,rememberMe:false},headers:req.headers,asResponse:true});
 if(!native.ok){await audit(row.user_id,'admin.login_failed',{category:'invalid_credentials'});return sanitizedResponse(native,{error:{code:'INVALID_CREDENTIALS',message:'Invalid administrator credentials.',retryable:false}},native.status===429?429:401);}
 if(!await isEnabledAdminUser(row.user_id))throw new ApiError(403,'ADMIN_DISABLED','Administrator access is disabled.');
 const user:AdminUser={id:row.user_id,name:row.name,email:row.email,loginId:row.login_id,isDemo:row.is_demo};
 await audit(user.id,'admin.login_succeeded');return sanitizedResponse(native,{user});
}
export async function adminSignOut(req:Request):Promise<Response>{
 originCheck(req);const session=await getAdminSession(req.headers);
 const native=await instance().api.signOut({headers:req.headers,asResponse:true});
 await audit(session?.user.id??null,'admin.logout');return sanitizedResponse(native,{ok:true});
}
export async function provisionAdmin(input:{loginId:string;password:string;name?:string;demo:boolean}):Promise<AdminUser>{
 const fields=z.object({loginId:LoginId,password:z.string().min(8).max(128),name:z.string().trim().min(1).max(160).optional(),demo:z.boolean()}).strict().parse(input);
 config();
 if(fields.demo&&!adminDemoAllowed())throw new ApiError(403,'ADMIN_DEMO_FORBIDDEN','Local administrator demo is not permitted in this environment.');
 if(!fields.demo&&(fields.password.length<16||!/[a-z]/.test(fields.password)||!/[A-Z]/.test(fields.password)||!/[0-9]/.test(fields.password)||!(/[^a-zA-Z0-9]/).test(fields.password)))throw new ApiError(400,'ADMIN_PASSWORD_POLICY','Use at least 16 characters with upper/lower case, a number and a symbol.');
 const user:AdminUser={id:randomUUID(),name:fields.name||fields.loginId,email:'admin-'+createHash('sha256').update(fields.loginId).digest('hex').slice(0,40)+'@'+ADMIN_EMAIL_DOMAIN,loginId:fields.loginId,isDemo:fields.demo};
 const password=await hashPassword(fields.password),client=await getAuthPool().connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['admin-provision:'+fields.loginId]);
  if((await client.query('SELECT 1 FROM admin_accounts WHERE login_id=$1',[fields.loginId])).rowCount)throw new ApiError(409,'ADMIN_EXISTS','Administrator login already exists; no password was changed.');
  await client.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,false,now(),now())',[user.id,user.name,user.email]);
  await client.query(`INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,'credential',$2,$3,now(),now())`,[randomUUID(),user.id,password]);
  await client.query('INSERT INTO admin_accounts(user_id,login_id,is_demo,enabled,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[user.id,user.loginId,user.isDemo]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 await audit(user.id,'admin.provisioned',{demo:user.isDemo});return user;
}
export async function revokeAdminManagedUserSessions(actor:AccountUser,targetUserId:string):Promise<{revokedSessions:number}>{
 if(!await isEnabledAdminUser(actor.id))throw new ApiError(403,'ADMIN_DISABLED','An enabled administrator is required.');
 z.string().min(1).max(160).parse(targetUserId);
 if(await isAdminManagedUser(targetUserId))throw new ApiError(403,'ADMIN_IDENTITY','This operation is only for regular user sessions.');
 const result=await getAuthPool().query('DELETE FROM session WHERE "userId"=$1',[targetUserId]);return {revokedSessions:result.rowCount??0};
}
