import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';
import {expertService} from '@/lib/experts';
export const dynamic='force-dynamic';
export async function GET(req:Request){return handle(async()=>expertService.me(await requireUser(req)))}
export async function PUT(req:Request){return handle(async()=>expertService.saveProfile(await requireUser(req),await readBody(req)))}
