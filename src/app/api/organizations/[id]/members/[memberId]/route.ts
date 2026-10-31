import {organizationService} from '@/lib/organizations';import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';import {z} from 'zod';

const Input=z.object({role:z.enum(['Admin','Member','Viewer'])}).strict();
export async function PATCH(req:Request,ctx:{params:Promise<{id:string;memberId:string}>}){return handle(async()=>{const p=await ctx.params;return organizationService.changeMemberRole(await requireUser(req),p.id,p.memberId,Input.parse(await readBody(req)).role);})}
