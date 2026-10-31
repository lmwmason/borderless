import {requireAdmin} from '@/lib/admin/auth';
import {adminService} from '@/lib/admin/service';
import {handle,readBody} from '@/lib/http';
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>adminService.previewContract(await requireAdmin(request),(await ctx.params).id,await readBody(request)));}
