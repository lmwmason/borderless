CREATE TABLE "enterprise_contract_template_versions" (
	"template_id" text NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enterprise_contract_template_versions_template_id_version_pk" PRIMARY KEY("template_id","version"),
	CONSTRAINT "enterprise_template_revision_check" CHECK ("enterprise_contract_template_versions"."version">0)
);
--> statement-breakpoint
ALTER TABLE "enterprise_contract_template_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "enterprise_contract_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enterprise_template_status_check" CHECK ("enterprise_contract_templates"."status" in ('Active','Inactive','Archived')),
	CONSTRAINT "enterprise_template_version_check" CHECK ("enterprise_contract_templates"."current_version">0)
);
--> statement-breakpoint
ALTER TABLE "enterprise_contract_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enterprise_contracts" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "enterprise_contracts" ADD COLUMN "template_version" integer;--> statement-breakpoint
ALTER TABLE "enterprise_contract_template_versions" ADD CONSTRAINT "enterprise_contract_template_versions_template_id_enterprise_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."enterprise_contract_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_contract_template_versions" ADD CONSTRAINT "enterprise_contract_template_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_contract_templates" ADD CONSTRAINT "enterprise_contract_templates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enterprise_template_version_creator_idx" ON "enterprise_contract_template_versions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "enterprise_template_status_idx" ON "enterprise_contract_templates" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "enterprise_template_creator_idx" ON "enterprise_contract_templates" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "enterprise_contracts" ADD CONSTRAINT "enterprise_contract_template_version_fk" FOREIGN KEY ("template_id","template_version") REFERENCES "public"."enterprise_contract_template_versions"("template_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enterprise_contract_template_idx" ON "enterprise_contracts" USING btree ("template_id","template_version");--> statement-breakpoint
ALTER TABLE "enterprise_contracts" ADD CONSTRAINT "enterprise_contract_template_pair_check" CHECK (("enterprise_contracts"."template_id" is null and "enterprise_contracts"."template_version" is null) or ("enterprise_contracts"."template_id" is not null and "enterprise_contracts"."template_version" is not null));--> statement-breakpoint
CREATE POLICY "enterprise_template_version_read" ON "enterprise_contract_template_versions" AS PERMISSIVE FOR SELECT TO public USING ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)));--> statement-breakpoint
CREATE POLICY "enterprise_template_version_append" ON "enterprise_contract_template_versions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)) and "enterprise_contract_template_versions"."created_by"=(select current_setting('borderless.user_id',true)));--> statement-breakpoint
CREATE POLICY "enterprise_template_read" ON "enterprise_contract_templates" AS PERMISSIVE FOR SELECT TO public USING ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)));--> statement-breakpoint
CREATE POLICY "enterprise_template_insert" ON "enterprise_contract_templates" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)) and "enterprise_contract_templates"."created_by"=(select current_setting('borderless.user_id',true)));--> statement-breakpoint
CREATE POLICY "enterprise_template_update" ON "enterprise_contract_templates" AS PERMISSIVE FOR UPDATE TO public USING ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active))) WITH CHECK ((current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)));