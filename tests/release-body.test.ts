import test from 'node:test';import assert from 'node:assert/strict';import {readBody,ApiError} from '../src/lib/http';
test('oversized streaming mutations stop reading and cancel before buffering entire body',async()=>{
 let cancelled=false,reads=0;
 const stream=new ReadableStream<Uint8Array>({pull(controller){reads++;controller.enqueue(new Uint8Array(33000));},cancel(){cancelled=true;}},{highWaterMark:0});
 const request=new Request('http://localhost/api/tasks',{method:'POST',body:stream,duplex:'half'} as RequestInit);
 await assert.rejects(readBody(request),e=>e instanceof ApiError&&e.status===413);assert.equal(cancelled,true);assert.equal(reads,2);
});
test('declared oversized requests reject before consuming content and UTF-8 JSON still works',async()=>{
 let read=false;const stream=new ReadableStream<Uint8Array>({pull(){read=true;}},{highWaterMark:0});
 await assert.rejects(readBody(new Request('http://localhost/api/tasks',{method:'POST',headers:{'content-length':'999999'},body:stream,duplex:'half'} as RequestInit)),e=>e instanceof ApiError&&e.status===413);assert.equal(read,false);
 assert.deepEqual(await readBody(new Request('http://localhost/api/tasks',{method:'POST',body:JSON.stringify({title:'검토 업무'})})),{title:'검토 업무'});
});
