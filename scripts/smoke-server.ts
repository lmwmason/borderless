import {spawn,execFileSync} from 'node:child_process';import {mkdtemp,readFile,chmod,rm,cp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createServer} from 'node:https';import {request} from 'node:http';
async function main(){
 const dir=await mkdtemp(join(tmpdir(),'borderless-tls-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 await chmod(join(dir,'key.pem'),0o600);
 await cp('public','.next/standalone/public',{recursive:true});await cp('.next/static','.next/standalone/.next/static',{recursive:true});
 const server=spawn(process.execPath,['.next/standalone/server.js'],{env:{...process.env,NODE_ENV:'production',PORT:'3218',HOSTNAME:'127.0.0.1',BETTER_AUTH_URL:'https://localhost:3219',NVIDIA_API_KEY:''},stdio:'inherit'});
 const proxy=createServer({key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))},(req,res)=>{
  const upstream=request({hostname:'127.0.0.1',port:3218,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode||502,response.headers);response.pipe(res);});
  upstream.on('error',()=>{res.writeHead(502);res.end('Local server starting.');});req.pipe(upstream);
 });
 await new Promise<void>(resolve=>proxy.listen(3219,'localhost',()=>resolve()));
 console.info('Local production TLS smoke ready at https://localhost:3219; inference disabled.');
 const stop=async()=>{server.kill('SIGTERM');proxy.close();await rm(dir,{recursive:true,force:true});};
 process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());server.on('exit',()=>proxy.close());
}
main().catch(()=>{console.error('Local production TLS smoke failed.');process.exitCode=1;});
