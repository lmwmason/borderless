import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';
import {engagementService} from '@/lib/engagements';
export async function PATCH(req:Request,ctx:{params:Promise<{id:string;entryId:string}>}){return handle(async()=>{const p=await ctx.params;return engagementService.updateEntry(await requireUser(req),p.id,p.entryId,await readBody(req));})}
