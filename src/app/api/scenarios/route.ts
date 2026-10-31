import {repository} from '@/lib/workspace';import {ScenarioInputSchema} from '@/lib/contracts';import {handle,readBody} from '@/lib/http';
export async function POST(req:Request){return handle(async()=>repository.createScenario(ScenarioInputSchema.parse(await readBody(req))))}
