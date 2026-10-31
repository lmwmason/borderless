import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

type Pools={runtime?:{url:string;pool:Pool};auth?:{url:string;pool:Pool}};
const globalDb=globalThis as typeof globalThis & {__borderlessPools?:Pools};
function poolFor(kind:'runtime'|'auth'):Pool{
 if(process.env.NODE_ENV==='production'&&!process.env[kind==='auth'?'DATABASE_URL_AUTH':'DATABASE_URL_RUNTIME'])throw new Error('Production requires separate runtime and auth database roles.');
 const url=(kind==='auth'?process.env.DATABASE_URL_AUTH:process.env.DATABASE_URL_RUNTIME)||process.env.DATABASE_URL;
 if(!url)throw new Error(kind==='auth'?'DATABASE_URL_AUTH is required.':'DATABASE_URL_RUNTIME is required.');
 const pools=globalDb.__borderlessPools??= {};
 const existing=pools[kind];
 if(existing?.url===url)return existing.pool;
 if(existing)void existing.pool.end();
 const pool=new Pool({connectionString:url,max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:10000,application_name:'borderless-'+kind});
 // Do not log connection URLs, credentials, queries, or driver error messages.
 pool.on('error',()=>console.error('Database idle connection failed.'));
 pools[kind]={url,pool};
 return pool;
}
export function getPool():Pool{return poolFor('runtime');}
export function getAuthPool():Pool{return poolFor('auth');}
export function getDb(){return drizzle(getPool(),{schema});}
export async function closePools(){const pools=globalDb.__borderlessPools;delete globalDb.__borderlessPools;await Promise.all(Object.values(pools??{}).map(value=>value.pool.end()));}
export {schema};
