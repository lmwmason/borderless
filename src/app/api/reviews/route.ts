import {z} from 'zod';import {reviewService} from '@/lib/ai/review-jobs';import {handle,readBody} from '@/lib/http';
const Input=z.object({scenarioId:z.string().min(1),consent:z.boolean()}).strict();
export async function POST(req:Request){const response=await handle(async()=>{const input=Input.parse(await readBody(req));return reviewService.start(input.scenarioId,input.consent);});if(response.ok)return new Response(response.body,{status:202,headers:response.headers});return response;}
