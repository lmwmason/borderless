import {handle,readBody} from '@/lib/http';import {requirePlatformAdmin,inquiryService} from '@/lib/billing/inquiries';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>inquiryService.addNote(await requirePlatformAdmin(req),(await ctx.params).id,await readBody(req)));}
