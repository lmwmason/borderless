import {organizationService} from '@/lib/organizations';import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';import {z} from 'zod';

const Input=z.object({code:z.string().trim().min(16).max(200)}).strict();
export async function POST(req:Request){return handle(async()=>organizationService.join(await requireUser(req),Input.parse(await readBody(req)).code))}
