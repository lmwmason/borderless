import {getAdminSession} from '@/lib/admin/auth';
import {handle} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>await getAdminSession(request.headers)??{user:null});}
