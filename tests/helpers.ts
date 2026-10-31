import {after} from 'node:test';
import {closePools} from '../src/lib/db';
after(()=>closePools());
import {randomUUID,randomInt} from 'node:crypto';
import assert from 'node:assert/strict';
import {getAuth} from '../src/lib/auth';
import {organizationService} from '../src/lib/organizations';
import {billingService,TERMS_VERSION} from '../src/lib/billing';
import type {AccountUser} from '../src/lib/organization-contracts';
// Only this test process trusts the synthetic address header.
process.env.BORDERLESS_TRUSTED_IP_HEADER='x-test-ip';
export const testOrigin=()=>new URL(process.env.BETTER_AUTH_URL||'http://localhost:3000').origin;
export const testPassword='Synthetic-test-password-2026!';
export async function authRequest(path:string,input:unknown,cookie='',ip='198.18.'+randomInt(1,250)+'.'+randomInt(1,250)){
 const headers:Record<string,string>={'Content-Type':'application/json',origin:testOrigin(),host:new URL(testOrigin()).host};
 if(cookie)headers.cookie=cookie;
 if(process.env.BORDERLESS_TRUSTED_IP_HEADER)headers[process.env.BORDERLESS_TRUSTED_IP_HEADER]=ip;
 return getAuth().handler(new Request(testOrigin()+'/api/auth/'+path,{method:'POST',headers,body:JSON.stringify(input)}));
}
export function responseCookie(response:Response){return response.headers.getSetCookie().map(cookie=>cookie.split(';')[0]).join('; ');}
export async function register(prefix='qa'){
 const id=randomUUID();const email=prefix+'-'+id+'@example.com';
 const response=await authRequest('sign-up/email',{name:prefix+' '+id.slice(0,6),email,password:testPassword});
 assert.equal(response.status,200,'synthetic sign-up must succeed');
 const payload=await response.json();const user=payload.user as AccountUser;
 return {user,email,cookie:responseCookie(response),password:testPassword};
}
export async function activateOrganization(user:AccountUser,name='QA organization'){
 const organization=await organizationService.create(user,{name});
 await billingService.acceptTerms(user,organization.id,{termsVersion:TERMS_VERSION,accepted:true});
 await billingService.activateFree(user,organization.id);
 return {...organization,status:'Active' as const};
}
export async function ownerProject(prefix='api'){
 const account=await register(prefix);
 const organization=await activateOrganization(account.user,prefix+' organization');
 const project=await organizationService.createProject(account.user,organization.id,{name:prefix+' project'});
 return {...account,organization,project};
}
export function scopedRequest(path:string,method:string,cookie:string,projectId:string,body?:unknown,extra:Record<string,string>={}){
 return new Request(testOrigin()+path,{method,headers:{cookie,'x-project-id':projectId,host:new URL(testOrigin()).host,...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
