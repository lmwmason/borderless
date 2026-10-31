import { betterAuth } from 'better-auth';
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
 const session=await getAuth().api.getSession({headers:request.headers});
 if(!session?.user)throw new ApiError(401,'UNAUTHENTICATED','Sign in to continue.');
 return {id:session.user.id,name:session.user.name,email:session.user.email};
}
