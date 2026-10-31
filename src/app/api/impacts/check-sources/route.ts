import {requireProject} from '@/lib/organizations';import {createProjectRepository} from '@/lib/workspace/postgres';import {handle,readBody} from '@/lib/http';
import {z} from 'zod';import {sourceRevisions} from '@/lib/legal';
export async function POST(req:Request){return handle(async()=>{const scope=await requireProject(req,true);z.object({}).strict().parse(await readBody(req));return {impacts:await createProjectRepository(scope).reconcileSources(sourceRevisions())};})}
