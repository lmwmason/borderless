import {createProjectRepository} from '@/lib/workspace/postgres';import {requireProject} from '@/lib/organizations';import {handle} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>createProjectRepository(await requireProject(req)).getAssessment((await ctx.params).id))}
