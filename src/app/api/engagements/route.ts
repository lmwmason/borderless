import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';
import {engagementService} from '@/lib/engagements';
export const dynamic='force-dynamic';
export async function GET(req:Request){return handle(async()=>({engagements:await engagementService.list(await requireUser(req),{projectId:new URL(req.url).searchParams.get('projectId')??undefined})}))}
export async function POST(req:Request){return handle(async()=>engagementService.create(await requireUser(req),await readBody(req)))}
