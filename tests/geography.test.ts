import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {register,registerAdmin,testOrigin} from './helpers';
import {expertService,ExpertProfileInput,ExpertSearchInput,withExpertActor} from '../src/lib/experts';
import {localizedText} from '../src/lib/experts/geography';
import {getLanguagePreference,saveLanguagePreference} from '../src/lib/i18n/preferences';
import {getPool} from '../src/lib/db';

test('assigned country and US jurisdiction validation rejects plausible but unknown codes',()=>{
 for(const field of ['residenceCountry','qualificationCountry'])assert.equal(ExpertProfileInput.safeParse({displayName:'Test',[field]:'ZZ'}).success,false);
 assert.equal(ExpertProfileInput.safeParse({displayName:'Test',licensedJurisdictions:['US-XX']}).success,false);
 assert.equal(ExpertSearchInput.safeParse({serviceCountry:'USA'}).success,false);
 assert.equal(ExpertSearchInput.safeParse({licensedJurisdiction:'US-CA'}).success,true);
 const legacy=ExpertProfileInput.parse({displayName:'Legacy',licenseJurisdiction:'California'});assert.equal(legacy.residenceCountry,null);assert.deepEqual(legacy.licensedJurisdictions,[]);assert.equal(legacy.licenseJurisdiction,'California');
 assert.equal(localizedText({ko:{bio:'한국어'}},'ko','bio','Original'),'한국어');assert.equal(localizedText({},'en','bio','Original'),'Original');
});
test('expert geography and bilingual text persist, filter public records and retain private credentials',async()=>{
 const actor=await register('geo-expert'),reader=await register('geo-reader');
 const literal='<script>alert("literal")</script>';
 const saved=await expertService.saveProfile(actor.user,{displayName:'Geo bilingual',visibility:'public',bio:'Original biography',specialties:['Synthetic geo'],languages:['English','Korean'],licenseNumber:'PRIVATE-GEO',portfolio:[{title:'Private portfolio',url:'https://example.invalid/private',visibility:'private'}],licenseJurisdiction:'Unmodified credential description',residenceCountry:'KR',qualificationCountry:'US',licensedJurisdictions:['US-CA'],serviceCountries:['KR','US'],consultationModes:['remote'],originalLanguage:'ko',localizedContent:{ko:{bio:literal},en:{bio:'English biography',portfolioDescription:'PRIVATE-PORTFOLIO-DESCRIPTION'}}});
 await expertService.submit(actor.user);
 const service=await expertService.saveService(actor.user,{title:'Geo service',scope:'Original scope',serviceType:'Document Review',pricingType:'quote',priceMinor:null,currency:'KRW',published:true,originalLanguage:'ko',localizedContent:{en:{description:'English service'},ko:{scope:literal}}});
 const found=await expertService.search(reader.user,{residenceCountry:'KR',qualificationCountry:'US',licensedJurisdiction:'US-CA',serviceCountry:'US',q:'Geo bilingual'});
 const profile=found.experts.find(value=>value.id===saved.id)!;assert.ok(profile);assert.equal(profile.localizedContent.ko?.bio,literal);assert.equal(profile.licenseJurisdiction,'Unmodified credential description');assert.ok(!JSON.stringify(profile).includes('PRIVATE-GEO'));assert.ok(!JSON.stringify(profile).includes('PRIVATE-PORTFOLIO-DESCRIPTION'));assert.equal(profile.localizedContent.en?.portfolioDescription,'');assert.equal(profile.services[0].localizedContent.ko?.scope,literal);
 assert.equal((await expertService.search(reader.user,{residenceCountry:'CA',q:'Geo bilingual'})).experts.some(p=>p.id===saved.id),false);
 const own=(await expertService.me(actor.user)).profile!;assert.equal(own.residenceCountry,'KR');assert.equal(own.licenseNumber,'PRIVATE-GEO');assert.equal(own.localizedContent.en?.portfolioDescription,'PRIVATE-PORTFOLIO-DESCRIPTION');assert.equal((await expertService.me(actor.user)).services.find(v=>v.id===service.id)?.originalLanguage,'ko');
 await withExpertActor(reader.user,async client=>{const row=(await client.query('SELECT payload FROM expert_directory WHERE id=$1',[saved.id])).rows[0];assert.equal(row.payload.localizedContent.ko.bio,literal);assert.ok(!JSON.stringify(row).includes('PRIVATE-GEO'));});
 const owner=new Pool({connectionString:process.env.DIRECT_DATABASE_URL,max:1});try{await owner.query("UPDATE expert_profiles SET status='Verified',public_payload=jsonb_set(jsonb_set(public_payload,'{localizedContent,en,privateCredential}',to_jsonb('PRIVATE-INJECTED'::text)),'{localizedContent,en,portfolioDescription}',to_jsonb('PRIVATE-INJECTED-PORTFOLIO'::text)) WHERE id=$1",[saved.id]);}finally{await owner.end();}
 await withExpertActor(reader.user,async client=>{const row=(await client.query('SELECT payload FROM expert_directory WHERE id=$1',[saved.id])).rows[0];assert.ok(!JSON.stringify(row).includes('PRIVATE-INJECTED'));assert.ok(!JSON.stringify(row).includes('PRIVATE-INJECTED-PORTFOLIO'));assert.equal(row.payload.localizedContent.en.portfolioDescription,'');});
 const {id:_id,userId:_user,status:_status,updatedAt:_at,verification:_verification,...editable}=own;const edited=await expertService.saveProfile(actor.user,{...editable,residenceCountry:'CA'});assert.equal(edited.status,'Draft');
 await expertService.saveProfile(actor.user,{...editable,portfolio:editable.portfolio.map(item=>({...item,visibility:'public' as const}))});await expertService.submit(actor.user);assert.equal((await expertService.detail(reader.user,saved.id)).localizedContent.en?.portfolioDescription,'PRIVATE-PORTFOLIO-DESCRIPTION','Explicit public portfolio opt-in permits its description');
});
test('language preferences use actual regular or separate admin identity and owner-only RLS',async()=>{
 const first=await register('locale-one'),other=await register('locale-two'),admin=await registerAdmin('locale-admin');
 const req=(cookie='')=>new Request(testOrigin()+'/api/locale',{headers:{cookie}});
 assert.deepEqual(await saveLanguagePreference(req(),'ko'),{locale:'ko',authenticated:false});
 assert.deepEqual(await getLanguagePreference(req(first.cookie)),{locale:null,authenticated:true});
 assert.deepEqual(await saveLanguagePreference(req(first.cookie),'ko'),{locale:'ko',authenticated:true});
 assert.deepEqual(await getLanguagePreference(req(first.cookie)),{locale:'ko',authenticated:true});
 assert.deepEqual(await getLanguagePreference(req(other.cookie)),{locale:null,authenticated:true});
 assert.deepEqual(await saveLanguagePreference(req(admin.cookie),'en'),{locale:'en',authenticated:true});
 const client=await getPool().connect();try{await client.query('BEGIN');await client.query("SELECT set_config('borderless.user_id',$1,true)",[other.user.id]);assert.equal((await client.query('SELECT * FROM user_preferences WHERE user_id=$1',[first.user.id])).rowCount,0);await assert.rejects(client.query("INSERT INTO user_preferences(user_id,locale) VALUES($1,'en')",[first.user.id]));}finally{await client.query('ROLLBACK');client.release();}
});
