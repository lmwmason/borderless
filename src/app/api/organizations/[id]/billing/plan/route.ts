import {billingService} from '@/lib/billing';import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';import {z} from 'zod';

const Input=z.object({plan:z.enum(['Free','Startup','Business','Enterprise'])}).strict();
export async function PUT(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>{const user=await requireUser(req),id=(await ctx.params).id,input=Input.parse(await readBody(req));return billingService.selectPlan(user,id,input.plan);})}
