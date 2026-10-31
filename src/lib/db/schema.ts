import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, integer, bigint, jsonb, unique, uniqueIndex, index, primaryKey, foreignKey, check, pgPolicy } from 'drizzle-orm/pg-core';

const time=(name:string)=>timestamp(name,{withTimezone:true,mode:'date'});
export const authUser=pgTable('user',{
 id:text('id').primaryKey(),name:text('name').notNull(),email:text('email').notNull(),
 emailVerified:boolean('emailVerified').notNull().default(false),image:text('image'),
 createdAt:time('createdAt').notNull().defaultNow(),updatedAt:time('updatedAt').notNull().defaultNow()
},t=>[uniqueIndex('user_email_unique').on(t.email)]);
export const authSession=pgTable('session',{
 id:text('id').primaryKey(),expiresAt:time('expiresAt').notNull(),token:text('token').notNull(),
 createdAt:time('createdAt').notNull().defaultNow(),updatedAt:time('updatedAt').notNull().defaultNow(),
 ipAddress:text('ipAddress'),userAgent:text('userAgent'),userId:text('userId').notNull().references(()=>authUser.id,{onDelete:'cascade'})
},t=>[uniqueIndex('session_token_unique').on(t.token),index('session_user_idx').on(t.userId),index('session_expiry_idx').on(t.expiresAt)]);
export const authAccount=pgTable('account',{
 id:text('id').primaryKey(),accountId:text('accountId').notNull(),providerId:text('providerId').notNull(),
 userId:text('userId').notNull().references(()=>authUser.id,{onDelete:'cascade'}),accessToken:text('accessToken'),refreshToken:text('refreshToken'),idToken:text('idToken'),
 accessTokenExpiresAt:time('accessTokenExpiresAt'),refreshTokenExpiresAt:time('refreshTokenExpiresAt'),scope:text('scope'),password:text('password'),
 createdAt:time('createdAt').notNull().defaultNow(),updatedAt:time('updatedAt').notNull().defaultNow()
},t=>[index('account_user_idx').on(t.userId),uniqueIndex('account_provider_unique').on(t.providerId,t.accountId)]);
export const authVerification=pgTable('verification',{
 id:text('id').primaryKey(),identifier:text('identifier').notNull(),value:text('value').notNull(),expiresAt:time('expiresAt').notNull(),
 createdAt:time('createdAt').notNull().defaultNow(),updatedAt:time('updatedAt').notNull().defaultNow()
},t=>[index('verification_identifier_idx').on(t.identifier),index('verification_expiry_idx').on(t.expiresAt)]);
export const authRateLimit=pgTable('rateLimit',{
 id:text('id').primaryKey(),key:text('key').notNull(),count:integer('count').notNull(),lastRequest:bigint('lastRequest',{mode:'number'}).notNull()
},t=>[uniqueIndex('auth_rate_limit_key_unique').on(t.key),index('auth_rate_limit_expiry_idx').on(t.lastRequest)]);
export const organizations=pgTable('organizations',{
 id:text('id').primaryKey(),name:text('name').notNull(),status:text('status').notNull().default('Draft'),plan:text('plan').notNull().default('Free'),createdAt:time('created_at').notNull().defaultNow()
});
export const organizationWorkspaces=pgTable('organization_workspaces',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull().references(()=>organizations.id,{onDelete:'cascade'})
},t=>[uniqueIndex('workspace_organization_unique').on(t.organizationId),unique('workspace_org_id_unique').on(t.organizationId,t.id)]);
export const memberships=pgTable('memberships',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),
 userId:text('user_id').notNull().references(()=>authUser.id,{onDelete:'cascade'}),role:text('role').notNull(),createdAt:time('created_at').notNull().defaultNow()
},t=>[uniqueIndex('membership_org_user_unique').on(t.organizationId,t.userId),index('membership_user_idx').on(t.userId),check('membership_role_check',sql`${t.role} in ('Owner','Admin','Member','Viewer','Pending')`)]);
export const invitations=pgTable('invitations',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),
 codeHash:text('code_hash').notNull(),createdBy:text('created_by').notNull().references(()=>authUser.id),expiresAt:time('expires_at').notNull(),revokedAt:time('revoked_at'),createdAt:time('created_at').notNull().defaultNow()
},t=>[uniqueIndex('invitation_code_unique').on(t.codeHash),index('invitation_org_idx').on(t.organizationId),index('invitation_creator_idx').on(t.createdBy)]);
export const joinRequests=pgTable('join_requests',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),
 userId:text('user_id').notNull().references(()=>authUser.id,{onDelete:'cascade'}),status:text('status').notNull().default('Pending'),
 createdAt:time('created_at').notNull().defaultNow(),decidedAt:time('decided_at')
},t=>[uniqueIndex('join_request_org_user_unique').on(t.organizationId,t.userId),index('join_request_user_idx').on(t.userId),index('join_request_org_status_idx').on(t.organizationId,t.status),check('join_request_status_check',sql`${t.status} in ('Pending','Approved','Rejected')`)]);
export const projects=pgTable('projects',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),
 workspaceId:text('workspace_id').notNull(),name:text('name').notNull(),description:text('description').notNull().default(''),createdAt:time('created_at').notNull().defaultNow()
},t=>[unique('project_org_id_unique').on(t.organizationId,t.id),index('project_workspace_idx').on(t.workspaceId),
 foreignKey({name:'project_workspace_org_fk',columns:[t.organizationId,t.workspaceId],foreignColumns:[organizationWorkspaces.organizationId,organizationWorkspaces.id]}).onDelete('cascade')]);
export const auditLogs=pgTable('audit_logs',{
 id:text('id').primaryKey(),organizationId:text('organization_id').references(()=>organizations.id,{onDelete:'set null'}),
 projectId:text('project_id'),actorId:text('actor_id').references(()=>authUser.id,{onDelete:'set null'}),
 action:text('action').notNull(),detail:jsonb('detail').notNull().default({}),createdAt:time('created_at').notNull().defaultNow()
},t=>[index('audit_org_date_idx').on(t.organizationId,t.createdAt),index('audit_project_idx').on(t.projectId),index('audit_org_project_idx').on(t.organizationId,t.projectId),index('audit_actor_idx').on(t.actorId)]);
export const requestLimits=pgTable('request_limits',{
 key:text('key').primaryKey(),count:integer('count').notNull(),resetAt:time('reset_at').notNull()
},t=>[index('request_limit_expiry_idx').on(t.resetAt)]);
export const subscriptions=pgTable('subscriptions',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),
 plan:text('plan').notNull(),status:text('status').notNull().default('Pending'),provider:text('provider'),providerRef:text('provider_ref'),expiresAt:time('expires_at'),updatedAt:time('updated_at').notNull().defaultNow()
},t=>[uniqueIndex('subscription_org_unique').on(t.organizationId),check('subscription_status_check',sql`${t.status} in ('Pending','Active','Failed','Canceled','Expired')`)]);
export const contractAcceptances=pgTable('contract_acceptances',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),
 actorId:text('actor_id').notNull().references(()=>authUser.id),termsVersion:text('terms_version').notNull(),acceptedAt:time('accepted_at').notNull().defaultNow(),termsHash:text('terms_hash').notNull()
},t=>[index('contract_org_idx').on(t.organizationId),index('contract_actor_idx').on(t.actorId)]);
export const enterpriseRequests=pgTable('enterprise_requests',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),
 requestedBy:text('requested_by').notNull().references(()=>authUser.id),status:text('status').notNull().default('Pending'),notes:text('notes').notNull().default(''),
 createdAt:time('created_at').notNull().defaultNow(),reviewedAt:time('reviewed_at')
},t=>[index('enterprise_org_idx').on(t.organizationId),index('enterprise_requester_idx').on(t.requestedBy),check('enterprise_status_check',sql`${t.status} in ('Pending','Approved','Rejected')`)]);
export const paymentEvents=pgTable('payment_events',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),
 providerEventId:text('provider_event_id'),eventType:text('event_type').notNull(),verified:boolean('verified').notNull().default(false),payload:jsonb('payload').notNull().default({}),createdAt:time('created_at').notNull().defaultNow()
},t=>[uniqueIndex('payment_event_provider_unique').on(t.providerEventId),index('payment_event_org_idx').on(t.organizationId)]);

function projectTable<TName extends string>(name:TName){
 return pgTable(name,{
  id:text('id').notNull(),organizationId:text('organization_id').notNull(),projectId:text('project_id').notNull(),payload:jsonb('payload').notNull()
 },t=>[
  primaryKey({columns:[t.projectId,t.id]}),index(name+'_scope_idx').on(t.organizationId,t.projectId),
  foreignKey({name:name+'_project_fk',columns:[t.organizationId,t.projectId],foreignColumns:[projects.organizationId,projects.id]}).onDelete('cascade'),
  pgPolicy(name+'_tenant_scope',{for:'all',to:'public',
   using:sql`${t.organizationId} = (select current_setting('borderless.organization_id', true)) and ${t.projectId} = (select current_setting('borderless.project_id', true))`,
   withCheck:sql`${t.organizationId} = (select current_setting('borderless.organization_id', true)) and ${t.projectId} = (select current_setting('borderless.project_id', true))`
  })
 ]).enableRLS();
}
export const companyProfiles=projectTable('company_profiles');
export const scenarios=projectTable('scenarios');
export const assessments=projectTable('assessments');
export const findings=projectTable('findings');
export const tasks=projectTable('tasks');
export const reviewJobs=projectTable('review_jobs');
export const projectActivity=projectTable('project_activity');
export const documents=projectTable('documents');

export const changeImpacts=projectTable('change_impacts');
