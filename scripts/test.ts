import {mkdtemp,rm,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes} from 'node:crypto';import {createServer} from 'node:net';import {spawn} from 'node:child_process';import EmbeddedPostgres from 'embedded-postgres';
async function main(){
 const dir=await mkdtemp(join(tmpdir(),'borderless-pg-tests-')),password=randomBytes(24).toString('hex');
 const port=await new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=(s.address() as {port:number}).port;s.close(()=>resolve(p));});});
 const pg=new EmbeddedPostgres({databaseDir:join(dir,'pg'),user:'test_owner',password,port,persistent:true,autoRehydrateSymlinks:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1','-c','unix_socket_directories=','-c','log_statement=none','-c','log_min_error_statement=panic'],onLog:()=>{},onError:()=>{}});
 try{
  await pg.initialise();await pg.start();
  const client=pg.getPgClient('postgres','127.0.0.1');await client.connect();
  for(const role of ['postgres_runtime','postgres_auth'])await client.query('CREATE ROLE '+role+' LOGIN PASSWORD '+"'"+password+"'"+' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
  await client.end();
  const url=(user:string)=>'postgresql://'+user+':'+password+'@127.0.0.1:'+port+'/postgres';
  Object.assign(process.env,{DIRECT_DATABASE_URL:url('test_owner'),DATABASE_URL:url('postgres_runtime'),DATABASE_URL_RUNTIME:url('postgres_runtime'),DATABASE_URL_AUTH:url('postgres_auth'),BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),BORDERLESS_ADMIN_AUTH_SECRET:randomBytes(32).toString('hex'),BORDERLESS_LOCAL_ADMIN_DEMO:'false',BETTER_AUTH_URL:'http://localhost:3000',NVIDIA_API_KEY:'',SLACK_SALES_WEBHOOK_URL:'',SLACK_SALES_DELIVERY_ENABLED:'false',NODE_ENV:'test',BORDERLESS_TRUSTED_IP_HEADER:'x-test-ip'});
  await (await import('../src/lib/db/migrate')).migrateDatabase();
  const files=[] as string[];
  for(const dir of ['tests','src/lib/legal','src/lib/workspace','src/lib/db'])for(const file of await readdir(dir))if(file.endsWith('.test.ts'))files.push(join(dir,file));
  const child=spawn(process.execPath,['--import','tsx','--test','--test-concurrency=1',...files],{stdio:'inherit',env:process.env});
  const code=await new Promise<number>(resolve=>{ child.on('exit',c=>resolve(c??1)); });process.exitCode=code;
 }finally{await pg.stop().catch(()=>{});await rm(dir,{recursive:true,force:true});}
}
main().catch(()=>{console.error('PostgreSQL test harness failed. Check local binaries and migrations.');process.exitCode=1;});
