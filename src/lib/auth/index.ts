import { betterAuth } from 'better-auth';
import {APIError,createAuthMiddleware} from 'better-auth/api';
import {isAdminManagedUser,publicAdminEmail} from '../admin/identity';
import { getAuthPool } from '../db';
import { ApiError } from '../http';

function authConfig(){
 const baseURL=process.env.BETTER_AUTH_URL,secret=process.env.BETTER_AUTH_SECRET;
 if(!baseURL||!secret||secret.length<32)throw new Error('BETTER_AUTH_URL and a high-entropy BETTER_AUTH_SECRET of at least 32 characters are required.');
 const url=new URL(baseURL);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('BETTER_AUTH_URL must be an explicit application origin.');
 const secure=process.env.NODE_ENV==='production'||url.protocol==='https:';
 if(process.env.NODE_ENV==='production'&&url.protocol!=='https:')throw new Error('Production authentication requires an HTTPS origin.');
 return {baseURL:url.origin,secret,secure};
}
function createAuth(config:ReturnType<typeof authConfig>){
 return betterAuth({
  appName:'Borderless',baseURL:config.baseURL,secret:config.secret,database:getAuthPool(),
  trustedOrigins:[config.baseURL],
  emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128,autoSignIn:true},
  session:{expiresIn:60*60*24*7,updateAge:60*60*24,cookieCache:{enabled:false}},
  rateLimit:{enabled:true,storage:'database',window:60,max:120,customRules:{
   '/sign-in/email':{window:60,max:10},'/sign-up/email':{window:60,max:10},
   '/request-password-reset':{window:60,max:3}
  }},
  advanced:{
   useSecureCookies:config.secure,
   defaultCookieAttributes:{httpOnly:true,sameSite:'lax',secure:config.secure,path:'/'},
   // Only trust a header explicitly set/overwritten by the deployment proxy.
   // Without a trusted address Better Auth enforces a shared per-path bucket.
   ipAddress:{ipAddressHeaders:process.env.BORDERLESS_TRUSTED_IP_HEADER?[process.env.BORDERLESS_TRUSTED_IP_HEADER]:[]}
  },
  databaseHooks:{session:{create:{before:async(session,ctx)=>{
   // Signup creates a fresh server ID and cannot write admin_accounts. Avoid
   // borrowing a second pool client while Better Auth holds its signup transaction.
   if(ctx?.path?.startsWith('/sign-up'))return;
   if(await isAdminManagedUser(session.userId))throw new APIError('UNAUTHORIZED',{message:'Invalid email or password.'});}}}},
  hooks:{
   before:createAuthMiddleware(async ctx=>{
    const email=typeof ctx.body?.email==='string'?ctx.body.email:null;
    if(email&&await publicAdminEmail(email))throw new APIError('UNAUTHORIZED',{message:'Invalid email or password.'});
    // Reject an old regular session if its user later acquired an admin marker.
    const token=await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name,ctx.context.secret);
    if(typeof token==='string'){
     const existing=await ctx.context.internalAdapter.findSession(token);
     if(existing&&await isAdminManagedUser(existing.user.id))throw new APIError('UNAUTHORIZED',{message:'Regular user sign-in is required.'});
    }
   }),
   after:createAuthMiddleware(async ctx=>{
    const returned=ctx.context.returned as {user?:{id?:string}}|null;
    const id=returned?.user?.id||ctx.context.newSession?.user.id;
    if(id&&await isAdminManagedUser(id))throw new APIError('UNAUTHORIZED',{message:'Regular user sign-in is required.'});
   })
  },
  logger:{disabled:true}
 });
}
type Auth=ReturnType<typeof createAuth>;
let cached:{signature:string;instance:Auth}|undefined;
export function getAuth():Auth{
 const config=authConfig();
 const signature=JSON.stringify([config.baseURL,config.secret,config.secure,process.env.DATABASE_URL_AUTH||process.env.DATABASE_URL,process.env.BORDERLESS_TRUSTED_IP_HEADER]);
 if(cached?.signature===signature)return cached.instance;
 const instance=createAuth(config);cached={signature,instance};return instance;
}
export type AuthenticatedUser={id:string;name:string;email:string};
export async function requireUser(request:Request):Promise<AuthenticatedUser>{
 let session;
 try{session=await getAuth().api.getSession({headers:request.headers});}catch(error){if(error instanceof APIError&&[401,403].includes(error.statusCode))throw new ApiError(401,'UNAUTHENTICATED','Regular user sign-in is required.');throw error;}
 if(session?.user&&await isAdminManagedUser(session.user.id))throw new ApiError(403,'REGULAR_USER_REQUIRED','Use a regular user account for this workspace.');
 if(!session?.user)throw new ApiError(401,'UNAUTHENTICATED','Sign in to continue.');
 return {id:session.user.id,name:session.user.name,email:session.user.email};
}
