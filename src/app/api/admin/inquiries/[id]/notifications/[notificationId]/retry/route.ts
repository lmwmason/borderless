import {handle,readBody} from '@/lib/http';
import {requirePlatformAdmin} from '@/lib/billing/inquiries';
import {retryNotification} from '@/lib/notifications';
import {z} from 'zod';
export async function POST(req:Request,ctx:{params:Promise<{id:string;notificationId:string}>}){return handle(async()=>{
 const user=await requirePlatformAdmin(req);z.object({}).strict().parse(await readBody(req));const {id,notificationId}=await ctx.params;
 return retryNotification(user,notificationId,id);
});}
