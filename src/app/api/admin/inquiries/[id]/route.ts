import {handle,readBody} from '@/lib/http';import {requirePlatformAdmin,inquiryService} from '@/lib/billing/inquiries';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>inquiryService.get(await requirePlatformAdmin(req),(await ctx.params).id));}
export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>{const user=await requirePlatformAdmin(req),id=(await ctx.params).id,input=await readBody(req);return input&&typeof input==='object'&&'status' in input?inquiryService.review(user,id,input):inquiryService.update(user,id,input);});}
