import {reviewService} from '@/lib/ai/review-jobs';import {handle,readBody} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return handle(()=>ctx.params.then(p=>reviewService.get(p.id)))}
export async function DELETE(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>{await readBody(new Request(req.url,{method:'DELETE',headers:req.headers,body:'{}'}));return reviewService.cancel((await ctx.params).id);})}
