import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';
import {expertService} from '@/lib/experts';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>expertService.detail(await requireUser(req),(await ctx.params).id))}
