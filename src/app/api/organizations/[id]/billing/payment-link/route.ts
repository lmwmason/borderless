import {paymentRequestLocale} from '@/lib/billing/request-locale';
import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';import {z} from 'zod';import {HostedPlan,paymentLink} from '@/lib/billing/payment-links';
const Input=z.object({plan:HostedPlan,locale:z.literal('ko').optional()}).strict();
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>{const user=await requireUser(req);return paymentLink(user,(await ctx.params).id,Input.parse(await readBody(req)).plan,paymentRequestLocale(req));})}
