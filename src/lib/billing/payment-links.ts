import {PLANS} from './plans';import {z} from 'zod';import type {AccountUser} from '../organization-contracts';import {organizationAccess,transaction,audit} from '../organizations';import {ApiError} from '../http';import {TERMS_VERSION,TERMS_HASH} from './index';
export const HostedPlan=z.enum(['Startup','Business']);type HostedPlan=z.infer<typeof HostedPlan>;
export function configuredPaymentLink(plan:HostedPlan):string|null{
 // New names are authoritative, including an explicitly empty/invalid value.
 // Legacy names are compatibility aliases only when the new name is absent.
 const raw=process.env[plan==='Startup'?'GROBLE_STARTUP_URL':'GROBLE_BUSINESS_URL']??process.env[plan==='Startup'?'GROBLE_STARTUP_PAYMENT_URL':'GROBLE_BUSINESS_PAYMENT_URL'];if(!raw)return null;
 try{const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!(url.hostname==='groble.im'||url.hostname.endsWith('.groble.im')))return null;return url.toString();}catch{return null;}
}
export function pricingConfiguration(){return {plans:(['Free','Startup','Business','Enterprise'] as const).map(plan=>({...PLANS[plan],configured:plan==='Free'||plan==='Enterprise'||Boolean(configuredPaymentLink(plan))})),checkoutLocale:'ko' as const,paymentVerificationAvailable:false};}
export async function paymentLink(user:AccountUser,organizationId:string,input:unknown,contextLocale:string='en'){
 const plan=HostedPlan.parse(input);
 if(contextLocale!=='ko')throw new ApiError(409,'CHECKOUT_LANGUAGE_REQUIRED','Checkout is currently available in Korean only. You can continue to the Korean checkout page.');
 return transaction(async client=>{
  const org=await organizationAccess(client,user.id,organizationId,{admin:true,lock:true});
  if(org.plan!==plan)throw new ApiError(409,'PLAN_MISMATCH','Save this plan selection in company Billing before continuing.');
  const acceptance=await client.query('SELECT id FROM contract_acceptances WHERE organization_id=$1 AND terms_version=$2 AND terms_hash=$3 LIMIT 1',[organizationId,TERMS_VERSION,TERMS_HASH]);
  if(!acceptance.rowCount)throw new ApiError(409,'TERMS_REQUIRED','Accept the current company service terms before opening checkout.');
  const url=configuredPaymentLink(plan);if(!url)throw new ApiError(503,'CONFIG_REQUIRED','A verified Groble hosted payment link must be configured for this plan. No subscription has been activated.');
  await audit(client,user.id,organizationId,'billing.hosted_link_opened',{...PLANS[plan],provider:'Groble',checkoutLocale:'ko',verificationPending:true});
  return {url,...PLANS[plan],checkoutLocale:'ko' as const,verificationPending:true};
 });
}
