/** Local QA only. A real HTTPS, disk-backed, SigV4-checked S3-compatible fixture;
 * never imported by application code or used as a production fallback. */
import {execFileSync} from 'node:child_process';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer,type ServerOptions} from 'node:https';
import type {IncomingMessage} from 'node:http';
const sha=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
const mac=(key:string|Buffer,value:string)=>createHmac('sha256',key).update(value).digest();
const encode=(value:string)=>encodeURIComponent(value).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
export async function startLogoStorageFixture(options:{directory?:string}={}){
 const temporary=!options.directory,root=options.directory??await mkdtemp(join(tmpdir(),'borderless-logo-storage-'));
 await mkdir(root,{recursive:true,mode:0o700});const objects=join(root,'objects');await mkdir(objects,{recursive:true,mode:0o700});
 const keyPath=join(root,'tls-key.pem'),caPath=join(root,'tls-ca.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',caPath,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 const accessKeyId='qa-'+randomBytes(12).toString('hex'),secretAccessKey=randomBytes(32).toString('hex'),bucket='synthetic-organization-logos';
 const stats={puts:0,gets:0,deletes:0,rejected:0};
 function authorized(req:IncomingMessage,body:Buffer){
  const authorization=req.headers.authorization??'',match=/^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/.exec(authorization);
  if(!match||match[1]!==accessKeyId)return false;
  const scope=match[2].split('/'),date=req.headers['x-amz-date'],payload=req.headers['x-amz-content-sha256'];
  if(scope.length!==4||scope[1]!=='auto'||scope[2]!=='s3'||scope[3]!=='aws4_request'||typeof date!=='string'||typeof payload!=='string')return false;
  const when=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(date);if(!when||Math.abs(Date.now()-Date.parse(when[1]+'-'+when[2]+'-'+when[3]+'T'+when[4]+':'+when[5]+':'+when[6]+'Z'))>15*60*1000||scope[0]!==date.slice(0,8))return false;
  if(payload!=='UNSIGNED-PAYLOAD'&&payload!==sha(body))return false;
  const names=match[3].split(';');if(!names.includes('host')||!names.includes('x-amz-date')||names.join(';')!==[...names].sort().join(';'))return false;
  const headers=names.map(name=>{const value=req.headers[name];return name+':'+(Array.isArray(value)?value.join(','):value??'').trim().replace(/\s+/g,' ')+'\n';}).join('');
  const url=new URL(req.url??'/','https://localhost'),query=[...url.searchParams.entries()].map(([key,value])=>[encode(key),encode(value)]).sort(([a,b],[c,d])=>a<c?-1:a>c?1:b<d?-1:b>d?1:0).map(([key,value])=>key+'='+value).join('&');
  const canonical=[req.method??'GET',url.pathname,query,headers,match[3],payload].join('\n');
  const signingKey=mac(mac(mac(mac('AWS4'+secretAccessKey,scope[0]),scope[1]),scope[2]),scope[3]);
  const signature=mac(signingKey,'AWS4-HMAC-SHA256\n'+date+'\n'+match[2]+'\n'+sha(canonical));return timingSafeEqual(signature,Buffer.from(match[4],'hex'));
 }
 const tls:ServerOptions={key:await readFile(keyPath),cert:await readFile(caPath)};
 const server=createServer(tls,(req,res)=>{void(async()=>{
  const fail=(status:number,code:string)=>{stats.rejected++;res.statusCode=status;res.setHeader('Content-Type','application/xml');res.end('<Error><Code>'+code+'</Code><Message>Local QA object request rejected.</Message></Error>');};
  const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024){fail(413,'EntityTooLarge');return;}chunks.push(Buffer.from(chunk));}const body=Buffer.concat(chunks);
  if(!authorized(req,body)){fail(403,'SignatureDoesNotMatch');return;}
  const url=new URL(req.url??'/','https://localhost'),prefix='/'+bucket+'/';if(!url.pathname.startsWith(prefix)){fail(404,'NoSuchBucket');return;}
  const key=url.pathname.slice(prefix.length);if(!/^organizations\/[a-zA-Z0-9_-]{1,160}\/logos\/[a-f0-9-]{36}\.webp$/.test(key)){fail(400,'InvalidObjectName');return;}
  const path=join(objects,sha(key)+'.webp');
  if(req.method==='PUT'){
   if(req.headers['content-type']!=='image/webp'||req.headers['x-amz-checksum-crc32']){fail(400,'InvalidRequest');return;}
   const pending=path+'.'+randomBytes(8).toString('hex')+'.pending';await writeFile(pending,body,{mode:0o600});await (await import('node:fs/promises')).rename(pending,path);stats.puts++;res.setHeader('ETag','"'+createHash('md5').update(body).digest('hex')+'"');res.end();
  }else if(req.method==='GET'){
   let data:Buffer;try{data=await readFile(path);}catch{fail(404,'NoSuchKey');return;}stats.gets++;res.setHeader('Content-Type','image/webp');res.setHeader('Content-Length',data.length);res.end(data);
  }else if(req.method==='DELETE'){await rm(path,{force:true});stats.deletes++;res.statusCode=204;res.end();}
  else if(req.method==='HEAD'){try{const info=await stat(path);res.setHeader('Content-Length',info.size);res.end();}catch{fail(404,'NoSuchKey');}}
  else fail(405,'MethodNotAllowed');
 })().catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();});});
 await new Promise<void>(resolve=>{server.listen(0,'127.0.0.1',resolve);});const address=server.address();if(!address||typeof address==='string')throw new Error('QA object fixture could not start.');
 return {root,caPath,stats,env:{STORAGE_ENDPOINT:'https://127.0.0.1:'+address.port,STORAGE_BUCKET:bucket,STORAGE_ACCESS_KEY:accessKeyId,STORAGE_SECRET_KEY:secretAccessKey,NODE_EXTRA_CA_CERTS:caPath},async cleanup(){server.closeAllConnections();await new Promise<void>(resolve=>{server.close(()=>{resolve();});});if(temporary)await rm(root,{recursive:true,force:true});}};
}
