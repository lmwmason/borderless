import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';
import {expertService} from '@/lib/experts';
export async function POST(req:Request){return handle(async()=>expertService.saveService(await requireUser(req),await readBody(req)))}
