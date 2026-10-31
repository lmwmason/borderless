import {requireProject} from '@/lib/organizations';import {createProjectRepository} from '@/lib/workspace/postgres';import {handle,readBody} from '@/lib/http';
import {z} from 'zod';
const Input=z.object({taskId:z.string().min(1).optional(),title:z.string().trim().min(1).max(240).optional(),assignee:z.string().max(160).nullable().optional()}).strict().refine(v=>Boolean(v.taskId)!==Boolean(v.title),'Choose an existing task or a new task title.');
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>createProjectRepository(await requireProject(req,true)).linkImpactTask((await ctx.params).id,Input.parse(await readBody(req))))}
