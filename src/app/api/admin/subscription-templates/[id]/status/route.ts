import {requireAdmin} from '@/lib/admin/auth';
import {templateService} from '@/lib/admin/templates';
import {handle,readBody} from '@/lib/http';
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>templateService.setStatus(await requireAdmin(request),(await ctx.params).id,await readBody(request)));}
