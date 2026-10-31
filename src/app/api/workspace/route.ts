import {createProjectRepository} from '@/lib/workspace/postgres';import {requireProject} from '@/lib/organizations';import {projectReviewService} from '@/lib/ai/review-jobs';import {handle} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(req:Request){return handle(async()=>{const scope=await requireProject(req);await projectReviewService(scope).recover();return createProjectRepository(scope).getWorkspace();})}
