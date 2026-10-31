import {spawn,execFileSync} from 'node:child_process';import {mkdir,writeFile,readFile,chmod,rm,mkdtemp} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createServer} from 'node:https';import {request as upstreamRequest} from 'node:http';import {request as playwrightRequest} from '@playwright/test';
async function main(){
 const image=process.env.BORDERLESS_SMOKE_IMAGE||'localhost/borderless:stabilization',name='borderless-local-smoke-'+process.pid,origin='https://localhost:3221';
 const envPath=join(process.cwd(),'.local','container-smoke.env'),tls=await mkdtemp(join(tmpdir(),'borderless-container-tls-'));
 await mkdir(join(process.cwd(),'.local'),{recursive:true,mode:0o700});
 const allowed=['DIRECT_DATABASE_URL','DATABASE_URL','DATABASE_URL_RUNTIME','DATABASE_URL_AUTH','BETTER_AUTH_SECRET'];
 for(const key of allowed)if(!process.env[key])throw new Error('Local database/auth configuration missing.');
 const newline=String.fromCharCode(10);
 await writeFile(envPath,[...allowed.map(key=>key+'='+process.env[key]),'BETTER_AUTH_URL='+origin,'PORT=3220','NVIDIA_API_KEY=',''].join(newline),{mode:0o600});await chmod(envPath,0o600);
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(tls,'key'),'-out',join(tls,'cert'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 const proxy=createServer({key:await readFile(join(tls,'key')),cert:await readFile(join(tls,'cert'))},(req,res)=>{
  const upstream=upstreamRequest({hostname:'127.0.0.1',port:3220,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode||502,response.headers);response.pipe(res)});
  upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream);
 });
 await new Promise<void>(r=>{ proxy.listen(3221,'localhost',r); });
 const api=await playwrightRequest.newContext({baseURL:origin,ignoreHTTPSErrors:true,extraHTTPHeaders:{origin}});
 let child:ReturnType<typeof spawn>|undefined;
 const podman=(args:string[])=>execFileSync('flatpak-spawn',['--host','podman',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 async function start(){
  child=spawn('flatpak-spawn',['--host','podman','run','--rm','--name',name,'--network=host','--env-file',envPath,image],{stdio:['ignore','inherit','inherit']});
  for(let i=0;i<60;i++){const response=await api.get('/api/health').catch(()=>null);if(response?.status()===200)return;await new Promise(r=>{ setTimeout(r,500); });}
  throw new Error('Container health check failed.');
 }
 async function stop(){if(child){const exited=new Promise<void>(r=>{ child!.once('exit',()=>r()); });podman(['stop','--time','10',name]);await exited;child=undefined;}}
 async function json(path:string,method='GET',body?:unknown,projectId?:string){const response=await api.fetch(path,{method,data:body,headers:projectId?{'x-project-id':projectId}:undefined});if(!response.ok())throw new Error('Container API check failed: '+response.status()+' '+path);return response.json();}
 try{
  await start();
  const privileges=JSON.parse(podman(['exec',name,'node','-e',"console.log(JSON.stringify({uid:process.getuid(),ownerURL:require('fs').readFileSync('/proc/1/environ','utf8').split(String.fromCharCode(0)).some(v=>v.startsWith('DIRECT_DATABASE_URL=')||v.startsWith('DATABASE_URL=')),runtime:Boolean(process.env.DATABASE_URL_RUNTIME),auth:Boolean(process.env.DATABASE_URL_AUTH),envFiles:require('fs').readdirSync('.').some(f=>f.startsWith('.env'))}))"]));
  if(privileges.uid===0||privileges.ownerURL||privileges.envFiles)throw new Error('Container privilege/env hardening failed.');
  const account=await json('/api/auth/sign-up/email','POST',{name:'Synthetic Container QA',email:'container-'+randomUUID()+'@example.com',password:randomUUID()+randomUUID()});
  const org=await json('/api/organizations','POST',{name:'Synthetic Container Persistence'});
  const billing=await json('/api/organizations/'+org.id+'/billing');
  await json('/api/organizations/'+org.id+'/billing/terms','POST',{termsVersion:billing.termsVersion,accepted:true});
  await json('/api/organizations/'+org.id+'/billing/activate-free','POST',{});
  const project=await json('/api/organizations/'+org.id+'/projects','POST',{name:'Container restart verification'});
  const company={id:randomUUID(),name:'Synthetic restart data',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()};
  await json('/api/company','PUT',company,project.id);
  const before=await json('/api/workspace','GET',undefined,project.id);
  const task=await json('/api/tasks','POST',{title:'Preserve container QA task'},project.id);
  const doc=await json('/api/documents','POST',{title:'Preserve document',content:'Synthetic container restart proof'},project.id);
  await stop();await start();
  const after=await json('/api/workspace','GET',undefined,project.id),docs=await json('/api/documents','GET',undefined,project.id);
  const report={image,health:true,nonRoot:privileges.uid!==0,ownerCredentialsRemoved:!privileges.ownerURL,noEnvFiles:!privileges.envFiles,sessionSurvivedRestart:Boolean(account.user),companyPersisted:after.company?.id===company.id,scenarioPersisted:after.scenarios[0]?.id===before.scenarios[0]?.id,taskPersisted:after.tasks.some((t:{id:string})=>t.id===task.id),documentPersisted:docs.documents.some((d:{id:string})=>d.id===doc.id)};
  if(Object.values(report).some(v=>v===false))throw new Error('Container persistence assertion failed.');
  await writeFile('/tmp/borderless-container-smoke.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
 }finally{await stop().catch(()=>{});await api.dispose();proxy.close();await rm(envPath,{force:true});await rm(tls,{recursive:true,force:true});}
}
main().catch(error=>{console.error('Container smoke failed: '+(error instanceof Error?error.message:'unknown error'));process.exitCode=1;});
