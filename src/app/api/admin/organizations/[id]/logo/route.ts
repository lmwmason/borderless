import {requireAdmin} from '@/lib/admin/auth';
import {handle} from '@/lib/http';
import {logoResponse} from '@/lib/logo-http';
import {readLogoForAdmin} from '@/lib/organization-logos';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){let file:Awaited<ReturnType<typeof readLogoForAdmin>>|undefined;const result=await handle(async()=>{file=await readLogoForAdmin(await requireAdmin(request),(await context.params).id);return {ok:true};});return result.ok&&file?logoResponse(file):result;}
