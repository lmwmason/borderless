import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';
import {expertService} from '@/lib/experts';
export async function DELETE(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>{const user=await requireUser(req);await readBody(new Request(req.url,{method:'DELETE',headers:req.headers,body:'{}'}));await expertService.deleteService(user,(await ctx.params).id);return {ok:true};})}
