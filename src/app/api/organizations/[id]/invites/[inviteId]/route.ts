import {organizationService} from '@/lib/organizations';import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';import {z} from 'zod';

export async function DELETE(req:Request,ctx:{params:Promise<{id:string;inviteId:string}>}){return handle(async()=>{await readBody(new Request(req.url,{method:'DELETE',headers:req.headers,body:'{}'}));const p=await ctx.params;await organizationService.revokeInvite(await requireUser(req),p.id,p.inviteId);return {ok:true};})}
