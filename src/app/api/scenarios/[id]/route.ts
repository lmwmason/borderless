import {repository} from '@/lib/workspace';import {ScenarioInputSchema} from '@/lib/contracts';import {handle,readBody} from '@/lib/http';
export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){return handle(async()=>repository.updateScenario((await ctx.params).id,ScenarioInputSchema.partial().parse(await readBody(req))))}
