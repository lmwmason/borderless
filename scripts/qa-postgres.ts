import {startLogoStorageFixture} from './logo-storage-fixture';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes,randomUUID} from 'node:crypto';import {createServer} from 'node:net';import EmbeddedPostgres from 'embedded-postgres';
export async function prepareBrowserDatabase(){
 const dir=await mkdtemp(join(tmpdir(),'borderless-browser-pg-')),password=randomBytes(32).toString('hex');
 const port=await new Promise<number>(resolve=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const p=(server.address() as {port:number}).port;server.close(()=>resolve(p));});});
 const pg=new EmbeddedPostgres({databaseDir:join(dir,'pg'),user:'qa_owner',password,port,persistent:true,autoRehydrateSymlinks:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1','-c','unix_socket_directories=','-c','log_statement=none','-c','log_min_error_statement=panic'],onLog:()=>{},onError:()=>{}});
 await pg.initialise();await pg.start();
 const client=pg.getPgClient('postgres','127.0.0.1');await client.connect();
 for(const role of ['postgres_runtime','postgres_auth'])await client.query('CREATE ROLE '+role+' LOGIN PASSWORD '+"'"+password+"'"+' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
 await client.end();
 const url=(user:string)=>'postgresql://'+user+':'+password+'@127.0.0.1:'+port+'/postgres';
 Object.assign(process.env,{DIRECT_DATABASE_URL:url('qa_owner'),DATABASE_URL:url('postgres_runtime'),DATABASE_URL_RUNTIME:url('postgres_runtime'),DATABASE_URL_AUTH:url('postgres_auth'),BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),BORDERLESS_ADMIN_AUTH_SECRET:randomBytes(32).toString('hex'),BORDERLESS_LOCAL_ADMIN_DEMO:'false',BETTER_AUTH_URL:'https://localhost:3219',NVIDIA_API_KEY:'',GROBLE_STARTUP_PAYMENT_URL:'',GROBLE_BUSINESS_PAYMENT_URL:'',BORDERLESS_TRUSTED_IP_HEADER:'x-test-ip'});
 const storageFixture=await startLogoStorageFixture();Object.assign(process.env,storageFixture.env);
 await (await import('../src/lib/db/migrate')).migrateDatabase();
 const reviewerEmail='qa-reviewer-'+randomUUID()+'@example.com',reviewerPassword=randomBytes(32).toString('base64url');
 const response=await (await import('../src/lib/auth')).getAuth().handler(new Request('https://localhost:3219/api/auth/sign-up/email',{method:'POST',headers:{origin:'https://localhost:3219','Content-Type':'application/json','x-test-ip':'198.18.0.1'},body:JSON.stringify({name:'Synthetic isolated QA reviewer',email:reviewerEmail,password:reviewerPassword})}));
 if(!response.ok)throw new Error('QA reviewer setup failed.');
 const data=await response.json();process.env.BORDERLESS_EXPERT_REVIEWER_IDS=data.user.id;process.env.BORDERLESS_PLATFORM_ADMIN_IDS='';
 const adminLogin='qa-operator-'+randomUUID(),adminPassword=randomBytes(32).toString('base64url')+'!aA9';
 await (await import('../src/lib/admin/auth')).provisionAdmin({loginId:adminLogin,password:adminPassword,name:'Synthetic isolated QA administrator',demo:false});
 await writeFile('/tmp/borderless-qa-fixture.json',JSON.stringify({reviewerEmail,reviewerPassword,adminLogin,adminPassword}),{mode:0o600});
 console.info('Isolated browser PostgreSQL ready; synthetic reviewer fixture is private and never production data.');
 return async()=>{await storageFixture.cleanup();await (await import('../src/lib/db')).closePools();await pg.stop();await rm(dir,{recursive:true,force:true});await rm('/tmp/borderless-qa-fixture.json',{force:true});};
}
