import {projectReviewService} from '@/lib/ai/review-jobs';import {requireProject} from '@/lib/organizations';import {handle,readBody} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>projectReviewService(await requireProject(req)).get((await ctx.params).id))}
export async function DELETE(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>{const scope=await requireProject(req,true);await readBody(new Request(req.url,{method:'DELETE',headers:req.headers,body:'{}'}));return projectReviewService(scope).cancel((await ctx.params).id);})}
