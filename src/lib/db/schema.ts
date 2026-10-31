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
 requestedBy:text('requested_by').notNull().references(()=>authUser.id),status:text('status').notNull().default('Pending'),notes:text('notes').notNull().default(''),companySnapshot:jsonb('company_snapshot').notNull().default({}),
 createdAt:time('created_at').notNull().defaultNow(),reviewedAt:time('reviewed_at'),reviewedBy:text('reviewed_by').references(()=>authUser.id),reviewNotes:text('review_notes').notNull().default(''),
 salesStatus:text('sales_status').notNull().default('New'),assigneeId:text('assignee_id').references(()=>authUser.id,{onDelete:'set null'}),updatedAt:time('updated_at').notNull().defaultNow(),
 requestKey:text('request_key'),requestFingerprint:text('request_fingerprint')
},t=>[index('enterprise_org_idx').on(t.organizationId),index('enterprise_requester_idx').on(t.requestedBy),index('enterprise_reviewer_idx').on(t.reviewedBy),index('enterprise_sales_updated_idx').on(t.salesStatus,t.updatedAt),index('enterprise_assignee_updated_idx').on(t.assigneeId,t.updatedAt),uniqueIndex('enterprise_request_key_unique').on(t.organizationId,t.requestKey),check('enterprise_sales_status_check',sql`${t.salesStatus} in ('New','Contacted','Negotiating','Won','Lost')`),check('enterprise_status_check',sql`${t.status} in ('Pending','In Review','Closed','Approved','Rejected')`)]);
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


// Expert private rows are actor scoped; sanitized directory views are installed
// by the additive migration and run under the dedicated owner view context.
const actor=sql`(select current_setting('borderless.user_id',true))`;
const reviewer=sql`(select current_setting('borderless.expert_reviewer',true)) = 'on'`;
const companyRead=(org:unknown)=>sql`exists(select 1 from memberships m where m.organization_id=${org} and m.user_id=${actor} and m.role in ('Owner','Admin','Member','Viewer'))`;
const companyWrite=(org:unknown)=>sql`exists(select 1 from memberships m where m.organization_id=${org} and m.user_id=${actor} and m.role in ('Owner','Admin','Member'))`;
export const expertProfiles=pgTable('expert_profiles',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>authUser.id,{onDelete:'cascade'}),
 status:text('status').notNull().default('Draft'),visibility:text('visibility').notNull().default('private'),payload:jsonb('payload').notNull(),publicPayload:jsonb('public_payload'),updatedAt:time('updated_at').notNull().defaultNow()
},t=>[
 unique('expert_profile_id_user_unique').on(t.id,t.userId),uniqueIndex('expert_profile_user_unique').on(t.userId),index('expert_profile_directory_idx').on(t.visibility,t.status),
 check('expert_profile_status_check',sql`${t.status} in ('Draft','Pending Verification','Verified','Rejected')`),check('expert_profile_visibility_check',sql`${t.visibility} in ('private','public')`),
 pgPolicy('expert_profile_read',{for:'select',to:'public',using:sql`${t.userId}=${actor} or ${reviewer}`}),
 pgPolicy('expert_profile_create',{for:'insert',to:'public',withCheck:sql`${t.userId}=${actor} and ${t.status}='Draft'`}),
 pgPolicy('expert_profile_update',{for:'update',to:'public',using:sql`${t.userId}=${actor} or (${reviewer} and ${t.userId}<>${actor})`,withCheck:sql`(${t.userId}=${actor} and ${t.status} in ('Draft','Pending Verification')) or (${reviewer} and ${t.userId}<>${actor})`})
]).enableRLS();
export const expertServices=pgTable('expert_services',{
 id:text('id').primaryKey(),expertId:text('expert_id').notNull().references(()=>expertProfiles.id,{onDelete:'cascade'}),payload:jsonb('payload').notNull(),published:boolean('published').notNull().default(false),publicPayload:jsonb('public_payload'),createdAt:time('created_at').notNull().defaultNow()
},t=>[
 index('expert_service_profile_idx').on(t.expertId),
 pgPolicy('expert_service_owner',{for:'all',to:'public',using:sql`exists(select 1 from expert_profiles p where p.id=${t.expertId} and p.user_id=${actor})`,withCheck:sql`exists(select 1 from expert_profiles p where p.id=${t.expertId} and p.user_id=${actor})`})
]).enableRLS();
const expertRowAccess=(expertId:unknown,userId:unknown,status:unknown,expiresAt:unknown,revokedAt:unknown)=>sql`${userId}=${actor} and ${status} not in ('Draft','Canceled') and ${revokedAt} is null and (${expiresAt} is null or ${expiresAt}>now()) and exists(select 1 from expert_profiles p where p.id=${expertId} and p.user_id=${actor} and p.status in ('Pending Verification','Verified'))`;
export const engagements=pgTable('engagements',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull(),projectId:text('project_id').notNull(),expertId:text('expert_id').notNull().references(()=>expertProfiles.id),expertUserId:text('expert_user_id').notNull().references(()=>authUser.id),createdBy:text('created_by').notNull().references(()=>authUser.id),
 status:text('status').notNull().default('Draft'),payload:jsonb('payload').notNull(),accessExpiresAt:time('access_expires_at'),revokedAt:time('revoked_at'),createdAt:time('created_at').notNull().defaultNow(),updatedAt:time('updated_at').notNull().defaultNow()
},t=>[
 unique('engagement_id_org_project_unique').on(t.id,t.organizationId,t.projectId),index('engagement_project_idx').on(t.organizationId,t.projectId),index('engagement_expert_idx').on(t.expertId),index('engagement_expert_user_idx').on(t.expertUserId),index('engagement_creator_idx').on(t.createdBy),
 foreignKey({name:'engagement_project_fk',columns:[t.organizationId,t.projectId],foreignColumns:[projects.organizationId,projects.id]}).onDelete('cascade'),
 foreignKey({name:'engagement_assigned_expert_fk',columns:[t.expertId,t.expertUserId],foreignColumns:[expertProfiles.id,expertProfiles.userId]}),
 check('engagement_status_check',sql`${t.status} in ('Draft','Submitted','Accepted','Declined','Agreement Pending','Active','Completed','Canceled')`),
 pgPolicy('engagement_read',{for:'select',to:'public',using:sql`${companyRead(t.organizationId)} or (${expertRowAccess(t.expertId,t.expertUserId,t.status,t.accessExpiresAt,t.revokedAt)}) or (${reviewer} and ${t.id}=(select current_setting('borderless.review_engagement_id',true)))`}),
 pgPolicy('engagement_create',{for:'insert',to:'public',withCheck:sql`${companyWrite(t.organizationId)} and ${t.createdBy}=${actor} and ${t.status}='Draft'`}),
 pgPolicy('engagement_reviewer_activate',{for:'update',to:'public',using:sql`${reviewer} and ${t.id}=(select current_setting('borderless.review_engagement_id',true)) and ${t.status}='Agreement Pending'`,withCheck:sql`${reviewer} and ${t.id}=(select current_setting('borderless.review_engagement_id',true)) and ${t.status}='Active'`}),
 pgPolicy('engagement_update',{for:'update',to:'public',using:sql`${companyWrite(t.organizationId)} or (${expertRowAccess(t.expertId,t.expertUserId,t.status,t.accessExpiresAt,t.revokedAt)})`,withCheck:sql`${companyWrite(t.organizationId)} or (${t.expertUserId}=${actor} and ${t.status}='Canceled' and exists(select 1 from expert_profiles p where p.id=${t.expertId} and p.user_id=${actor} and p.status in ('Pending Verification','Verified'))) or (${expertRowAccess(t.expertId,t.expertUserId,t.status,t.accessExpiresAt,t.revokedAt)})`})
]).enableRLS();
function childAccess(engagementId:unknown,organizationId:unknown,projectId:unknown,write:boolean){
 return sql`exists(select 1 from engagements e where e.id=${engagementId} and e.organization_id=${organizationId} and e.project_id=${projectId} and (${write?companyWrite(sql`e.organization_id`):companyRead(sql`e.organization_id`)} or (e.expert_user_id=${actor} and e.status in ${write?sql`('Active')`:sql`('Active','Completed')`} and e.payload->>'contractStatus'='Confirmed' and e.payload->>'companyAgreed'='true' and e.payload->>'expertAgreed'='true' and e.payload->>'conflictStatus'='Cleared' and exists(select 1 from expert_profiles p where p.id=e.expert_id and p.user_id=${actor} and p.status='Verified') and e.revoked_at is null and (e.access_expires_at is null or e.access_expires_at>now()))))`;
}
export const engagementResources=pgTable('engagement_resources',{
 id:text('id').primaryKey(),engagementId:text('engagement_id').notNull(),organizationId:text('organization_id').notNull(),projectId:text('project_id').notNull(),resourceKind:text('resource_kind').notNull(),resourceId:text('resource_id').notNull(),payload:jsonb('payload').notNull(),createdAt:time('created_at').notNull().defaultNow()
},t=>[
 uniqueIndex('engagement_resource_unique').on(t.engagementId,t.resourceKind,t.resourceId),index('engagement_resource_project_idx').on(t.organizationId,t.projectId),
 foreignKey({name:'engagement_resource_parent_fk',columns:[t.engagementId,t.organizationId,t.projectId],foreignColumns:[engagements.id,engagements.organizationId,engagements.projectId]}).onDelete('cascade'),
 pgPolicy('engagement_resource_read',{for:'select',to:'public',using:childAccess(t.engagementId,t.organizationId,t.projectId,false)}),
 pgPolicy('engagement_resource_write',{for:'all',to:'public',using:childAccess(t.engagementId,t.organizationId,t.projectId,true),withCheck:childAccess(t.engagementId,t.organizationId,t.projectId,true)})
]).enableRLS();
export const engagementEntries=pgTable('engagement_entries',{
 id:text('id').primaryKey(),engagementId:text('engagement_id').notNull(),organizationId:text('organization_id').notNull(),projectId:text('project_id').notNull(),authorId:text('author_id').notNull().references(()=>authUser.id),kind:text('kind').notNull(),payload:jsonb('payload').notNull(),createdAt:time('created_at').notNull().defaultNow()
},t=>[
 index('engagement_entry_parent_idx').on(t.engagementId),index('engagement_entry_project_idx').on(t.organizationId,t.projectId),index('engagement_entry_author_idx').on(t.authorId),
 foreignKey({name:'engagement_entry_parent_fk',columns:[t.engagementId,t.organizationId,t.projectId],foreignColumns:[engagements.id,engagements.organizationId,engagements.projectId]}).onDelete('cascade'),
 pgPolicy('engagement_entry_read',{for:'select',to:'public',using:childAccess(t.engagementId,t.organizationId,t.projectId,false)}),
 pgPolicy('engagement_entry_create',{for:'insert',to:'public',withCheck:sql`${childAccess(t.engagementId,t.organizationId,t.projectId,true)} and exists(select 1 from engagements e where e.id=${t.engagementId} and e.status='Active') and ${t.authorId}=${actor}`}),
 pgPolicy('engagement_entry_task_update',{for:'update',to:'public',using:sql`${t.kind}='task' and ${childAccess(t.engagementId,t.organizationId,t.projectId,true)} and exists(select 1 from engagements e where e.id=${t.engagementId} and e.status='Active')`,withCheck:sql`${t.kind}='task' and ${childAccess(t.engagementId,t.organizationId,t.projectId,true)} and exists(select 1 from engagements e where e.id=${t.engagementId} and e.status='Active')`})
]).enableRLS();
export const engagementEvents=pgTable('engagement_events',{
 id:text('id').primaryKey(),engagementId:text('engagement_id').notNull(),organizationId:text('organization_id').notNull(),projectId:text('project_id').notNull(),actorId:text('actor_id').notNull().references(()=>authUser.id),action:text('action').notNull(),payload:jsonb('payload').notNull(),createdAt:time('created_at').notNull().defaultNow()
},t=>[
 index('engagement_event_parent_idx').on(t.engagementId),index('engagement_event_project_idx').on(t.organizationId,t.projectId),index('engagement_event_actor_idx').on(t.actorId),
 foreignKey({name:'engagement_event_parent_fk',columns:[t.engagementId,t.organizationId,t.projectId],foreignColumns:[engagements.id,engagements.organizationId,engagements.projectId]}).onDelete('cascade'),
 pgPolicy('engagement_event_read',{for:'select',to:'public',using:childAccess(t.engagementId,t.organizationId,t.projectId,false)}),
 pgPolicy('engagement_event_create',{for:'insert',to:'public',withCheck:sql`${t.actorId}=${actor} and (${childAccess(t.engagementId,t.organizationId,t.projectId,true)} or exists(select 1 from engagements e where e.id=${t.engagementId} and e.organization_id=${t.organizationId} and e.project_id=${t.projectId} and ((${expertRowAccess(sql`e.expert_id`,sql`e.expert_user_id`,sql`e.status`,sql`e.access_expires_at`,sql`e.revoked_at`)}) and e.status in ('Submitted','Accepted','Agreement Pending','Declined') and ${t.action} in ('engagement.accepted','engagement.declined','engagement.quoted','engagement.agreed','engagement.conflict_updated','engagement.canceled') and (${t.payload} - 'from' - 'to') = '{}'::jsonb or (${reviewer} and e.id=(select current_setting('borderless.review_engagement_id',true)) and e.status='Active' and ${t.action}='engagement.activated'))))`})
]).enableRLS();


// Platform authority is explicitly synchronized from server configuration. No
// organization membership, signup or browser-supplied role provisions access.
const platformProvisioner=sql`(select current_setting('borderless.platform_provisioner',true))='on'`;
const platformFlag=sql`(select current_setting('borderless.platform_actor',true))='on'`;
const notificationWorker=sql`(select current_setting('borderless.notification_worker',true))='on'`;
export const platformOperatorGrants=pgTable('platform_operator_grants',{
 userId:text('user_id').primaryKey().references(()=>authUser.id),active:boolean('active').notNull().default(false),source:text('source').notNull().default('server_environment'),
 provisionedAt:time('provisioned_at').notNull().defaultNow(),revokedAt:time('revoked_at'),updatedAt:time('updated_at').notNull().defaultNow()
},t=>[
 pgPolicy('platform_grants_read',{for:'select',to:'public',using:sql`${platformProvisioner} or ${platformFlag}`}),
 pgPolicy('platform_grants_insert',{for:'insert',to:'public',withCheck:platformProvisioner}),
 pgPolicy('platform_grants_update',{for:'update',to:'public',using:platformProvisioner,withCheck:platformProvisioner})
]).enableRLS();
const platformAccess=sql`${platformFlag} and exists(select 1 from platform_operator_grants g where g.user_id=${actor} and g.active)`;
export const salesInquiryNotes=pgTable('sales_inquiry_notes',{
 id:text('id').primaryKey(),inquiryId:text('inquiry_id').notNull().references(()=>enterpriseRequests.id),authorId:text('author_id').notNull().references(()=>authUser.id),body:text('body').notNull(),createdAt:time('created_at').notNull().defaultNow()
},t=>[
 index('sales_note_inquiry_date_idx').on(t.inquiryId,t.createdAt),index('sales_note_author_idx').on(t.authorId),
 pgPolicy('sales_notes_read',{for:'select',to:'public',using:platformAccess}),
 pgPolicy('sales_notes_insert',{for:'insert',to:'public',withCheck:sql`${platformAccess} and ${t.authorId}=${actor}`})
]).enableRLS();
export const salesInquiryActivity=pgTable('sales_inquiry_activity',{
 id:text('id').primaryKey(),inquiryId:text('inquiry_id').notNull().references(()=>enterpriseRequests.id),actorId:text('actor_id').references(()=>authUser.id),action:text('action').notNull(),detail:jsonb('detail').notNull().default({}),createdAt:time('created_at').notNull().defaultNow()
},t=>[
 index('sales_activity_inquiry_date_idx').on(t.inquiryId,t.createdAt),index('sales_activity_actor_idx').on(t.actorId),
 pgPolicy('sales_activity_read',{for:'select',to:'public',using:platformAccess}),
 pgPolicy('sales_activity_insert',{for:'insert',to:'public',withCheck:sql`(${platformAccess} and ${t.actorId}=${actor}) or (${platformProvisioner} and ${t.actorId} is null and ${t.action}='sales.assignee_unassigned')`})
]).enableRLS();
export const notificationOutbox=pgTable('notification_outbox',{
 id:text('id').primaryKey(),event:text('event').notNull(),channel:text('channel').notNull(),aggregateId:text('aggregate_id').notNull(),payload:jsonb('payload').notNull(),
 status:text('status').notNull().default('Pending'),attempts:integer('attempts').notNull().default(0),nextAttemptAt:time('next_attempt_at').defaultNow(),
 leaseToken:text('lease_token'),leaseExpiresAt:time('lease_expires_at'),errorCategory:text('error_category'),uncertain:boolean('uncertain').notNull().default(false),providerMessageId:text('provider_message_id'),
 createdAt:time('created_at').notNull().defaultNow(),updatedAt:time('updated_at').notNull().defaultNow(),sentAt:time('sent_at')
},t=>[
 uniqueIndex('notification_event_aggregate_unique').on(t.event,t.channel,t.aggregateId),index('notification_due_idx').on(t.status,t.nextAttemptAt),index('notification_lease_idx').on(t.leaseExpiresAt),index('notification_aggregate_idx').on(t.aggregateId),
 check('notification_status_check',sql`${t.status} in ('Pending','Sent','Failed','Retry Scheduled','Disabled')`),check('notification_attempts_check',sql`${t.attempts}>=0`),
 pgPolicy('notification_read',{for:'select',to:'public',using:sql`${platformAccess} or ${notificationWorker}`}),
 pgPolicy('notification_insert',{for:'insert',to:'public',withCheck:sql`${platformAccess} or ${notificationWorker}`}),
 pgPolicy('notification_update',{for:'update',to:'public',using:sql`${platformAccess} or ${notificationWorker}`,withCheck:sql`${platformAccess} or ${notificationWorker}`})
]).enableRLS();

export const adminAccounts=pgTable('admin_accounts',{
 userId:text('user_id').primaryKey().references(()=>authUser.id,{onDelete:'cascade'}),loginId:text('login_id').notNull(),isDemo:boolean('is_demo').notNull().default(false),enabled:boolean('enabled').notNull().default(true),createdAt:time('created_at').notNull().defaultNow(),updatedAt:time('updated_at').notNull().defaultNow()
},t=>[uniqueIndex('admin_login_unique').on(t.loginId),index('admin_enabled_idx').on(t.enabled,t.isDemo)]);

const contractPlatform=sql`(current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=${actor} and g.active))`;
const testContractAllowed=sql`current_setting('borderless.contract_test_allowed',true)='on'`;
const assignedEntitlementRead=(org:unknown)=>sql`current_setting('borderless.entitlement_read_org',true)=${org} and exists(select 1 from engagements e where e.id=current_setting('borderless.entitlement_read_engagement',true) and e.organization_id=${org} and e.expert_user_id=${actor} and e.status not in ('Draft','Canceled') and e.revoked_at is null and (e.access_expires_at is null or e.access_expires_at>now()))`;
export const enterpriseContractTemplates=pgTable('enterprise_contract_templates',{
 id:text('id').primaryKey(),name:text('name').notNull(),currentVersion:integer('current_version').notNull().default(1),status:text('status').notNull().default('Active'),createdBy:text('created_by').notNull().references(()=>authUser.id),createdAt:time('created_at').notNull().defaultNow(),updatedAt:time('updated_at').notNull().defaultNow()
},t=>[
 index('enterprise_template_status_idx').on(t.status,t.updatedAt),index('enterprise_template_creator_idx').on(t.createdBy),check('enterprise_template_status_check',sql`${t.status} in ('Active','Inactive','Archived')`),check('enterprise_template_version_check',sql`${t.currentVersion}>0`),
 pgPolicy('enterprise_template_read',{for:'select',to:'public',using:contractPlatform}),pgPolicy('enterprise_template_insert',{for:'insert',to:'public',withCheck:sql`${contractPlatform} and ${t.createdBy}=${actor}`}),pgPolicy('enterprise_template_update',{for:'update',to:'public',using:contractPlatform,withCheck:contractPlatform})
]).enableRLS();
export const enterpriseContractTemplateVersions=pgTable('enterprise_contract_template_versions',{
 templateId:text('template_id').notNull().references(()=>enterpriseContractTemplates.id),version:integer('version').notNull(),payload:jsonb('payload').notNull(),createdBy:text('created_by').notNull().references(()=>authUser.id),createdAt:time('created_at').notNull().defaultNow()
},t=>[
 primaryKey({columns:[t.templateId,t.version]}),index('enterprise_template_version_creator_idx').on(t.createdBy),check('enterprise_template_revision_check',sql`${t.version}>0`),
 pgPolicy('enterprise_template_version_read',{for:'select',to:'public',using:contractPlatform}),pgPolicy('enterprise_template_version_append',{for:'insert',to:'public',withCheck:sql`${contractPlatform} and ${t.createdBy}=${actor}`})
]).enableRLS();
export const enterpriseContracts=pgTable('enterprise_contracts',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),templateId:text('template_id'),templateVersion:integer('template_version'),version:integer('version').notNull(),status:text('status').notNull().default('Approved'),kind:text('kind').notNull(),startsAt:time('starts_at').notNull(),endsAt:time('ends_at').notNull(),contractReference:text('contract_reference').notNull(),notes:text('notes').notNull().default(''),features:jsonb('features').notNull(),limits:jsonb('limits').notNull(),createdBy:text('created_by').notNull().references(()=>authUser.id),approvedBy:text('approved_by').notNull().references(()=>authUser.id),approvedAt:time('approved_at').notNull(),createdAt:time('created_at').notNull().defaultNow(),updatedAt:time('updated_at').notNull().defaultNow()
},t=>[
 unique('enterprise_contract_org_version_unique').on(t.organizationId,t.version),foreignKey({name:'enterprise_contract_template_version_fk',columns:[t.templateId,t.templateVersion],foreignColumns:[enterpriseContractTemplateVersions.templateId,enterpriseContractTemplateVersions.version]}),check('enterprise_contract_template_pair_check',sql`(${t.templateId} is null and ${t.templateVersion} is null) or (${t.templateId} is not null and ${t.templateVersion} is not null)`),index('enterprise_contract_template_idx').on(t.templateId,t.templateVersion),index('enterprise_contract_active_idx').on(t.organizationId,t.status,t.startsAt,t.endsAt),index('enterprise_contract_creator_idx').on(t.createdBy),index('enterprise_contract_approver_idx').on(t.approvedBy),
 check('enterprise_contract_status_check',sql`${t.status} in ('Approved','Suspended','Revoked')`),check('enterprise_contract_kind_check',sql`${t.kind} in ('test','production')`),check('enterprise_contract_term_check',sql`${t.endsAt}>${t.startsAt} and ${t.version}>0`),
 pgPolicy('enterprise_contract_read',{for:'select',to:'public',using:sql`${contractPlatform} or ${companyRead(t.organizationId)} or (${assignedEntitlementRead(t.organizationId)})`}),
 pgPolicy('enterprise_contract_insert',{for:'insert',to:'public',withCheck:sql`${contractPlatform} and ${t.createdBy}=${actor} and ${t.approvedBy}=${actor} and (${t.kind}='production' or ${testContractAllowed})`}),
 pgPolicy('enterprise_contract_status_update',{for:'update',to:'public',using:contractPlatform,withCheck:sql`${contractPlatform} and (${t.kind}='production' or ${testContractAllowed})`})
]).enableRLS();
export const enterpriseContractProposals=pgTable('enterprise_contract_proposals',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),baseVersion:integer('base_version').notNull(),payload:jsonb('payload').notNull(),createdBy:text('created_by').notNull().references(()=>authUser.id),expiresAt:time('expires_at').notNull(),approvedAt:time('approved_at'),createdAt:time('created_at').notNull().defaultNow()
},t=>[
 index('enterprise_proposal_org_idx').on(t.organizationId,t.createdAt),index('enterprise_proposal_creator_idx').on(t.createdBy),
 pgPolicy('enterprise_proposal_read',{for:'select',to:'public',using:contractPlatform}),pgPolicy('enterprise_proposal_insert',{for:'insert',to:'public',withCheck:sql`${contractPlatform} and ${t.createdBy}=${actor}`}),pgPolicy('enterprise_proposal_approve',{for:'update',to:'public',using:contractPlatform,withCheck:contractPlatform})
]).enableRLS();
export const entitlementUsage=pgTable('entitlement_usage',{
 id:text('id').primaryKey(),organizationId:text('organization_id').notNull().references(()=>organizations.id,{onDelete:'cascade'}),period:text('period').notNull(),metric:text('metric').notNull(),subjectId:text('subject_id').notNull(),amount:integer('amount').notNull().default(1),createdAt:time('created_at').notNull().defaultNow()
},t=>[
 unique('entitlement_usage_subject_unique').on(t.organizationId,t.metric,t.subjectId),index('entitlement_usage_period_idx').on(t.organizationId,t.period,t.metric),check('entitlement_usage_amount_check',sql`${t.amount}>0`),check('entitlement_usage_period_check',sql`${t.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
 pgPolicy('entitlement_usage_read',{for:'select',to:'public',using:sql`${companyRead(t.organizationId)} or ${contractPlatform} or (${assignedEntitlementRead(t.organizationId)})`}),
 pgPolicy('entitlement_usage_append',{for:'insert',to:'public',withCheck:sql`${companyWrite(t.organizationId)} or ${contractPlatform}`})
]).enableRLS();

export const userPreferences=pgTable('user_preferences',{
 userId:text('user_id').primaryKey().references(()=>authUser.id,{onDelete:'cascade'}),locale:text('locale').notNull(),updatedAt:time('updated_at').notNull().defaultNow()
},t=>[check('user_preference_locale_check',sql`${t.locale} in ('ko','en')`),pgPolicy('user_preference_owner',{for:'all',to:'public',using:sql`${t.userId}=current_setting('borderless.user_id',true)`,withCheck:sql`${t.userId}=current_setting('borderless.user_id',true)`})]).enableRLS();
