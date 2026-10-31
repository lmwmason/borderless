import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';
import {engagementService} from '@/lib/engagements';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>engagementService.workspace(await requireUser(req),(await ctx.params).id))}
