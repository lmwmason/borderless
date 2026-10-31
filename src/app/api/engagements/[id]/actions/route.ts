import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';
import {engagementService} from '@/lib/engagements';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>engagementService.action(await requireUser(req),(await ctx.params).id,await readBody(req)))}
