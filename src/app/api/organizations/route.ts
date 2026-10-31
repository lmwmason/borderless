import {organizationService} from '@/lib/organizations';import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';import {z} from 'zod';

const Input=z.object({name:z.string().trim().min(1).max(160)}).strict();
export async function POST(req:Request){return handle(async()=>organizationService.create(await requireUser(req),Input.parse(await readBody(req))))}
