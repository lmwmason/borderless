CREATE TABLE "assessments" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "assessments_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"project_id" text,
	"actor_id" text,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rateLimit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"lastRequest" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_profiles" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "company_profiles_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "company_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contract_acceptances" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"terms_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"terms_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "documents_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "enterprise_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "enterprise_status_check" CHECK ("enterprise_requests"."status" in ('Pending','Approved','Rejected'))
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "findings_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "join_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "join_request_status_check" CHECK ("join_requests"."status" in ('Pending','Approved','Rejected'))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_role_check" CHECK ("memberships"."role" in ('Owner','Admin','Member','Viewer','Pending'))
);
--> statement-breakpoint
CREATE TABLE "organization_workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	CONSTRAINT "workspace_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"plan" text DEFAULT 'Free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider_event_id" text,
	"event_type" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_activity" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "project_activity_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "project_activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "request_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_jobs" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "review_jobs_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "review_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "scenarios_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "scenarios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"provider" text,
	"provider_ref" text,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_status_check" CHECK ("subscriptions"."status" in ('Pending','Active','Failed','Canceled','Expired'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "tasks_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_acceptances" ADD CONSTRAINT "contract_acceptances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_acceptances" ADD CONSTRAINT "contract_acceptances_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD CONSTRAINT "enterprise_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD CONSTRAINT "enterprise_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_workspaces" ADD CONSTRAINT "organization_workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "project_workspace_org_fk" FOREIGN KEY ("organization_id","workspace_id") REFERENCES "public"."organization_workspaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_jobs" ADD CONSTRAINT "review_jobs_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_scope_idx" ON "assessments" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "audit_org_date_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_project_idx" ON "audit_logs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "audit_org_project_idx" ON "audit_logs" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_unique" ON "account" USING btree ("providerId","accountId");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_rate_limit_key_unique" ON "rateLimit" USING btree ("key");--> statement-breakpoint
CREATE INDEX "auth_rate_limit_expiry_idx" ON "rateLimit" USING btree ("lastRequest");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_unique" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "session_expiry_idx" ON "session" USING btree ("expiresAt");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expiry_idx" ON "verification" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "company_profiles_scope_idx" ON "company_profiles" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "contract_org_idx" ON "contract_acceptances" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "contract_actor_idx" ON "contract_acceptances" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "documents_scope_idx" ON "documents" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "enterprise_org_idx" ON "enterprise_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "enterprise_requester_idx" ON "enterprise_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "findings_scope_idx" ON "findings" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_code_unique" ON "invitations" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "invitation_org_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_creator_idx" ON "invitations" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "join_request_org_user_unique" ON "join_requests" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "join_request_user_idx" ON "join_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "join_request_org_status_idx" ON "join_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_org_user_unique" ON "memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_organization_unique" ON "organization_workspaces" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_event_provider_unique" ON "payment_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_event_org_idx" ON "payment_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_activity_scope_idx" ON "project_activity" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "project_workspace_idx" ON "projects" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "request_limit_expiry_idx" ON "request_limits" USING btree ("reset_at");--> statement-breakpoint
CREATE INDEX "review_jobs_scope_idx" ON "review_jobs" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "scenarios_scope_idx" ON "scenarios" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_org_unique" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tasks_scope_idx" ON "tasks" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE POLICY "assessments_tenant_scope" ON "assessments" AS PERMISSIVE FOR ALL TO public USING ("assessments"."organization_id" = (select current_setting('borderless.organization_id', true)) and "assessments"."project_id" = (select current_setting('borderless.project_id', true))) WITH CHECK ("assessments"."organization_id" = (select current_setting('borderless.organization_id', true)) and "assessments"."project_id" = (select current_setting('borderless.project_id', true)));--> statement-breakpoint
CREATE POLICY "company_profiles_tenant_scope" ON "company_profiles" AS PERMISSIVE FOR ALL TO public USING ("company_profiles"."organization_id" = (select current_setting('borderless.organization_id', true)) and "company_profiles"."project_id" = (select current_setting('borderless.project_id', true))) WITH CHECK ("company_profiles"."organization_id" = (select current_setting('borderless.organization_id', true)) and "company_profiles"."project_id" = (select current_setting('borderless.project_id', true)));--> statement-breakpoint
CREATE POLICY "documents_tenant_scope" ON "documents" AS PERMISSIVE FOR ALL TO public USING ("documents"."organization_id" = (select current_setting('borderless.organization_id', true)) and "documents"."project_id" = (select current_setting('borderless.project_id', true))) WITH CHECK ("documents"."organization_id" = (select current_setting('borderless.organization_id', true)) and "documents"."project_id" = (select current_setting('borderless.project_id', true)));--> statement-breakpoint
CREATE POLICY "findings_tenant_scope" ON "findings" AS PERMISSIVE FOR ALL TO public USING ("findings"."organization_id" = (select current_setting('borderless.organization_id', true)) and "findings"."project_id" = (select current_setting('borderless.project_id', true))) WITH CHECK ("findings"."organization_id" = (select current_setting('borderless.organization_id', true)) and "findings"."project_id" = (select current_setting('borderless.project_id', true)));--> statement-breakpoint
CREATE POLICY "project_activity_tenant_scope" ON "project_activity" AS PERMISSIVE FOR ALL TO public USING ("project_activity"."organization_id" = (select current_setting('borderless.organization_id', true)) and "project_activity"."project_id" = (select current_setting('borderless.project_id', true))) WITH CHECK ("project_activity"."organization_id" = (select current_setting('borderless.organization_id', true)) and "project_activity"."project_id" = (select current_setting('borderless.project_id', true)));--> statement-breakpoint
CREATE POLICY "review_jobs_tenant_scope" ON "review_jobs" AS PERMISSIVE FOR ALL TO public USING ("review_jobs"."organization_id" = (select current_setting('borderless.organization_id', true)) and "review_jobs"."project_id" = (select current_setting('borderless.project_id', true))) WITH CHECK ("review_jobs"."organization_id" = (select current_setting('borderless.organization_id', true)) and "review_jobs"."project_id" = (select current_setting('borderless.project_id', true)));--> statement-breakpoint
CREATE POLICY "scenarios_tenant_scope" ON "scenarios" AS PERMISSIVE FOR ALL TO public USING ("scenarios"."organization_id" = (select current_setting('borderless.organization_id', true)) and "scenarios"."project_id" = (select current_setting('borderless.project_id', true))) WITH CHECK ("scenarios"."organization_id" = (select current_setting('borderless.organization_id', true)) and "scenarios"."project_id" = (select current_setting('borderless.project_id', true)));--> statement-breakpoint
CREATE POLICY "tasks_tenant_scope" ON "tasks" AS PERMISSIVE FOR ALL TO public USING ("tasks"."organization_id" = (select current_setting('borderless.organization_id', true)) and "tasks"."project_id" = (select current_setting('borderless.project_id', true))) WITH CHECK ("tasks"."organization_id" = (select current_setting('borderless.organization_id', true)) and "tasks"."project_id" = (select current_setting('borderless.project_id', true)));