import {requireAdmin} from '@/lib/admin/auth';
import {adminService} from '@/lib/admin/service';
import {handle} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>adminService.overview(await requireAdmin(request)));}
