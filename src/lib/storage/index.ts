import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {ApiError} from '../http';
export interface ObjectStorage {put(key:string,bytes:Uint8Array,mimeType:string):Promise<void>;get(key:string):Promise<Buffer>;delete(key:string):Promise<void>}
export const MAX_STORED_LOGO_BYTES=2*1024*1024;
function configuration(){
 const endpoint=process.env.STORAGE_ENDPOINT,bucket=process.env.STORAGE_BUCKET,accessKeyId=process.env.STORAGE_ACCESS_KEY,secretAccessKey=process.env.STORAGE_SECRET_KEY;
 if(!endpoint||!bucket||!accessKeyId||!secretAccessKey)throw new ApiError(503,'STORAGE_CONFIG_REQUIRED','Organization logo storage is not configured.');
 let url:URL;try{url=new URL(endpoint);}catch{throw new ApiError(503,'STORAGE_CONFIG_REQUIRED','Organization logo storage is not configured.');}
 const local=process.env.NODE_ENV!=='production'&&process.env.BORDERLESS_LOCAL_STORAGE_HTTP==='true'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&local)))throw new ApiError(503,'STORAGE_CONFIG_REQUIRED','Organization logo storage requires a trusted HTTPS endpoint.');
 return {endpoint:url.toString(),bucket,accessKeyId,secretAccessKey};
}
export function createS3Storage():ObjectStorage{
 const config=configuration();
 // AXHub S3 compatibility requires both WHEN_REQUIRED checksum settings.
 const client=new S3Client({endpoint:config.endpoint,region:'auto',forcePathStyle:true,credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:2});
 const keyCheck=(key:string)=>{if(!/^organizations\/[a-zA-Z0-9_-]{1,160}\/logos\/[a-f0-9-]{36}\.webp$/.test(key))throw new Error('Invalid logo object key.');};
 return {
  async put(key,bytes,mimeType){keyCheck(key);await client.send(new PutObjectCommand({Bucket:config.bucket,Key:key,Body:bytes,ContentType:mimeType,CacheControl:'private, no-store'}),{abortSignal:AbortSignal.timeout(15000)});},
  async get(key){keyCheck(key);const result=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:key}),{abortSignal:AbortSignal.timeout(15000)});if(!result.Body)throw new Error('Logo object is unavailable.');if(result.ContentLength&&result.ContentLength>MAX_STORED_LOGO_BYTES)throw new Error('Logo object exceeds its safe size.');let count=0;const chunks:Buffer[]=[];for await(const chunk of result.Body as AsyncIterable<Uint8Array>){count+=chunk.length;if(count>MAX_STORED_LOGO_BYTES){(result.Body as {destroy?:()=>void}).destroy?.();throw new Error('Logo object exceeds its safe size.');}chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);},
  async delete(key){keyCheck(key);await client.send(new DeleteObjectCommand({Bucket:config.bucket,Key:key}),{abortSignal:AbortSignal.timeout(15000)});}
 };
}
let cached:{signature:string;storage:ObjectStorage}|undefined;
export function getObjectStorage():ObjectStorage{
 const signature=JSON.stringify([process.env.STORAGE_ENDPOINT,process.env.STORAGE_BUCKET,process.env.STORAGE_ACCESS_KEY,process.env.STORAGE_SECRET_KEY,process.env.NODE_ENV,process.env.BORDERLESS_LOCAL_STORAGE_HTTP]);
 if(cached?.signature===signature)return cached.storage;const storage=createS3Storage();cached={signature,storage};return storage;
}
