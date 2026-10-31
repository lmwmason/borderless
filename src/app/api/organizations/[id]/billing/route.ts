import {billingService} from '@/lib/billing';import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';import {z} from 'zod';

export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>billingService.get(await requireUser(req),(await ctx.params).id))}
