import {repository} from '@/lib/workspace';import {TaskInputSchema} from '@/lib/contracts';import {handle,readBody} from '@/lib/http';
export async function POST(req:Request){return handle(async()=>repository.createTask(TaskInputSchema.parse(await readBody(req))))}
