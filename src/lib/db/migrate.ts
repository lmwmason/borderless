import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/** Owner/direct connection only. Runtime/auth credentials cannot mutate schemas. */
export async function migrateDatabase():Promise<void>{
 if(process.env.NODE_ENV==='production'&&!process.env.DIRECT_DATABASE_URL)throw new Error('Production migrations require DIRECT_DATABASE_URL.');
 const connectionString=process.env.DIRECT_DATABASE_URL||process.env.DATABASE_URL;
 if(!connectionString)throw new Error('DIRECT_DATABASE_URL is required for database migrations.');
 const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:10000,application_name:'borderless-migrate'});
 let client:PoolClient|undefined;
 try{
  client=await pool.connect();
  // SQL session settings also work through the documented direct session pool;
  // do not rely on proxy support for nonstandard startup parameters.
  await client.query("SET statement_timeout = '60s'; SET lock_timeout = '15s'");
  // Serialize release/startup migrators without changing application data.
  await client.query("SELECT pg_advisory_lock(hashtext('borderless_schema_migration'))");
  await migrate(drizzle(client),{migrationsFolder:path.join(process.cwd(),'drizzle')});
 }finally{
  if(client){await client.query("SELECT pg_advisory_unlock(hashtext('borderless_schema_migration'))").catch(()=>{});client.release();}
  await pool.end();
 }
}
