import {requireProject} from '@/lib/organizations';import {createProjectRepository} from '@/lib/workspace/postgres';import {handle,readBody} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>createProjectRepository(await requireProject(req)).getImpact((await ctx.params).id))}
