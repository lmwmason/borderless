import {repository} from '@/lib/workspace';import {handle,ApiError} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>{const a=await repository.getAssessment((await ctx.params).id);if(!a)throw new ApiError(404,'NOT_FOUND','Assessment not found.');return a;})}
