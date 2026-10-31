import {billingService} from '@/lib/billing';import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';import {z} from 'zod';

const Input=z.object({}).strict();
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>{const user=await requireUser(req),id=(await ctx.params).id,input=Input.parse(await readBody(req));return billingService.activateFree(user,id);})}
