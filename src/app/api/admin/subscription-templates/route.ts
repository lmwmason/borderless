import {requireAdmin} from '@/lib/admin/auth';
import {templateService} from '@/lib/admin/templates';
import {handle,readBody} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{const q=new URL(request.url).searchParams;return templateService.list(await requireAdmin(request),{q:q.get('q')??undefined,status:q.get('status')??undefined});});}
export async function POST(request:Request){return handle(async()=>templateService.create(await requireAdmin(request),await readBody(request)));}
