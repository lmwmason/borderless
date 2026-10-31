import test from 'node:test';
import assert from 'node:assert/strict';
import {nvidiaModel} from '../src/lib/ai/nvidia';
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
