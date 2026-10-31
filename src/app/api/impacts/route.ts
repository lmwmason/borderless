import {requireProject} from '@/lib/organizations';import {createProjectRepository} from '@/lib/workspace/postgres';import {handle,readBody} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(req:Request){return handle(async()=>({impacts:(await createProjectRepository(await requireProject(req)).getWorkspace()).impacts??[]}))}
