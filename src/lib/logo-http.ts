import {ApiError,assertMutationOrigin} from './http';
const MAX_FILE=2*1024*1024,MAX_REQUEST=MAX_FILE+32768;
export async function readLogoUpload(request:Request){
 assertMutationOrigin(request);
 const type=request.headers.get('content-type')||'';
 if(!/^multipart\/form-data;\s*boundary=/i.test(type))throw new ApiError(400,'LOGO_FORM_REQUIRED','Upload a PNG, JPEG or WebP file.');
 const declared=request.headers.get('content-length');if(declared&&/^\d+$/.test(declared)&&Number(declared)>MAX_REQUEST)throw new ApiError(413,'LOGO_TOO_LARGE','Logo files must be 2 MB or smaller.');
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'LOGO_FILE_REQUIRED','Choose a logo file.');
 const chunks:Uint8Array[]=[];let total=0;
 try{while(true){const next=await reader.read();if(next.done)break;total+=next.value.byteLength;if(total>MAX_REQUEST){await reader.cancel().catch(()=>{});throw new ApiError(413,'LOGO_TOO_LARGE','Logo files must be 2 MB or smaller.');}chunks.push(next.value);}}finally{reader.releaseLock();}
 const buffer=new Uint8Array(total);let at=0;for(const chunk of chunks){buffer.set(chunk,at);at+=chunk.length;}
 let form:FormData;try{form=await new Response(buffer,{headers:{'content-type':type}}).formData();}catch{throw new ApiError(400,'LOGO_FORM_INVALID','The logo upload form is invalid.');}
 const file=form.get('file');if([...form.keys()].some(key=>key!=='file')||form.getAll('file').length!==1||!(file instanceof File))throw new ApiError(400,'LOGO_FILE_REQUIRED','Choose a single logo file.');
 if(file.size>MAX_FILE)throw new ApiError(413,'LOGO_TOO_LARGE','Logo files must be 2 MB or smaller.');
 return {bytes:new Uint8Array(await file.arrayBuffer()),mimeType:file.type};
}
export function logoResponse(file:{buffer:Uint8Array;mimeType:string;metadata:{id:string}}){return new Response(new Uint8Array(file.buffer),{headers:{'Content-Type':file.mimeType,'Content-Length':String(file.buffer.length),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline','ETag':'"'+file.metadata.id+'"'}});}
