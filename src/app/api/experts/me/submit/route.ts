import {requireUser} from '@/lib/auth';import {handle,readBody} from '@/lib/http';
import {expertService} from '@/lib/experts';import {z} from 'zod';
export async function POST(req:Request){return handle(async()=>{const user=await requireUser(req);z.object({}).strict().parse(await readBody(req));return expertService.submit(user);})}
