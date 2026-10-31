import {requireAdmin} from '@/lib/admin/auth';
import {adminService} from '@/lib/admin/service';
import {handle,readBody} from '@/lib/http';
import {z} from 'zod';
export async function POST(request:Request,ctx:{params:Promise<{id:string;contractId:string}>}){return handle(async()=>{
 const user=await requireAdmin(request),params=await ctx.params,input=z.object({attested:z.literal(true),reason:z.string().trim().min(3).max(2000)}).strict().parse(await readBody(request));
 return adminService.approveContract(user,params.id,params.contractId,input);
});}
