import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';
import {expertService} from '@/lib/experts';
export const dynamic='force-dynamic';
export async function GET(req:Request){return handle(async()=>expertService.search(await requireUser(req),Object.fromEntries(new URL(req.url).searchParams)))}
