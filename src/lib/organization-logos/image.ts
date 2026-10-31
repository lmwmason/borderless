import sharp from 'sharp';
import {ApiError} from '../http';
export const LOGO_MAX_BYTES=2*1024*1024,LOGO_MAX_DIMENSION=4096,LOGO_MAX_PIXELS=16*1024*1024;
const invalid=()=>new ApiError(400,'INVALID_LOGO','Upload a valid, non-animated PNG, JPEG or WebP image.');
function magic(data:Buffer):'image/png'|'image/jpeg'|'image/webp'|null{
 if(data.length>=8&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)return 'image/jpeg';
 if(data.length>=12&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')return 'image/webp';return null;
}
function animated(data:Buffer,mime:string){
 if(mime==='image/png'){let offset=8;while(offset+12<=data.length){const length=data.readUInt32BE(offset),kind=data.toString('ascii',offset+4,offset+8);if(length>data.length-offset-12)throw invalid();if(kind==='acTL'||kind==='fcTL'||kind==='fdAT')return true;offset+=length+12;if(kind==='IEND')break;}}
 if(mime==='image/webp'){let offset=12;while(offset+8<=data.length){const length=data.readUInt32LE(offset+4),kind=data.toString('ascii',offset,offset+4);if(length>data.length-offset-8)throw invalid();if(kind==='ANIM'||kind==='ANMF'||(kind==='VP8X'&&length>0&&(data[offset+8]&2)!==0))return true;offset+=8+length+(length%2);}}
 return false;
}
export async function encodeLogo(input:{bytes:Uint8Array;mimeType:string}){
 if(!input.bytes?.length)throw invalid();
 if(input.bytes.length>LOGO_MAX_BYTES)throw new ApiError(413,'LOGO_TOO_LARGE','Organization logos must be no larger than 2 MiB.');
 const bytes=Buffer.from(input.bytes),mime=magic(bytes);
 if(!mime||mime!==input.mimeType||animated(bytes,mime))throw invalid();
 try{
  const image=sharp(bytes,{limitInputPixels:LOGO_MAX_PIXELS,failOn:'warning',animated:false});const metadata=await image.metadata();
  if(!metadata.width||!metadata.height||metadata.width>LOGO_MAX_DIMENSION||metadata.height>LOGO_MAX_DIMENSION||(metadata.pages??1)>1)throw invalid();
  const result=await image.rotate().webp({lossless:true,effort:4}).toBuffer({resolveWithObject:true});
  if(result.data.length>LOGO_MAX_BYTES)throw new ApiError(413,'LOGO_TOO_LARGE','The safely encoded organization logo exceeds 2 MiB.');
  return {buffer:result.data,mimeType:'image/webp' as const,bytes:result.data.length,width:result.info.width,height:result.info.height};
 }catch(error){if(error instanceof ApiError)throw error;throw invalid();}
}
