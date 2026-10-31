CREATE TABLE "change_impacts" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "change_impacts_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
ALTER TABLE "change_impacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "change_impacts" ADD CONSTRAINT "change_impacts_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_impacts_scope_idx" ON "change_impacts" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE POLICY "change_impacts_tenant_scope" ON "change_impacts" AS PERMISSIVE FOR ALL TO public USING ("change_impacts"."organization_id" = (select current_setting('borderless.organization_id', true)) and "change_impacts"."project_id" = (select current_setting('borderless.project_id', true))) WITH CHECK ("change_impacts"."organization_id" = (select current_setting('borderless.organization_id', true)) and "change_impacts"."project_id" = (select current_setting('borderless.project_id', true)));