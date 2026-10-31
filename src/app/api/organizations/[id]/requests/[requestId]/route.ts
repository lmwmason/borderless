import {organizationService} from '@/lib/organizations';import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';import {z} from 'zod';

const Input=z.object({decision:z.enum(['approve','reject']),role:z.enum(['Admin','Member','Viewer']).default('Member')}).strict();
export async function PATCH(req:Request,ctx:{params:Promise<{id:string;requestId:string}>}){return handle(async()=>{const p=await ctx.params;return organizationService.decideRequest(await requireUser(req),p.id,p.requestId,Input.parse(await readBody(req)));})}
