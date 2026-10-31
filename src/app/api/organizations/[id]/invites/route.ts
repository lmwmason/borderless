import {organizationService} from '@/lib/organizations';import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';import {z} from 'zod';

const Input=z.object({expiresInHours:z.number().int().min(1).max(168).optional()}).strict();
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>organizationService.createInvite(await requireUser(req),(await ctx.params).id,Input.parse(await readBody(req))))}
