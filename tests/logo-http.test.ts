import test from 'node:test';
import assert from 'node:assert/strict';
import {readLogoUpload,logoResponse} from '../src/lib/logo-http';
const url='https://example.test/api/organizations/demo/logo';
test('logo multipart parser accepts one bounded file and rejects duplicate, text, wrong origin and size',async()=>{
 const data=new Uint8Array([137,80,78,71]);const form=new FormData();form.set('file',new File([data],'test.png',{type:'image/png'}));
 const parsed=await readLogoUpload(new Request(url,{method:'PUT',headers:{origin:'https://example.test',host:'example.test'},body:form}));assert.deepEqual(parsed.bytes,data);assert.equal(parsed.mimeType,'image/png');
 const duplicate=new FormData();duplicate.append('file',new File([data],'a.png',{type:'image/png'}));duplicate.append('file',new File([data],'b.png',{type:'image/png'}));await assert.rejects(readLogoUpload(new Request(url,{method:'PUT',body:duplicate})),/single/);
 const text=new FormData();text.set('file','not a file');await assert.rejects(readLogoUpload(new Request(url,{method:'PUT',body:text})),/single/);
 await assert.rejects(readLogoUpload(new Request(url,{method:'PUT',headers:{origin:'https://hostile.test',host:'example.test'},body:form})),/Cross-origin/);
 await assert.rejects(readLogoUpload(new Request(url,{method:'PUT',headers:{'content-type':'multipart/form-data; boundary=a','content-length':String(3*1024*1024)},body:'x'})),/2 MB/);
});
test('logo upload stops oversized streams and images have private nosniff sandboxed headers',async()=>{
 let cancelled=false;const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(2*1024*1024+32769));},cancel(){cancelled=true;}});
 await assert.rejects(readLogoUpload(new Request(url,{method:'PUT',headers:{'content-type':'multipart/form-data; boundary=a'},body:stream,duplex:'half'} as RequestInit)),/2 MB/);assert.equal(cancelled,true);
 const response=logoResponse({buffer:new Uint8Array([1]),mimeType:'image/webp',metadata:{id:'safe-id'}});assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('content-security-policy')||'',/sandbox/);assert.equal(response.headers.get('content-type'),'image/webp');
});
