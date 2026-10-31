import test,{after} from 'node:test';import assert from 'node:assert/strict';import {getPool,getAuthPool,closePools} from '../src/lib/db';
test('production refuses missing restricted role URLs rather than using the owner connection',()=>{
 const old={NODE_ENV:process.env.NODE_ENV,DATABASE_URL_RUNTIME:process.env.DATABASE_URL_RUNTIME,DATABASE_URL_AUTH:process.env.DATABASE_URL_AUTH};
 try{Object.assign(process.env,{NODE_ENV:'production'});delete process.env.DATABASE_URL_RUNTIME;delete process.env.DATABASE_URL_AUTH;assert.throws(()=>getPool(),/separate runtime and auth/);assert.throws(()=>getAuthPool(),/separate runtime and auth/);}
 finally{for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

after(()=>closePools());
test('runtime cannot rewrite audit records or versioned contract acceptance',async()=>{
 for(const table of ['audit_logs','contract_acceptances']){
  await assert.rejects(getPool().query('DELETE FROM '+table+' WHERE false'),(e:unknown)=>(e as {code:string}).code==='42501');
  await assert.rejects(getPool().query('UPDATE '+table+' SET id=id WHERE false'),(e:unknown)=>(e as {code:string}).code==='42501');
 }
});
