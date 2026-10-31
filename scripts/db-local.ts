import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import EmbeddedPostgres from 'embedded-postgres';

const PORT=55439,HOST='127.0.0.1',DATABASE='borderless_local';
const root=process.cwd(),envPath=path.join(root,'.env.local'),databaseDir=path.join(root,'.local','postgres');
const exists=async(file:string)=>access(file).then(()=>true,()=>false);
const token=()=>randomBytes(32).toString('base64url');
function localUrl(user:string,password:string,db=DATABASE){return 'postgresql://'+encodeURIComponent(user)+':'+encodeURIComponent(password)+'@'+HOST+':'+PORT+'/'+db;}
function identifier(value:string){return '"'+value.replaceAll('"','""')+'"';}
function literal(value:string){return "'"+value.replaceAll("'","''")+"'";}
function validateLocal(value:string){
 const parsed=new URL(value);
 if(parsed.hostname!==HOST||parsed.port!==String(PORT)||parsed.pathname!=='/'+DATABASE)throw new Error('Refusing to replace a non-local database configuration.');
 return parsed;
}
async function main(){
 process.umask(0o077);
 if(process.env.NODE_ENV==='production')throw new Error('The embedded database is for local development only.');
 const old=await readFile(envPath,'utf8').catch(()=>'');
 const env={...parseEnv(old)};
 for(const key of ['DATABASE_URL','DATABASE_URL_RUNTIME','DATABASE_URL_AUTH','DIRECT_DATABASE_URL']){
  if(process.env[key]&&!env[key])env[key]=process.env[key]!;
  if(env[key])validateLocal(env[key]);
 }
 const adminPassword=env.BORDERLESS_LOCAL_POSTGRES_PASSWORD||token();
 const runtimePassword=env.DATABASE_URL_RUNTIME?decodeURIComponent(new URL(env.DATABASE_URL_RUNTIME).password):token();
 const authPassword=env.DATABASE_URL_AUTH?decodeURIComponent(new URL(env.DATABASE_URL_AUTH).password):token();
 const runtimeRole=DATABASE+'_runtime',authRole=DATABASE+'_auth';
 const next:Record<string,string>={
  BORDERLESS_LOCAL_POSTGRES_PASSWORD:adminPassword,
  DIRECT_DATABASE_URL:localUrl('borderless_admin',adminPassword),
  DATABASE_URL_RUNTIME:localUrl(runtimeRole,runtimePassword),DATABASE_URL_AUTH:localUrl(authRole,authPassword),
  DATABASE_URL:localUrl(runtimeRole,runtimePassword),
  BETTER_AUTH_SECRET:env.BETTER_AUTH_SECRET||process.env.BETTER_AUTH_SECRET||token(),
  BETTER_AUTH_URL:env.BETTER_AUTH_URL||process.env.BETTER_AUTH_URL||'http://localhost:3000'
 };
 // Preserve NVIDIA and other existing entries byte-for-byte. Only our missing
 // local settings are appended; existing values are never silently replaced.
 const missing=Object.entries(next).filter(([key])=>!parseEnv(old)[key]);
 const newline=String.fromCharCode(10);
 await writeFile(envPath,old+(old&&!old.endsWith(newline)?newline:'')+missing.map(([key,value])=>key+'='+value).join(newline)+newline,{mode:0o600});
 await chmod(envPath,0o600);
 const postgres=new EmbeddedPostgres({
  databaseDir,user:'borderless_admin',password:adminPassword,port:PORT,persistent:true,
  authMethod:'scram-sha-256',autoRehydrateSymlinks:true,
  postgresFlags:['-h',HOST,'-c','unix_socket_directories=','-c','log_statement=none','-c','log_min_error_statement=panic'],
  onLog:()=>{},onError:()=>{}
 });
 await mkdir(path.dirname(databaseDir),{recursive:true,mode:0o700});
 if(!await exists(path.join(databaseDir,'PG_VERSION')))await postgres.initialise();
 const probe=new Client({host:HOST,port:PORT,database:'postgres',user:'borderless_admin',password:adminPassword,connectionTimeoutMillis:1000});
 let running=false;
 try{await probe.connect();running=true;}catch{}finally{await probe.end().catch(()=>{});}
 if(!running)await postgres.start();
 const admin=new Client({host:HOST,port:PORT,database:'postgres',user:'borderless_admin',password:adminPassword});
 await admin.connect();
 try{
  for(const [role,password] of [[runtimeRole,runtimePassword],[authRole,authPassword]]){
   if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)
    await admin.query('CREATE ROLE '+identifier(role)+' LOGIN PASSWORD '+literal(password)+' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
  }
  if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[DATABASE])).rowCount)
   await admin.query('CREATE DATABASE '+identifier(DATABASE));
 }finally{await admin.end();}
 console.info('Local PostgreSQL ready on 127.0.0.1:55439. Credentials remain in ignored .env.local.');
 console.info('Runtime and auth roles are restricted. Run db:migrate using the direct owner URL.');
 if(running)return;
 console.info('Keep this process running; Ctrl+C stops the database while preserving its data.');
 await new Promise<void>(resolve=>{
  const stop=async()=>{await postgres.stop();resolve();};
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
 });
}
main().catch(error=>{
 // Passwords/URLs are never printed. Known configuration errors are safe text.
 const message=error instanceof Error&&/^(Refusing|The embedded database)/.test(error.message)?error.message:'Local PostgreSQL failed to start. Check the port, package binaries and local directory permissions.';
 console.error(message);process.exitCode=1;
});
