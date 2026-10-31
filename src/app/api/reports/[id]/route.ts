import {handle} from '@/lib/http';
import {repository} from '@/lib/workspace';import {getSource} from '@/lib/legal';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
 const result=await handle(async()=>repository.getAssessment((await ctx.params).id));
 if(!result.ok)return result;
 const a=await result.json() as import('@/lib/contracts').Assessment;
 if(!a)return Response.json({error:{code:'NOT_FOUND',message:'Assessment not found.',retryable:false}},{status:404});
 const md=['# Borderless regulatory assessment', 'Selected US federal and California topics only. Human review required. Task completion is not compliance certification.', 'Model: '+(a.modelId||'No model request'), 'Model status: '+a.modelStatus, 'Usage and latency: '+JSON.stringify(a.metrics||{}), 'Partial: '+a.partial, ...a.findings.flatMap(f=>['## '+f.topic, f.status, f.summary,'Missing facts: '+f.missingFacts.join(', '),...f.sourceIds.map(id=>{const s=getSource(id);return s?'['+s.title+']('+s.url+') — '+(s.verified?'source checked':'unverified')+' '+s.reviewedAt:'Unrecognized source';})]),'## Limitations',...a.limitations].join('\n\n');
 return new Response(md,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="borderless-assessment.md"','Cache-Control':'no-store'}});
}
