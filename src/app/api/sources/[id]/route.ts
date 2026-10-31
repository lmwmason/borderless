import {getSource} from '@/lib/legal';import {handle,ApiError} from '@/lib/http';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>{const source=getSource((await ctx.params).id);if(!source)throw new ApiError(404,'NOT_FOUND','Source not found.');return source;})}
