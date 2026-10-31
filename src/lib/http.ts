import { ZodError } from 'zod';
export class ApiError extends Error {constructor(public status:number,public code:string,message:string){super(message)}}
async function canonicalHandle(run:()=>Promise<unknown>):Promise<Response>{
 try {return Response.json(await run(),{headers:{'Cache-Control':'no-store'}})}
 catch(error){if(error instanceof ZodError)return Response.json({error:{code:'VALIDATION',message:'Invalid request fields.',retryable:false}},{status:400});
 if(error instanceof ApiError)return Response.json({error:{code:error.code,message:error.message,retryable:false}},{status:error.status});
 if(error instanceof Error && error.message==='Facts changed during assessment; run again')return Response.json({error:{code:'FACTS_CHANGED',message:error.message,retryable:true}},{status:409});
 if(error instanceof SyntaxError)return Response.json({error:{code:'INVALID_JSON',message:'Invalid JSON body.',retryable:false}},{status:400});
 if(error instanceof Error && /not found/i.test(error.message))return Response.json({error:{code:'NOT_FOUND',message:'Resource not found.',retryable:false}},{status:404});
 return Response.json({error:{code:'INTERNAL',message:'The request could not be completed.',retryable:true}},{status:500});}
}
export function assertMutationOrigin(request:Request){
 const origin=request.headers.get('origin');
 if(origin){
  // Next standalone can normalize request.url to its bind address. Host is the
  // HTTP authority sent by the browser; do not trust arbitrary forwarded hosts.
  let sameOrigin=false;
  try {const parsed=new URL(origin);sameOrigin=process.env.NODE_ENV==='production'
   ? Boolean(process.env.BETTER_AUTH_URL)&&parsed.origin===new URL(process.env.BETTER_AUTH_URL!).origin&&parsed.protocol==='https:'
   : ['http:','https:'].includes(parsed.protocol)&&parsed.host===(request.headers.get('host')||new URL(request.url).host);}catch{}
  if(!sameOrigin)throw new ApiError(403,'ORIGIN','Cross-origin mutation denied.');
 }
}
export async function readBody(request:Request){
 assertMutationOrigin(request);
 const length=request.headers.get('content-length');
 if(length&&/^\d+$/.test(length)&&Number(length)>64000)throw new ApiError(413,'TOO_LARGE','Request too large.');
 const reader=request.body?.getReader();if(!reader)return JSON.parse('');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>64000){await reader.cancel().catch(()=>undefined);throw new ApiError(413,'TOO_LARGE','Request too large.');}chunks.push(next.value);}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder().decode(bytes));
}

/** Localize transport errors without changing machine codes or stored content. */
export async function handle(run:()=>Promise<unknown>):Promise<Response>{
 const response=await canonicalHandle(run);if(response.ok)return response;
 try{
  const {headers}=await import('next/headers'),requestHeaders=await headers();
  if(requestHeaders.get('x-borderless-locale')!=='ko')return response;
  const body=await response.clone().json();if(!body.error?.message)return response;
  const {translateCopy}=await import('../i18n/messages');
  const original=body.error.message,translated=translateCopy('ko','errors',original);
  body.error.message=translated!==original?translated:translateCopy('ko','errors','The request could not be completed.');
  return Response.json(body,{status:response.status,headers:response.headers});
 }catch{return response;}
}
