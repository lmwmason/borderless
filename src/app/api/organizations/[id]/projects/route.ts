import {organizationService} from '@/lib/organizations';import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';import {z} from 'zod';

const Input=z.object({name:z.string().trim().min(1).max(160),description:z.string().max(2000).optional()}).strict();
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>organizationService.createProject(await requireUser(req),(await ctx.params).id,Input.parse(await readBody(req))))}
