import {isIP} from 'node:net';
import {z} from 'zod';
export const NotificationPayloadSchema=z.object({inquiryId:z.string().min(1).max(160),companyName:z.string().trim().min(1).max(160),inquiryType:z.string().trim().min(1).max(80),createdAt:z.string().datetime({offset:true})}).strict();
export type NotificationPayload=z.infer<typeof NotificationPayloadSchema>;
export type ErrorCategory='configuration'|'delivery_disabled'|'rate_limited'|'provider_rejected'|'provider_unavailable'|'network'|'timeout'|'invalid_response'|'invalid_payload'|'lease_expired'|'retry_exhausted';
export type DeliveryResult={kind:'sent';providerMessageId?:string}|{kind:'disabled';category:ErrorCategory}|{kind:'failed';category:ErrorCategory;retryable:boolean;uncertain:boolean;retryAfterSeconds?:number};
export interface NotificationAdapter<TPayload=NotificationPayload>{channel:string;send(payload:TPayload,options:{signal:AbortSignal}):Promise<DeliveryResult>}
/** Recipient aliases contain no destination credentials; future adapters resolve them server-side. */
export type NotificationRoute={event:string;channel:string;recipientAlias:string;enabled:boolean};
export const notificationRoutes:readonly NotificationRoute[]=[
 {event:'sales.inquiry.created',channel:'slack',recipientAlias:'sales',enabled:true},
 {event:'expert.engagement.requested',channel:'slack',recipientAlias:'expert_operations',enabled:false},
 {event:'expert.verification.requested',channel:'slack',recipientAlias:'verification_operations',enabled:false},
 {event:'billing.verification.pending',channel:'slack',recipientAlias:'billing_operations',enabled:false},
 {event:'organization.security.changed',channel:'slack',recipientAlias:'security_operations',enabled:false}
];
export type NotificationFetch=(input:string,init:RequestInit)=>Promise<Response>;
export function validWebhook(value:string|undefined):string|null{
 if(!value)return null;
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='hooks.slack.com'&&(!url.port||url.port==='443')&&!url.username&&!url.password&&!url.search&&!url.hash&&/^\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9_-]+$/.test(url.pathname)?url.toString():null;}catch{return null;}
}
export function publicOrigin(value:string|undefined):string|null{
 if(!value)return null;
 try{
  const url=new URL(value),host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.port&&url.port!=='443')||isIP(host)||host.startsWith('['))return null;
  if(!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(host)||host.includes('..'))return null;
  if(/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)||['localtest.me','lvh.me','nip.io','sslip.io'].some(domain=>host===domain||host.endsWith('.'+domain)))return null;
  return url.origin;
 }catch{return null;}
}
export function notificationDeliveryConfigured():boolean{return process.env.NODE_ENV==='production'&&process.env.SLACK_SALES_DELIVERY_ENABLED==='true'&&Boolean(validWebhook(process.env.SLACK_SALES_WEBHOOK_URL))&&Boolean(publicOrigin(process.env.BORDERLESS_PUBLIC_URL));}
function cleanLabel(value:string){return value.replace(/https?:\/\/\S+/gi,'[link omitted]').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g,'[contact omitted]').replace(/[<>]/g,'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,160);}
export function slackMessage(payload:NotificationPayload,origin:string){
 const link=origin+'/admin/inquiries?inquiryId='+encodeURIComponent(payload.inquiryId);
 return {text:'New Borderless sales inquiry',unfurl_links:false,unfurl_media:false,blocks:[
  {type:'section',text:{type:'plain_text',text:'New sales inquiry'}},
  {type:'section',fields:[{type:'plain_text',text:'Inquiry: '+cleanLabel(payload.inquiryId)},{type:'plain_text',text:'Company: '+cleanLabel(payload.companyName)},{type:'plain_text',text:'Type: '+cleanLabel(payload.inquiryType)},{type:'plain_text',text:'Received: '+payload.createdAt}]},
  {type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Open inquiry'},url:link}]}
 ]};
}
export function createSlackAdapter(options:{transport?:NotificationFetch;testOnly?:boolean}={}):NotificationAdapter{
 const mocked=options.testOnly===true&&Boolean(options.transport)&&options.transport!==globalThis.fetch&&process.env.NODE_ENV!=='production';
 return {channel:'slack',async send(input,{signal}){
  const parsed=NotificationPayloadSchema.safeParse(input);if(!parsed.success)return {kind:'failed',category:'invalid_payload',retryable:false,uncertain:false};
  const webhook=validWebhook(process.env.SLACK_SALES_WEBHOOK_URL),origin=publicOrigin(process.env.BORDERLESS_PUBLIC_URL);
  if(!webhook||!origin)return {kind:'disabled',category:'configuration'};
  if(!mocked&&!notificationDeliveryConfigured())return {kind:'disabled',category:'delivery_disabled'};
  const timeout=AbortSignal.timeout(5000),combined=AbortSignal.any([signal,timeout]);
  try{
   const response=await (mocked?options.transport!:globalThis.fetch)(webhook,{method:'POST',redirect:'error',signal:combined,headers:{'Content-Type':'application/json'},body:JSON.stringify(slackMessage(parsed.data,origin))});
   if(response.status===429){
    const raw=response.headers.get('retry-after'),seconds=raw&&/^\d{1,7}$/.test(raw)?Number(raw):30;
    return {kind:'failed',category:'rate_limited',retryable:seconds<=7*86400,uncertain:false,retryAfterSeconds:seconds<=7*86400?Math.max(1,seconds):undefined};
   }
   if(response.status>=500)return {kind:'failed',category:'provider_unavailable',retryable:true,uncertain:true};
   if(!response.ok)return {kind:'failed',category:'provider_rejected',retryable:false,uncertain:false};
   const text=await response.text();
   if(text.trim()!=='ok')return {kind:'failed',category:'invalid_response',retryable:false,uncertain:true};
   return {kind:'sent'};
  }catch{return {kind:'failed',category:timeout.aborted||signal.aborted?'timeout':'network',retryable:true,uncertain:true};}
 }};
}
export const categoryMessages:Record<ErrorCategory,string>={configuration:'Slack webhook or public application origin is not configured.',delivery_disabled:'Slack delivery requires explicit production opt-in.',rate_limited:'Slack requested a delivery delay.',provider_rejected:'Slack rejected this request; operator review is required.',provider_unavailable:'Slack is temporarily unavailable; delivery may be uncertain.',network:'A network failure left delivery uncertain.',timeout:'A timeout left delivery uncertain.',invalid_response:'Slack returned an unsupported acknowledgement; delivery is uncertain.',invalid_payload:'The notification payload was invalid.',lease_expired:'The previous worker stopped; delivery may already have occurred.',retry_exhausted:'Automatic retry budget exhausted.'};
