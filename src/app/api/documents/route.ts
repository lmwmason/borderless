import {requireProject} from '@/lib/organizations';import {projectDocuments,saveDocument} from '@/lib/workspace/postgres';import {handle,readBody} from '@/lib/http';import {z} from 'zod';
const Input=z.object({title:z.string().trim().min(1).max(200),content:z.string().max(20000)}).strict();
export async function GET(req:Request){return handle(async()=>({documents:await projectDocuments(await requireProject(req))}))}
export async function POST(req:Request){return handle(async()=>saveDocument(await requireProject(req,true),Input.parse(await readBody(req))))}
