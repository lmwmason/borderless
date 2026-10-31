CREATE TABLE "enterprise_contract_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"base_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enterprise_contract_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "enterprise_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'Approved' NOT NULL,
	"kind" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"contract_reference" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"features" jsonb NOT NULL,
	"limits" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enterprise_contract_org_version_unique" UNIQUE("organization_id","version"),
	CONSTRAINT "enterprise_contract_status_check" CHECK ("enterprise_contracts"."status" in ('Approved','Suspended','Revoked')),
	CONSTRAINT "enterprise_contract_kind_check" CHECK ("enterprise_contracts"."kind" in ('test','production')),
	CONSTRAINT "enterprise_contract_term_check" CHECK ("enterprise_contracts"."ends_at">"enterprise_contracts"."starts_at" and "enterprise_contracts"."version">0)
);
--> statement-breakpoint
ALTER TABLE "enterprise_contracts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entitlement_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"period" text NOT NULL,
	"metric" text NOT NULL,
	"subject_id" text NOT NULL,
	"amount" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_usage_subject_unique" UNIQUE("organization_id","metric","subject_id"),
	CONSTRAINT "entitlement_usage_amount_check" CHECK ("entitlement_usage"."amount">0),
	CONSTRAINT "entitlement_usage_period_check" CHECK ("entitlement_usage"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "entitlement_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enterprise_contract_proposals" ADD CONSTRAINT "enterprise_contract_proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_contract_proposals" ADD CONSTRAINT "enterprise_contract_proposals_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_contracts" ADD CONSTRAINT "enterprise_contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_contracts" ADD CONSTRAINT "enterprise_contracts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_contracts" ADD CONSTRAINT "enterprise_contracts_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_usage" ADD CONSTRAINT "entitlement_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enterprise_proposal_org_idx" ON "enterprise_contract_proposals" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "enterprise_proposal_creator_idx" ON "enterprise_contract_proposals" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "enterprise_contract_active_idx" ON "enterprise_contracts" USING btree ("organization_id","status","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "enterprise_contract_creator_idx" ON "enterprise_contracts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "enterprise_contract_approver_idx" ON "enterprise_contracts" USING btree ("approved_by");--> statement-breakpoint
CREATE INDEX "entitlement_usage_period_idx" ON "entitlement_usage" USING btree ("organization_id","period","metric");--> statement-breakpoint
CREATE POLICY "enterprise_proposal_read" ON "enterprise_contract_proposals" AS PERMISSIVE FOR SELECT TO public USING ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)));--> statement-breakpoint
CREATE POLICY "enterprise_proposal_insert" ON "enterprise_contract_proposals" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)) and "enterprise_contract_proposals"."created_by"=(select current_setting('borderless.user_id',true)));--> statement-breakpoint
CREATE POLICY "enterprise_proposal_approve" ON "enterprise_contract_proposals" AS PERMISSIVE FOR UPDATE TO public USING ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active))) WITH CHECK ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)));--> statement-breakpoint
CREATE POLICY "enterprise_contract_read" ON "enterprise_contracts" AS PERMISSIVE FOR SELECT TO public USING ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)) or (exists(select 1 from memberships m where m.organization_id="enterprise_contracts"."organization_id" and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member','Viewer')) and ("enterprise_contracts"."kind"='production' or current_setting('borderless.contract_test_allowed',true)='on')));--> statement-breakpoint
CREATE POLICY "enterprise_contract_insert" ON "enterprise_contracts" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)) and "enterprise_contracts"."created_by"=(select current_setting('borderless.user_id',true)) and "enterprise_contracts"."approved_by"=(select current_setting('borderless.user_id',true)) and ("enterprise_contracts"."kind"='production' or current_setting('borderless.contract_test_allowed',true)='on'));--> statement-breakpoint
CREATE POLICY "enterprise_contract_status_update" ON "enterprise_contracts" AS PERMISSIVE FOR UPDATE TO public USING ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active))) WITH CHECK ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)) and ("enterprise_contracts"."kind"='production' or current_setting('borderless.contract_test_allowed',true)='on'));--> statement-breakpoint
CREATE POLICY "entitlement_usage_read" ON "entitlement_usage" AS PERMISSIVE FOR SELECT TO public USING (exists(select 1 from memberships m where m.organization_id="entitlement_usage"."organization_id" and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member','Viewer')) or (current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)));--> statement-breakpoint
CREATE POLICY "entitlement_usage_append" ON "entitlement_usage" AS PERMISSIVE FOR INSERT TO public WITH CHECK (exists(select 1 from memberships m where m.organization_id="entitlement_usage"."organization_id" and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member')) or (current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)));