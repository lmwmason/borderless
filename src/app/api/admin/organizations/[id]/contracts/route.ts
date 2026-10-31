import {requireAdmin} from '@/lib/admin/auth';
import {adminService} from '@/lib/admin/service';
import {handle} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>adminService.contractHistory(await requireAdmin(request),(await ctx.params).id));}
