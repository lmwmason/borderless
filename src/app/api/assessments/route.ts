import { z } from 'zod';
import {repository} from '@/lib/workspace';
import {quickAssess} from '@/lib/legal';
import {handle,readBody,ApiError} from '@/lib/http';
const Input=z.object({scenarioId:z.string().min(1),consent:z.boolean().optional()}).strict();
export async function POST(req:Request){return handle(async()=>{
 const input=Input.parse(await readBody(req));
 const w=await repository.getWorkspace();const scenario=w.scenarios.find(s=>s.id===input.scenarioId);
 if(!scenario)throw new ApiError(404,'NOT_FOUND','Scenario not found.');
 const result=await quickAssess(scenario.company,scenario.id);
 await repository.saveAssessment(result,scenario.company);return result;
})}
