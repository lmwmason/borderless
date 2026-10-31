import test from 'node:test';
import assert from 'node:assert/strict';
import {nvidiaModel,NVIDIA_MODEL,NVIDIA_BASE_URL} from '../src/lib/ai/nvidia';
test('NVIDIA credentials stay in server request and hostile model sources are rejected',async()=>{
 const oldKey=process.env.NVIDIA_API_KEY,oldModel=process.env.NVIDIA_MODEL,oldFetch=globalThis.fetch;
 process.env.NVIDIA_API_KEY='test-secret-never-production';process.env.NVIDIA_MODEL='test-model';
 try{
 let called=false;
 globalThis.fetch=async(input,init)=>{called=true;assert.equal(String(input),'https://integrate.api.nvidia.com/v1/chat/completions');assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-secret-never-production');return Response.json({choices:[{message:{content:JSON.stringify({sourceIds:['invented'],questions:[],childTopics:[]})}}]});};
 await assert.rejects(nvidiaModel({topic:'employment',facts:{usEmployees:1},sourceIds:['official']}),/Unrecognized/);assert.ok(called);
 globalThis.fetch=async()=>new Response('sensitive upstream payload',{status:401});
 await assert.rejects(nvidiaModel({topic:'employment',facts:{},sourceIds:[]}),e=>e instanceof Error && e.message==='NVIDIA request failed (401).');
 globalThis.fetch=async()=>{throw new DOMException('timed out','TimeoutError')};
 await assert.rejects(nvidiaModel({topic:'employment',facts:{},sourceIds:[]}));
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.NVIDIA_API_KEY;else process.env.NVIDIA_API_KEY=oldKey;if(oldModel===undefined)delete process.env.NVIDIA_MODEL;else process.env.NVIDIA_MODEL=oldModel;}
});

test('mutation origin uses HTTP Host when standalone normalizes internal request URL',async()=>{
 const {readBody}=await import('../src/lib/http');
 const body=await readBody(new Request('http://localhost:3218/api/company',{method:'PUT',headers:{host:'127.0.0.1:3218',origin:'http://127.0.0.1:3218'},body:'{}'}));
 assert.deepEqual(body,{});
 await assert.rejects(readBody(new Request('http://localhost:3218/api/company',{method:'PUT',headers:{host:'127.0.0.1:3218',origin:'https://attacker.example','x-forwarded-host':'attacker.example'},body:'{}'})),/Cross-origin/);
});

test('fixed free NVIDIA model enables thinking and records only safe usage metadata',async()=>{
 const old=globalThis.fetch,oldKey=process.env.NVIDIA_API_KEY;
 process.env.NVIDIA_API_KEY='test-secret-never-production';
 try {
 globalThis.fetch=async(url,init)=>{
  assert.equal(String(url),NVIDIA_BASE_URL+'/chat/completions');
  assert.equal(init?.redirect,'error');
  const body=JSON.parse(init?.body as string);
  assert.equal(body.model,'nvidia/nemotron-3.5-super-vl-120b-a12b');
  assert.equal(body.model,NVIDIA_MODEL);
  assert.deepEqual(body.chat_template_kwargs,{enable_thinking:true});
  assert.equal(body.extra_body,undefined);
  assert.ok(body.messages[0].content.includes('five regulatory review stages'));
  return Response.json({choices:[{finish_reason:'stop',message:{reasoning_content:'private reasoning never saved',content:JSON.stringify({sourceIds:[],questions:[],childTopics:[],review:{proposedStatus:'review_required',missingFacts:[],counterexampleFactKeys:[]}})}}],usage:{prompt_tokens:100,completion_tokens:40,total_tokens:140}});
 };
 const result=await nvidiaModel({topic:'California employment',facts:{usEmployees:1},sourceIds:[]});
 assert.equal(result.telemetry?.totalTokens,140);assert.ok((result.telemetry?.latencyMs??-1)>=0);
 assert.ok(!JSON.stringify(result).includes('private reasoning'));
 }finally{globalThis.fetch=old;if(oldKey===undefined)delete process.env.NVIDIA_API_KEY;else process.env.NVIDIA_API_KEY=oldKey;}
});
