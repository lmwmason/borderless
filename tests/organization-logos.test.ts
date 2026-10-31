import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import sharp from 'sharp';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {startLogoStorageFixture} from '../scripts/logo-storage-fixture';
import {register,registerAdmin} from './helpers';
import {organizationService} from '../src/lib/organizations';
import {createOrganizationLogoService,encodeLogo} from '../src/lib/organization-logos';
import {createS3Storage,type ObjectStorage} from '../src/lib/storage';
import {getPool,getAuthPool} from '../src/lib/db';
import {ApiError} from '../src/lib/http';
const denied=(code:string)=>(error:unknown)=>error instanceof ApiError&&error.code===code;
async function png(){return sharp({create:{width:23,height:11,channels:4,background:{r:50,g:100,b:150,alpha:0.4}}}).png().toBuffer();}
class FixtureStorage implements ObjectStorage {
 objects=new Map<string,Buffer>();failPut=false;failDelete=false;beforePut:(()=>Promise<void>)|undefined;
 async put(key:string,bytes:Uint8Array){if(this.beforePut)await this.beforePut();if(this.failPut)throw new Error('Synthetic upload failure');this.objects.set(key,Buffer.from(bytes));}
 async get(key:string){const bytes=this.objects.get(key);if(!bytes)throw new Error('Missing synthetic object');return Buffer.from(bytes);}
 async delete(key:string){if(this.failDelete)throw new Error('Synthetic deletion failure');this.objects.delete(key);}
}
test('logo decoding validates magic, rejects animations and strips metadata without resize or crop',async()=>{
 const input=await png();const output=await encodeLogo({bytes:input,mimeType:'image/png'});assert.equal(output.mimeType,'image/webp');assert.deepEqual([output.width,output.height],[23,11]);const decoded=await sharp(output.buffer).metadata();assert.equal(decoded.format,'webp');assert.equal(decoded.hasAlpha,true);assert.equal(decoded.exif,undefined);
 const jpeg=await sharp(input).jpeg().withExif({IFD0:{Artist:'Synthetic private metadata'}}).toBuffer();const clean=await encodeLogo({bytes:jpeg,mimeType:'image/jpeg'});assert.equal((await sharp(clean.buffer).metadata()).exif,undefined);
 await encodeLogo({bytes:output.buffer,mimeType:'image/webp'});
 for(const invalid of [{bytes:input,mimeType:'image/jpeg'},{bytes:Buffer.from('<svg><script>unsafe()</script></svg>'),mimeType:'image/svg+xml'},{bytes:input.subarray(0,20),mimeType:'image/png'},{bytes:Buffer.from('RIFF'+String.fromCharCode(12,0,0,0)+'WEBPANIM'+String.fromCharCode(0,0,0,0),'binary'),mimeType:'image/webp'}])await assert.rejects(encodeLogo(invalid),denied('INVALID_LOGO'));
 const apng=Buffer.concat([input.subarray(0,8),Buffer.from([0,0,0,0]),Buffer.from('acTL'),Buffer.alloc(4),input.subarray(8)]);await assert.rejects(encodeLogo({bytes:apng,mimeType:'image/png'}),denied('INVALID_LOGO'));
 const wide=await sharp({create:{width:4097,height:1,channels:3,background:'white'}}).png().toBuffer();await assert.rejects(encodeLogo({bytes:wide,mimeType:'image/png'}),denied('INVALID_LOGO'));await assert.rejects(encodeLogo({bytes:Buffer.alloc(2*1024*1024+1),mimeType:'image/png'}),denied('LOGO_TOO_LARGE'));
});
test('organization logos enforce real membership and RLS, survive service recreation and never expose object keys',async()=>{
 const owner=await register('logo-owner'),member=await register('logo-member'),viewer=await register('logo-viewer'),pending=await register('logo-pending'),stranger=await register('logo-stranger'),admin=await registerAdmin('logo-platform');
 const org=await organizationService.create(owner.user,{name:'Synthetic logo organization'}),storage=new FixtureStorage(),service=createOrganizationLogoService({storage});const db=new Pool({connectionString:process.env.DIRECT_DATABASE_URL,max:1});
 try{
  for(const [user,role] of [[member.user,'Member'],[viewer.user,'Viewer'],[pending.user,'Pending']] as const)await db.query('INSERT INTO memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)',[randomUUID(),org.id,user.id,role]);
  assert.equal(await service.getMetadataForUser(owner.user,org.id),null);
  const saved=await service.uploadLogo(owner.user,org.id,{bytes:await png(),mimeType:'image/png'});assert.equal(saved.mimeType,'image/webp');assert.deepEqual([saved.width,saved.height],[23,11]);assert.ok(!JSON.stringify(saved).includes('storage'));assert.equal(storage.objects.size,1);
  const recreated=createOrganizationLogoService({storage});assert.equal((await recreated.readLogo(member.user,org.id)).metadata.id,saved.id);assert.equal((await recreated.readLogo(viewer.user,org.id)).buffer.length,saved.bytes);assert.equal((await recreated.readLogoForAdmin(admin.user,org.id)).metadata.id,saved.id);
  assert.equal((await organizationService.account(owner.user)).organizations.find(o=>o.id===org.id)?.logo?.id,saved.id);assert.equal((await organizationService.detail(owner.user,org.id)).organization.logo?.id,saved.id);
  for(const actor of [member,viewer,pending,stranger])await assert.rejects(service.uploadLogo(actor.user,org.id,{bytes:await png(),mimeType:'image/png'}),denied('FORBIDDEN'));
  for(const actor of [pending,stranger])await assert.rejects(service.readLogo(actor.user,org.id),denied('FORBIDDEN'));
  await assert.rejects(service.readLogoForAdmin(owner.user,org.id),denied('ADMIN_REQUIRED'));
  assert.equal((await getPool().query('SELECT id FROM organization_logos WHERE organization_id=$1',[org.id])).rowCount,0);
  await assert.rejects(getAuthPool().query('SELECT * FROM organization_logos'),(error:unknown)=>(error as {code?:string}).code==='42501');
  const client=await getPool().connect();try{await client.query('BEGIN');await client.query("SELECT set_config('borderless.user_id',$1,true)",[viewer.user.id]);assert.equal((await client.query('SELECT id FROM organization_logos WHERE organization_id=$1',[org.id])).rowCount,1);assert.equal((await client.query('DELETE FROM organization_logos WHERE organization_id=$1',[org.id])).rowCount,0);assert.equal((await client.query('SELECT id FROM organization_logo_cleanup')).rowCount,0);}finally{await client.query('ROLLBACK');client.release();}
  await service.deleteLogo(owner.user,org.id);assert.equal(storage.objects.size,0);assert.equal(await service.getMetadataForUser(owner.user,org.id),null);await assert.rejects(service.readLogo(owner.user,org.id),denied('NOT_FOUND'));
 }finally{await db.end();}
});
test('concurrent replacement, membership revalidation and durable failed cleanup preserve the last committed logo',async()=>{
 const owner=await register('logo-concurrency'),uploader=await register('logo-revocation');const org=await organizationService.create(owner.user,{name:'Synthetic concurrent logo'}),storage=new FixtureStorage(),service=createOrganizationLogoService({storage}),db=new Pool({connectionString:process.env.DIRECT_DATABASE_URL,max:1});
 try{
  const image=await png(),input={bytes:image,mimeType:'image/png'};await service.uploadLogo(owner.user,org.id,input);
  const results=await Promise.all([service.uploadLogo(owner.user,org.id,input),service.uploadLogo(owner.user,org.id,input)]);const current=await service.getMetadataForUser(owner.user,org.id);assert.ok(results.some(result=>result.id===current?.id));assert.equal(storage.objects.size,1);
  const memberId=randomUUID();await db.query("INSERT INTO memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,'Admin')",[memberId,org.id,uploader.user.id]);
  storage.beforePut=async()=>{await db.query("UPDATE memberships SET role='Pending' WHERE id=$1",[memberId]);};
  await assert.rejects(service.uploadLogo(uploader.user,org.id,input),denied('FORBIDDEN'));storage.beforePut=undefined;assert.equal(storage.objects.size,1);assert.equal((await service.getMetadataForUser(owner.user,org.id))?.id,current?.id);
  // Fail metadata persistence for this synthetic organization only, then fail the compensating object delete.
  const constraint='synthetic_logo_failure_'+randomUUID().replaceAll('-','');
  await db.query('ALTER TABLE organization_logos ADD CONSTRAINT '+constraint+" CHECK (organization_id <> '"+org.id+"') NOT VALID");storage.failDelete=true;
  try{await assert.rejects(service.uploadLogo(owner.user,org.id,input),denied('LOGO_UPLOAD_FAILED'));}finally{await db.query('ALTER TABLE organization_logos DROP CONSTRAINT '+constraint);}
  assert.equal((await service.getMetadataForUser(owner.user,org.id))?.id,current?.id);assert.equal(storage.objects.size,2);const jobs=(await db.query("SELECT id FROM organization_logo_cleanup WHERE organization_id=$1 AND status='Pending' AND error_category='delete_failed'",[org.id])).rows;assert.equal(jobs.length,1);
  storage.failDelete=false;await db.query("UPDATE organization_logo_cleanup SET next_attempt_at=now() WHERE id=$1",[jobs[0].id]);const restarted=createOrganizationLogoService({storage});assert.equal((await restarted.processLogoCleanup()).deleted,1);assert.equal(storage.objects.size,1);assert.equal((await restarted.readLogo(owner.user,org.id)).metadata.id,current?.id);
  storage.failPut=true;await assert.rejects(service.uploadLogo(owner.user,org.id,input),denied('LOGO_UPLOAD_FAILED'));assert.equal((await service.getMetadataForUser(owner.user,org.id))?.id,current?.id);storage.failPut=false;
  storage.failDelete=true;await restarted.deleteLogo(owner.user,org.id);assert.equal(await restarted.getMetadataForUser(owner.user,org.id),null);assert.equal(storage.objects.size,1);storage.failDelete=false;await db.query("UPDATE organization_logo_cleanup SET next_attempt_at=now() WHERE organization_id=$1 AND status='Pending'",[org.id]);await restarted.processLogoCleanup();assert.equal(storage.objects.size,0);
 }finally{await db.end();}
});
test('S3 adapter uses actual signed HTTP requests and preserves bytes across adapter recreation (local fixture)',async()=>{
 const objects=new Map<string,Buffer>(),checks:{signed:boolean;checksumAbsent:boolean}[]=[];
 const server=createServer(async(req,res)=>{const key=(req.url??'').split('?')[0];checks.push({signed:typeof req.headers.authorization==='string'&&req.headers.authorization.startsWith('AWS4-HMAC-SHA256'),checksumAbsent:!req.headers['x-amz-checksum-crc32']});if(req.method==='PUT'){const parts:Buffer[]=[];for await(const part of req)parts.push(Buffer.from(part));objects.set(key,Buffer.concat(parts));res.end();}else if(req.method==='GET'){const data=objects.get(key);if(!data){res.statusCode=404;res.end();}else{res.setHeader('Content-Type','image/webp');res.setHeader('Content-Length',data.length);res.end(data);}}else if(req.method==='DELETE'){objects.delete(key);res.statusCode=204;res.end();}else{res.statusCode=405;res.end();}});
 await new Promise<void>(resolve=>{server.listen(0,'127.0.0.1',resolve);});const address=server.address();assert.ok(address&&typeof address!=='string');const names=['STORAGE_ENDPOINT','STORAGE_BUCKET','STORAGE_ACCESS_KEY','STORAGE_SECRET_KEY','BORDERLESS_LOCAL_STORAGE_HTTP'] as const,old=Object.fromEntries(names.map(key=>[key,process.env[key]]));
 try{
  Object.assign(process.env,{STORAGE_ENDPOINT:'http://127.0.0.1:'+address.port,STORAGE_BUCKET:'synthetic-logos',STORAGE_ACCESS_KEY:'synthetic-access',STORAGE_SECRET_KEY:'synthetic-secret-key',BORDERLESS_LOCAL_STORAGE_HTTP:'true'});
  const key='organizations/'+randomUUID()+'/logos/'+randomUUID()+'.webp',bytes=(await encodeLogo({bytes:await png(),mimeType:'image/png'})).buffer;await createS3Storage().put(key,bytes,'image/webp');assert.deepEqual(await createS3Storage().get(key),bytes);await createS3Storage().delete(key);assert.equal(objects.size,0);assert.ok(checks.every(check=>check.signed&&check.checksumAbsent));
  process.env.BORDERLESS_LOCAL_STORAGE_HTTP='false';assert.throws(()=>createS3Storage(),denied('STORAGE_CONFIG_REQUIRED'));
 }finally{for(const key of names){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}await new Promise<void>(resolve=>{server.close(()=>{resolve();});});}
});

test('production S3 adapter writes disk-backed HTTPS fixture with real SigV4 validation',async()=>{
 const fixture=await startLogoStorageFixture();
 try{
  const script="import {createS3Storage} from './src/lib/storage/index.ts';const key='organizations/synthetic-https/logos/00000000-0000-4000-8000-000000000001.webp',bytes=Buffer.from('synthetic fixture bytes');await createS3Storage().put(key,bytes,'image/webp');const actual=await createS3Storage().get(key);if(!actual.equals(bytes))process.exitCode=1;await createS3Storage().delete(key);";
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:{...process.env,...fixture.env,NODE_ENV:'production'},stdio:'ignore'});
  const code=await new Promise<number|null>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('HTTPS object fixture timed out.'));},15000);child.once('exit',value=>{clearTimeout(timer);resolve(value);});child.once('error',()=>{clearTimeout(timer);reject(new Error('HTTPS object fixture child could not start.'));});});assert.equal(code,0);assert.deepEqual(fixture.stats,{puts:1,gets:1,deletes:1,rejected:0});
 }finally{await fixture.cleanup();}
});
