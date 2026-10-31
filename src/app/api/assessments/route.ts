import { z } from 'zod';import {repository} from '@/lib/workspace';import {assess} from '@/lib/legal';import {nvidiaModel,isNvidiaConfigured} from '@/lib/ai/nvidia';import {handle,readBody,ApiError} from '@/lib/http';
const Input=z.object({scenarioId:z.string().min(1),consent:z.boolean().optional()}).strict();
let active=false;
export async function POST(req:Request){return handle(async()=>{
 const input=Input.parse(await readBody(req));
 const w=await repository.getWorkspace();const scenario=w.scenarios.find(s=>s.id===input.scenarioId);if(!scenario)throw new ApiError(404,'NOT_FOUND','Scenario not found.');
 if(isNvidiaConfigured()&&!input.consent)throw new ApiError(400,'CONSENT_REQUIRED','Consent is required before sending business facts to NVIDIA.');
 if(active)throw new ApiError(429,'BUSY','An assessment is running. Try again shortly.');
 active=true;try{const result=await assess(scenario.company,scenario.id,isNvidiaConfigured()?nvidiaModel:undefined);await repository.saveAssessment(result,scenario.company);return result;}finally{active=false;}
})}
