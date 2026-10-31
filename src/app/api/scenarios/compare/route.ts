import {z} from 'zod';
import {requireProjectFeature} from '@/lib/feature-access';
import {createProjectRepository} from '@/lib/workspace/postgres';
import {handle,ApiError} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{
 const scope=await requireProjectFeature(request,'scenario_comparison'),query=new URL(request.url).searchParams;
 const ids=z.object({left:z.string().min(1).max(160),right:z.string().min(1).max(160)}).parse({left:query.get('left'),right:query.get('right')});
 const workspace=await createProjectRepository(scope).getWorkspace();
 const left=workspace.scenarios.find(item=>item.id===ids.left),right=workspace.scenarios.find(item=>item.id===ids.right);
 if(!left||!right)throw new ApiError(404,'NOT_FOUND','Select two scenarios in the current project.');
 return {left,right,assessments:workspace.assessments.filter(item=>item.scenarioId===left.id||item.scenarioId===right.id)};
});}
