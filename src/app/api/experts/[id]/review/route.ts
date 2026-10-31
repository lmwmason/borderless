import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';
import {expertService} from '@/lib/experts';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>expertService.review(await requireUser(req),(await ctx.params).id,await readBody(req)))}
