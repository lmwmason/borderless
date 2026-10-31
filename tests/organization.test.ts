import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getAuthPool,getPool} from '../src/lib/db';
import {requireUser} from '../src/lib/auth';
import {organizationService,authorizeProject,requireProject,limit} from '../src/lib/organizations';
import {billingService,TERMS_VERSION} from '../src/lib/billing';
import {createProjectRepository} from '../src/lib/workspace/postgres';
import type {Company} from '../src/lib/contracts';
import {register,authRequest,responseCookie,ownerProject,scopedRequest,testOrigin,testPassword} from './helpers';
const codeError=(code:string)=>(error:unknown)=>Boolean(error&&typeof error==='object'&&'code' in error&&error.code===code);
const company:Company={id:'company',name:'Private company',homeCountry:'KR',industry:'b2b_saas',targetStates:['CA'],usEntity:false,usEmployees:0,usOffice:false,salesModel:'remote',customerType:'b2b',annualUsRevenueUsd:null,processesPersonalData:null,updatedAt:new Date().toISOString()};

test('real Better Auth registration, no-org account, sign-in, sign-out, expiration and persisted rate limits',async()=>{
 const account=await register('auth');
 assert.ok(account.cookie);assert.equal((await organizationService.account(account.user)).organizations.length,0);
 assert.equal((await requireUser(new Request(testOrigin()+'/api/account',{headers:{cookie:account.cookie}}))).id,account.user.id);
 const logout=await authRequest('sign-out',{},account.cookie);assert.equal(logout.status,200);
 await assert.rejects(requireUser(new Request(testOrigin()+'/api/account',{headers:{cookie:account.cookie}})),codeError('UNAUTHENTICATED'));
 const login=await authRequest('sign-in/email',{email:account.email,password:testPassword});assert.equal(login.status,200);
 const loginCookie=responseCookie(login);assert.ok(loginCookie);
 await getAuthPool().query('UPDATE "session" SET "expiresAt"=now()-interval \'1 minute\' WHERE "userId"=$1',[account.user.id]);
 await assert.rejects(requireUser(new Request(testOrigin()+'/api/account',{headers:{cookie:loginCookie}})),codeError('UNAUTHENTICATED'));
 const ip='198.19.'+Math.floor(Math.random()*200+1)+'.'+Math.floor(Math.random()*200+1);
 let blocked=false;
 for(let i=0;i<12;i++){
  const response=await authRequest('sign-in/email',{email:account.email,password:'wrong-test-password'},'',ip);
  if(response.status===429){blocked=true;break;}
 }
 assert.equal(blocked,true,'same-address sign-in attempts must reach a persisted rate limit');
 const bucket=await getAuthPool().query('SELECT count(*)::int AS count FROM "rateLimit"');assert.ok(bucket.rows[0].count>0);
 await assert.rejects(getPool().query('SELECT password FROM "account" LIMIT 1'),codeError('42501'));
 await assert.rejects(getPool().query('SELECT token FROM "session" LIMIT 1'),codeError('42501'));
});

test('organization activation, invitations, Pending isolation, approval roles, IDOR and project-data segregation',async()=>{
 const owner=await register('org-owner'),admin=await register('org-admin'),member=await register('org-member'),viewer=await register('org-viewer');
 const org=await organizationService.create(owner.user,{name:'Organization '+randomUUID()});
 assert.equal(org.role,'Owner');assert.equal(org.status,'Draft');assert.equal(org.plan,'Free');assert.ok(org.workspaceId);
 assert.equal((await organizationService.detail(owner.user,org.id)).projects.length,0);
 await assert.rejects(organizationService.createProject(owner.user,org.id,{name:'Blocked before activation'}),codeError('ORGANIZATION_INACTIVE'));
 await assert.rejects(billingService.activateFree(owner.user,org.id),codeError('TERMS_REQUIRED'));
 await assert.rejects(billingService.acceptTerms(owner.user,org.id,{termsVersion:'not-current',accepted:true}));
 await billingService.acceptTerms(owner.user,org.id,{termsVersion:TERMS_VERSION,accepted:true});
 assert.equal((await billingService.activateFree(owner.user,org.id)).subscription.status,'Active');
 const project=await organizationService.createProject(owner.user,org.id,{name:'First project'});
 const secondProject=await organizationService.createProject(owner.user,org.id,{name:'Second project'});
 const invite=await organizationService.createInvite(owner.user,org.id,{});
 assert.ok(invite.code.length>=40);
 const stored=(await getPool().query('SELECT code_hash FROM invitations WHERE id=$1',[invite.id])).rows[0];
 assert.match(stored.code_hash,/^[a-f0-9]{64}$/);assert.notEqual(stored.code_hash,invite.code);
 for(const user of [admin,member,viewer]){
  await organizationService.join(user.user,invite.code);
  await assert.rejects(organizationService.getProject(user.user,project.id),codeError('FORBIDDEN'));
 }
 const pending=(await organizationService.detail(owner.user,org.id)).requests;
 await organizationService.decideRequest(owner.user,org.id,pending.find(r=>r.userId===admin.user.id)!.id,{decision:'approve',role:'Admin'});
 await assert.rejects(organizationService.decideRequest(admin.user,org.id,pending.find(r=>r.userId===member.user.id)!.id,{decision:'approve',role:'Admin'}),codeError('FORBIDDEN'));
 await organizationService.decideRequest(admin.user,org.id,pending.find(r=>r.userId===member.user.id)!.id,{decision:'approve',role:'Member'});
 await organizationService.decideRequest(admin.user,org.id,pending.find(r=>r.userId===viewer.user.id)!.id,{decision:'reject',role:'Viewer'});
 assert.equal((await organizationService.account(viewer.user)).organizations.length,0);
 await organizationService.join(viewer.user,invite.code);
 const viewerRequest=(await organizationService.detail(owner.user,org.id)).requests.find(r=>r.userId===viewer.user.id)!;
 await organizationService.decideRequest(admin.user,org.id,viewerRequest.id,{decision:'approve',role:'Viewer'});
 await assert.rejects(organizationService.createInvite(member.user,org.id,{}),codeError('FORBIDDEN'));
 await assert.rejects(organizationService.createProject(viewer.user,org.id,{name:'Read-only'}),codeError('READ_ONLY'));
 await assert.rejects(organizationService.changeMemberRole(admin.user,org.id,(await organizationService.detail(owner.user,org.id)).members.find(m=>m.userId===owner.user.id)!.id,'Member'),codeError('FORBIDDEN'));
 const ownerScope={user:owner.user,...await authorizeProject(owner.user.id,project.id)};
 const memberScope={user:member.user,...await authorizeProject(member.user.id,project.id)};
 const viewerScope={user:viewer.user,...await authorizeProject(viewer.user.id,project.id)};
 const repo=createProjectRepository(ownerScope);
 await repo.saveCompany(company);
 assert.equal((await createProjectRepository(memberScope).getWorkspace()).company?.name,company.name);
 assert.equal((await createProjectRepository(viewerScope).getWorkspace()).company?.name,company.name);
 await assert.rejects(createProjectRepository(viewerScope).saveCompany({...company,name:'Forbidden edit'}),codeError('READ_ONLY'));
 assert.equal((await createProjectRepository({user:owner.user,...await authorizeProject(owner.user.id,secondProject.id)}).getWorkspace()).company,null);
 const outsider=await ownerProject('other-org');
 await assert.rejects(organizationService.getProject(outsider.user,project.id),codeError('FORBIDDEN'));
 await assert.rejects(requireProject(scopedRequest('/api/workspace','GET',outsider.cookie,project.id,undefined,{'x-organization-id':org.id})),codeError('FORBIDDEN'));
 const revoked=await organizationService.createInvite(owner.user,org.id,{});await organizationService.revokeInvite(owner.user,org.id,revoked.id);
 await assert.rejects(organizationService.join(outsider.user,revoked.code),codeError('INVITE_INVALID'));
 const expired=await organizationService.createInvite(owner.user,org.id,{});
 await getPool().query('UPDATE invitations SET expires_at=now()-interval \'1 minute\' WHERE id=$1',[expired.id]);
 await assert.rejects(organizationService.join(outsider.user,expired.code),codeError('INVITE_INVALID'));
 assert.equal((await getPool().query('SELECT * FROM company_profiles WHERE project_id=$1',[project.id])).rows.length,0,'RLS denies unscoped runtime queries');
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');await client.query("SELECT set_config('borderless.organization_id',$1,true),set_config('borderless.project_id',$2,true)",[org.id,project.id]);
  assert.equal((await client.query('SELECT * FROM company_profiles WHERE project_id=$1',[project.id])).rowCount,1);
  assert.equal((await client.query('SELECT * FROM company_profiles WHERE organization_id=$1',[outsider.organization.id])).rowCount,0);
  await client.query('ROLLBACK');
 }finally{client.release();}
 const audit=(await getPool().query('SELECT action,detail FROM audit_logs WHERE organization_id=$1',[org.id])).rows;
 assert.ok(audit.some(e=>e.action==='terms.accepted'));assert.ok(audit.some(e=>e.action==='membership.approve'));
 assert.ok(!JSON.stringify(audit).includes(invite.code),'audit never stores raw invite code');
});

test('paid checkout is unavailable, forged activation fails, canceled/expired entitlements block access while preserving rows',async()=>{
 const owner=await ownerProject('billing');const org=owner.organization;
 const repo=createProjectRepository({user:owner.user,...await authorizeProject(owner.user.id,owner.project.id)});
 await repo.saveCompany(company);
 await billingService.selectPlan(owner.user,org.id,'Startup');
 const planRoute=await import('../src/app/api/organizations/[id]/billing/plan/route');
 const forged=await planRoute.PUT(scopedRequest('/api/organizations/'+org.id+'/billing/plan','PUT',owner.cookie,owner.project.id,{plan:'Startup',status:'Active'}),{params:Promise.resolve({id:org.id})});
 assert.equal(forged.status,400,'browser payload cannot assert a paid entitlement');
 const pending=await billingService.get(owner.user,org.id);assert.equal(pending.organizationStatus,'Draft');assert.equal(pending.subscription.status,'Pending');assert.equal(pending.checkoutAvailable,false);
 await assert.rejects(billingService.checkout(owner.user,org.id),codeError('CONFIG_REQUIRED'));
 await assert.rejects(billingService.activateFree(owner.user,org.id),codeError('FREE_PLAN_REQUIRED'));
 await assert.rejects(authorizeProject(owner.user.id,owner.project.id),codeError('ORGANIZATION_INACTIVE'));
 const canceled=await billingService.cancel(owner.user,org.id);assert.equal(canceled.subscription.status,'Canceled');
 await assert.rejects(repo.getWorkspace(),codeError('ORGANIZATION_INACTIVE'));
 await billingService.selectPlan(owner.user,org.id,'Free');await billingService.activateFree(owner.user,org.id);
 assert.equal((await repo.getWorkspace()).company?.name,company.name,'canceling request preserves existing data');
 await getPool().query("UPDATE subscriptions SET expires_at=now()-interval '1 minute' WHERE organization_id=$1",[org.id]);
 await assert.rejects(repo.getWorkspace(),codeError('ORGANIZATION_INACTIVE'));
 await getPool().query('UPDATE subscriptions SET expires_at=NULL WHERE organization_id=$1',[org.id]);
 await billingService.requestEnterprise(owner.user,org.id,{notes:'Synthetic enterprise inquiry, no contract approval'});
 assert.equal((await billingService.get(owner.user,org.id)).enterpriseRequest?.status,'Pending');
 assert.equal((await billingService.get(owner.user,org.id)).plan,'Free','enterprise inquiry never self-provisions paid access');
 assert.equal((await repo.getWorkspace()).company?.name,company.name);
});

test('organization action rate limits are persisted and atomic per authenticated user',async()=>{
 const user=await register('org-rate');
 const joins=await Promise.allSettled(Array.from({length:6},()=>organizationService.join(user.user,'z'.repeat(43))));
 assert.equal(joins.filter(outcome=>outcome.status==='rejected'&&codeError('RATE_LIMIT')(outcome.reason)).length,1);
 assert.equal(joins.filter(outcome=>outcome.status==='rejected'&&codeError('INVITE_INVALID')(outcome.reason)).length,5);
 const invites=await Promise.allSettled(Array.from({length:11},()=>limit(user.user.id,'invites')));
 assert.equal(invites.filter(outcome=>outcome.status==='fulfilled').length,10);
 const approvals=await Promise.allSettled(Array.from({length:21},()=>limit(user.user.id,'approvals')));
 assert.equal(approvals.filter(outcome=>outcome.status==='fulfilled').length,20);
 const counters=await getPool().query('SELECT count,reset_at FROM request_limits WHERE key=$1',[user.user.id+':join']);
 assert.equal(counters.rows[0].count,6);assert.ok(new Date(counters.rows[0].reset_at).getTime()>Date.now());
});
