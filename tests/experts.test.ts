import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {expertService,withExpertActor,type ProfileInput} from '../src/lib/experts';
import {ApiError} from '../src/lib/http';
import {getPool,getAuthPool} from '../src/lib/db';
import {migrateDatabase} from '../src/lib/db/migrate';
import {register} from './helpers';

test('expert profile privacy, real catalogue, human review and expert-owned prices',async t=>{
 const owner=new Pool({connectionString:process.env.DIRECT_DATABASE_URL,max:1});
 const marker=randomUUID();
 const expert=(await register('synthetic-expert')).user,stranger=(await register('synthetic-stranger')).user,reviewer=(await register('synthetic-reviewer')).user;
 const oldReviewers=process.env.BORDERLESS_EXPERT_REVIEWER_IDS;
 const fields:ProfileInput={visibility:'public',displayName:'Synthetic expert '+marker,photoUrl:'https://example.invalid/photo.png',bio:'Synthetic biography for tests only',specialties:['Test-'+marker],regions:['California'],credentialType:'Attorney self-reported',licenseIssuer:'Synthetic issuer, not a real credential',licenseJurisdiction:'California',licenseNumber:'PRIVATE-LICENSE-'+marker,licenseNumberPublic:false,education:'Synthetic education',experience:'Synthetic experience',affiliation:'Synthetic affiliation',languages:['English','Korean'],available:true,portfolio:[{title:'Public portfolio',url:'https://example.invalid/public',visibility:'public'},{title:'PRIVATE PORTFOLIO',url:'https://example.invalid/private',visibility:'private'}],resume:{text:'PRIVATE RESUME',url:'https://example.invalid/private-resume',visibility:'private'}};
 let profileId='',serviceId='',seededOrg='';
 const denied=(code:string)=>(error:unknown)=>error instanceof ApiError&&error.code===code;
 try{
  await t.test('profile begins Draft/private, ownership is enforced and cannot self-assert verification',async()=>{
   const saved=await expertService.saveProfile(expert,{...fields,visibility:'private'});profileId=saved.id;
   assert.equal(saved.status,'Draft');assert.equal(saved.userId,expert.id);
   assert.equal((await expertService.me(expert)).profile!.licenseNumber,fields.licenseNumber);
   assert.equal((await expertService.me(stranger)).profile,null);
   await withExpertActor(stranger,async client=>{assert.equal((await client.query('SELECT id FROM expert_profiles WHERE id=$1',[profileId])).rowCount,0);});
   await assert.rejects(expertService.saveProfile(expert,{...fields,status:'Verified'} as ProfileInput));
   await assert.rejects(expertService.saveProfile(expert,{...fields,photoUrl:'javascript:alert(1)'}));
   await assert.rejects(expertService.detail(stranger,profileId),denied('NOT_FOUND'));
   await expertService.submit(expert);
   await assert.rejects(expertService.detail(stranger,profileId),denied('NOT_FOUND'));
  });
  await t.test('offering prices are validated expert inputs, not generated amounts',async()=>{
   const service=await expertService.saveService(expert,{title:'Synthetic offering '+marker,scope:'Review one specified document',serviceType:'Document Review',pricingType:'fixed',priceMinor:25000,currency:'USD',published:true});serviceId=service.id;
   assert.equal(service.priceMinor,25000);
   await expertService.saveService(expert,{title:'Unpublished private offering',scope:'Private draft scope',serviceType:'Custom Engagement',pricingType:'quote',priceMinor:null,currency:'KRW',published:false});
   await assert.rejects(expertService.saveService(expert,{title:'Invalid',scope:'Invalid amount',serviceType:'Document Review',pricingType:'fixed',priceMinor:12.5,currency:'USD'}));
   await assert.rejects(expertService.saveService(expert,{title:'Invalid quote',scope:'Invalid quote amount',serviceType:'Custom Engagement',pricingType:'quote',priceMinor:1,currency:'USD'}));
   await assert.rejects(expertService.saveService(expert,{title:'Missing amount',scope:'Missing',serviceType:'Initial Consultation',pricingType:'hourly',priceMinor:null,currency:'USD'}));
   await assert.rejects(expertService.saveService(stranger,{id:serviceId,title:'Stolen',scope:'Stolen',serviceType:'Document Review',pricingType:'fixed',priceMinor:1,currency:'USD',published:true}),denied('NOT_FOUND'));
   await assert.rejects(expertService.deleteService(stranger,serviceId),denied('NOT_FOUND'));
   assert.equal((await expertService.search(stranger,{specialty:'Test-'+marker})).experts.length,0);
  });
  await t.test('submission is Pending Verification, public visibility is explicit and private fields stay private',async()=>{
   await expertService.saveProfile(expert,fields);
   const submitted=await expertService.submit(expert);assert.equal(submitted.status,'Pending Verification');
   const visible=await expertService.detail(stranger,profileId);
   assert.equal(visible.status,'Pending Verification');assert.ok(!('userId' in visible));assert.ok(!('verification' in visible));assert.ok(!('licenseNumber' in visible));
   assert.equal(visible.resume.text,'');assert.equal(visible.resume.url,'');assert.equal(visible.portfolio.length,1);assert.equal(visible.portfolio[0].title,'Public portfolio');
   assert.equal(visible.services.length,1);assert.equal(visible.services[0].id,serviceId);
   assert.ok(!JSON.stringify(visible).includes('PRIVATE'));
   await withExpertActor(stranger,async client=>{
    assert.equal((await client.query('SELECT id FROM expert_profiles WHERE id=$1',[profileId])).rowCount,0);
    assert.equal((await client.query('SELECT id FROM expert_services WHERE expert_id=$1',[profileId])).rowCount,0);
    const payload=(await client.query('SELECT payload FROM expert_directory WHERE id=$1',[profileId])).rows[0].payload;
    assert.ok(!('userId' in payload));assert.ok(!JSON.stringify(payload).includes('PRIVATE'));
   });
  });
  await t.test('directory filters query only public records and published offerings with matching currency',async()=>{
   const found=await expertService.search(stranger,{specialty:'Test-'+marker,credentialType:'Attorney self-reported',jurisdiction:'california',language:'korean',currency:'USD',minPriceMinor:24000,maxPriceMinor:26000,serviceType:'Document Review',status:'Pending Verification',q:marker});
   assert.deepEqual(found.experts.map(p=>p.id),[profileId]);
   assert.equal((await expertService.search(stranger,{specialty:'Test-'+marker,currency:'KRW',minPriceMinor:0})).experts.length,0);
   assert.equal((await expertService.search(stranger,{specialty:'Test-'+marker,status:'Verified'})).experts.length,0);
   assert.equal((await expertService.search(stranger,{specialty:'Test-'+marker,q:'does-not-exist-'+marker})).experts.length,0);
   await assert.rejects(expertService.search(stranger,{minPriceMinor:1}));
   await assert.rejects(expertService.search(stranger,{currency:'USD',minPriceMinor:100,maxPriceMinor:1}));
  });
  await t.test('verification needs configured human reviewer, evidence and attestation; no self verification',async()=>{
   const review={decision:'Verified' as const,notes:'Synthetic human review for tests only',evidenceRefs:['Synthetic evidence, no actual credential claim'],attested:true as const};
   delete process.env.BORDERLESS_EXPERT_REVIEWER_IDS;
   await assert.rejects(expertService.review(reviewer,profileId,review),denied('REVIEWER_REQUIRED'));
   process.env.BORDERLESS_EXPERT_REVIEWER_IDS=expert.id+','+reviewer.id;
   await assert.rejects(expertService.review(expert,profileId,review),denied('SELF_REVIEW'));
   await assert.rejects(expertService.review(reviewer,profileId,{...review,evidenceRefs:[]}));
   await assert.rejects(expertService.review(reviewer,profileId,{...review,attested:false} as unknown as typeof review));
   const verified=await expertService.review(reviewer,profileId,review);assert.equal(verified.status,'Verified');
   assert.equal((await expertService.detail(stranger,profileId)).status,'Verified');
   const unchanged=await expertService.saveProfile(expert,fields);assert.equal(unchanged.status,'Verified');assert.deepEqual(unchanged.verification,verified.verification);
   await withExpertActor(expert,async client=>{await assert.rejects(client.query("UPDATE expert_profiles SET status='Verified' WHERE id=$1",[profileId]),(error:unknown)=>(error as {code?:string}).code==='42501');});
  });
  await t.test('material edit resets verification, opt-in license publication requires resubmission and rejection hides listing',async()=>{
   const edited=await expertService.saveProfile(expert,{...fields,bio:'Changed synthetic biography',licenseNumberPublic:true});assert.equal(edited.status,'Draft');assert.equal(edited.verification,undefined);
   await assert.rejects(expertService.detail(stranger,profileId),denied('NOT_FOUND'));
   await expertService.submit(expert);
   const publicLicense=await expertService.detail(stranger,profileId);assert.equal(publicLicense.licenseNumber,fields.licenseNumber);assert.equal(publicLicense.status,'Pending Verification');
   const rejected=await expertService.review(reviewer,profileId,{decision:'Rejected',notes:'Synthetic rejection, not a credential judgment',evidenceRefs:['Synthetic review evidence'],attested:true});assert.equal(rejected.status,'Rejected');
   assert.equal((await expertService.search(stranger,{specialty:'Test-'+marker})).experts.length,0);
   await assert.rejects(expertService.detail(stranger,profileId),denied('NOT_FOUND'));
   await migrateDatabase();await migrateDatabase();
   assert.equal((await expertService.me(expert)).profile!.status,'Rejected');assert.equal((await expertService.me(expert)).services.length,2);
  });
  await t.test('new expert and engagement rows survive repeated migrations and reviewer access stays target-bound',async()=>{
   seededOrg='expert-db-'+marker;const project=seededOrg+'-project',first=seededOrg+'-first',second=seededOrg+'-second';
   await owner.query('INSERT INTO organizations(id,name) VALUES($1,$1)',[seededOrg]);
   await owner.query('INSERT INTO organization_workspaces(id,organization_id) VALUES($1,$2)',[seededOrg+'-workspace',seededOrg]);
   await owner.query('INSERT INTO projects(id,organization_id,workspace_id,name) VALUES($1,$2,$3,$1)',[project,seededOrg,seededOrg+'-workspace']);
   await owner.query("INSERT INTO memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,'Owner')",[seededOrg+'-member',seededOrg,stranger.id]);
   for(const id of [first,second])await owner.query("INSERT INTO engagements(id,organization_id,project_id,expert_id,expert_user_id,created_by,status,payload) VALUES($1,$2,$3,$4,$5,$6,'Draft',$7)",[id,seededOrg,project,profileId,expert.id,stranger.id,{id,synthetic:true}]);
   await owner.query("INSERT INTO engagement_resources(id,engagement_id,organization_id,project_id,resource_kind,resource_id,payload) VALUES($1,$2,$3,$4,'document','synthetic-resource',$5)",[first+'-resource',first,seededOrg,project,{synthetic:true,private:'Do not expose'}]);
   await owner.query("INSERT INTO engagement_entries(id,engagement_id,organization_id,project_id,author_id,kind,payload) VALUES($1,$2,$3,$4,$5,'message',$6)",[first+'-entry',first,seededOrg,project,stranger.id,{synthetic:true,body:'Synthetic entry'}]);
   await owner.query("INSERT INTO engagement_events(id,engagement_id,organization_id,project_id,actor_id,action,payload) VALUES($1,$2,$3,$4,$5,'engagement.created',$6)",[first+'-event',first,seededOrg,project,stranger.id,{from:null,to:'Draft'}]);
   const checksums=async()=>{
    const result:Record<string,unknown>={};
    for(const table of ['expert_profiles','expert_services','engagements','engagement_resources','engagement_entries','engagement_events']){
     const filter=table==='expert_profiles'?'id=$1':table==='expert_services'?'expert_id=$1':'organization_id=$1';
     result[table]=(await owner.query(`SELECT count(*)::int count,md5(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text) checksum FROM ${table} t WHERE ${filter}`,[table.startsWith('expert_')?profileId:seededOrg])).rows[0];
    }
    return result;
   };
   const before=await checksums();await migrateDatabase();await Promise.all([migrateDatabase(),migrateDatabase()]);assert.deepEqual(await checksums(),before);
   process.env.BORDERLESS_EXPERT_REVIEWER_IDS=reviewer.id;
   await withExpertActor(reviewer,async client=>{assert.equal((await client.query('SELECT id FROM engagements WHERE organization_id=$1',[seededOrg])).rowCount,0);});
   await withExpertActor(reviewer,async client=>{
    assert.deepEqual((await client.query('SELECT id FROM engagements WHERE organization_id=$1',[seededOrg])).rows,[{id:first}]);
    assert.equal((await client.query('SELECT id FROM engagement_resources WHERE organization_id=$1',[seededOrg])).rowCount,0);
    assert.equal((await client.query('UPDATE engagements SET updated_at=updated_at WHERE id=$1',[second])).rowCount,0);
   },{reviewer:true,engagementId:first});
   await withExpertActor(expert,async client=>{
    assert.equal((await client.query('SELECT id FROM engagements WHERE organization_id=$1',[seededOrg])).rowCount,0);
    assert.equal((await client.query('SELECT id FROM engagement_resources WHERE organization_id=$1',[seededOrg])).rowCount,0);
   });
  });
  await t.test('expert raw metadata and shared snapshots disappear on cancellation, expiry or revocation',async()=>{
   await expertService.saveProfile(expert,{...fields,visibility:'private'});await expertService.submit(expert);
   await expertService.review(reviewer,profileId,{decision:'Verified',notes:'Synthetic private review for RLS tests',evidenceRefs:['Synthetic only'],attested:true});
   const id=seededOrg+'-first';
   const reset=async()=>{await owner.query("UPDATE engagements SET status='Active',revoked_at=NULL,access_expires_at=now()+interval '1 hour',payload=$1 WHERE id=$2",[{synthetic:true,contractStatus:'Confirmed',companyAgreed:true,expertAgreed:true,conflictStatus:'Cleared'},id]);};
   await reset();
   await withExpertActor(expert,async client=>{
    assert.equal((await client.query('SELECT id FROM engagements WHERE id=$1',[id])).rowCount,1);
    assert.equal((await client.query('SELECT id FROM engagement_resources WHERE engagement_id=$1',[id])).rowCount,1);
   });
   for(const state of ['revoked','expired','canceled']){
    await reset();
    const update=state==='revoked'?"revoked_at=now()":state==='expired'?"access_expires_at=now()-interval '1 second'":"status='Canceled'";
    await owner.query('UPDATE engagements SET '+update+' WHERE id=$1',[id]);
    await withExpertActor(expert,async client=>{
     assert.equal((await client.query('SELECT id FROM engagements WHERE id=$1',[id])).rowCount,0,state+' expert metadata');
     assert.equal((await client.query('SELECT id FROM engagement_resources WHERE engagement_id=$1',[id])).rowCount,0,state+' expert snapshots');
     assert.equal((await client.query('SELECT public.cancel_assigned_engagement($1) canceled',[id])).rows[0].canceled,false);
    });
    await withExpertActor(stranger,async client=>{assert.equal((await client.query('SELECT id FROM engagements WHERE id=$1',[id])).rowCount,1);});
   }
   await reset();
   assert.equal((await getPool().query('SELECT public.cancel_assigned_engagement($1) canceled',[id])).rows[0].canceled,false);
   await withExpertActor(stranger,async client=>{assert.equal((await client.query('SELECT public.cancel_assigned_engagement($1) canceled',[id])).rows[0].canceled,false);});
   await assert.rejects(getAuthPool().query('SELECT public.cancel_assigned_engagement($1)',[id]),(error:unknown)=>(error as {code?:string}).code==='42501');
   await withExpertActor(expert,async client=>{
    const canceled=await client.query('SELECT public.cancel_assigned_engagement($1) canceled',[id]);
    assert.equal(canceled.rows[0].canceled,true);
    assert.equal((await client.query('SELECT id FROM engagements WHERE id=$1',[id])).rowCount,0);
   });
  });
  await t.test('collaborative task status can be updated by another authorized author without changing authorship',async()=>{
   const id=seededOrg+'-first',project=seededOrg+'-project',taskId=id+'-task';
   await owner.query("UPDATE engagements SET status='Active',revoked_at=NULL,access_expires_at=now()+interval '1 hour' WHERE id=$1",[id]);
   await withExpertActor(stranger,async client=>{
    await client.query("INSERT INTO engagement_entries(id,engagement_id,organization_id,project_id,author_id,kind,payload) VALUES($1,$2,$3,$4,$5,'task',$6)",[taskId,id,seededOrg,project,stranger.id,{id:taskId,authorId:stranger.id,body:'Synthetic task',status:'open'}]);
   });
   await withExpertActor(expert,async client=>{
    assert.equal((await client.query('UPDATE engagement_entries SET payload=payload || $1 WHERE id=$2',[{status:'done'},taskId])).rowCount,1);
    const row=(await client.query('SELECT author_id,payload FROM engagement_entries WHERE id=$1',[taskId])).rows[0];assert.equal(row.author_id,stranger.id);assert.equal(row.payload.body,'Synthetic task');assert.equal(row.payload.status,'done');
    assert.equal((await client.query('UPDATE engagement_entries SET payload=payload || $1 WHERE id=$2',[{body:'not allowed'},id+'-entry'])).rowCount,0);
   });
   await withExpertActor(expert,async client=>{await assert.rejects(client.query('UPDATE engagement_entries SET author_id=$1 WHERE id=$2',[expert.id,taskId]),(error:unknown)=>(error as {code?:string}).code==='42501');});
   await withExpertActor(stranger,async client=>{await assert.rejects(client.query('DELETE FROM engagement_entries WHERE id=$1',[taskId]),(error:unknown)=>(error as {code?:string}).code==='42501');});
   await owner.query("UPDATE engagements SET status='Agreement Pending' WHERE id=$1",[id]);
   await withExpertActor(stranger,async client=>{await assert.rejects(client.query("INSERT INTO engagement_entries(id,engagement_id,organization_id,project_id,author_id,kind,payload) VALUES($1,$2,$3,$4,$5,'message','{}')",[id+'-before-active',id,seededOrg,project,stranger.id]),(error:unknown)=>(error as {code?:string}).code==='42501');});
  });
 }finally{
  if(seededOrg)await owner.query('DELETE FROM organizations WHERE id=$1',[seededOrg]);
  if(oldReviewers===undefined)delete process.env.BORDERLESS_EXPERT_REVIEWER_IDS;else process.env.BORDERLESS_EXPERT_REVIEWER_IDS=oldReviewers;
  await owner.query('DELETE FROM audit_logs WHERE actor_id=ANY($1)',[[expert.id,stranger.id,reviewer.id]]);
  await owner.query('DELETE FROM "user" WHERE id=ANY($1)',[[expert.id,stranger.id,reviewer.id]]);await owner.end();
 }
});
