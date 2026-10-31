import {requireAdmin} from '@/lib/admin/auth';
import {templateService} from '@/lib/admin/templates';
import {handle,readBody} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>templateService.get(await requireAdmin(request),(await ctx.params).id));}
export async function PATCH(request:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>templateService.update(await requireAdmin(request),(await ctx.params).id,await readBody(request)));}
