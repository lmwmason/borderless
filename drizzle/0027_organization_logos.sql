CREATE TABLE "organization_logo_cleanup" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"error_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_logo_cleanup_status_check" CHECK ("organization_logo_cleanup"."status" in ('Pending','Processing','Done') and "organization_logo_cleanup"."attempts">=0)
);
--> statement-breakpoint
ALTER TABLE "organization_logo_cleanup" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_logos" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text DEFAULT 'image/webp' NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_logo_safe_metadata" CHECK ("organization_logos"."mime_type"='image/webp' and "organization_logos"."bytes">0 and "organization_logos"."bytes"<=2097152 and "organization_logos"."width">0 and "organization_logos"."width"<=4096 and "organization_logos"."height">0 and "organization_logos"."height"<=4096)
);
--> statement-breakpoint
ALTER TABLE "organization_logos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_logos" ADD CONSTRAINT "organization_logos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_logos" ADD CONSTRAINT "organization_logos_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_logo_cleanup_key_unique" ON "organization_logo_cleanup" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "organization_logo_cleanup_due_idx" ON "organization_logo_cleanup" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "organization_logo_cleanup_lease_idx" ON "organization_logo_cleanup" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_logo_org_unique" ON "organization_logos" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_logo_key_unique" ON "organization_logos" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "organization_logo_uploader_idx" ON "organization_logos" USING btree ("uploaded_by");--> statement-breakpoint
CREATE POLICY "organization_logo_cleanup_worker" ON "organization_logo_cleanup" AS PERMISSIVE FOR ALL TO public USING (current_setting('borderless.logo_cleanup_worker',true)='on') WITH CHECK (current_setting('borderless.logo_cleanup_worker',true)='on');--> statement-breakpoint
CREATE POLICY "organization_logo_read" ON "organization_logos" AS PERMISSIVE FOR SELECT TO public USING (exists(select 1 from memberships m where m.organization_id="organization_logos"."organization_id" and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member','Viewer')) or (current_setting('borderless.platform_actor',true)='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active)) or current_setting('borderless.logo_cleanup_worker',true)='on');--> statement-breakpoint
CREATE POLICY "organization_logo_insert" ON "organization_logos" AS PERMISSIVE FOR INSERT TO public WITH CHECK (exists(select 1 from memberships m where m.organization_id="organization_logos"."organization_id" and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin')) and "organization_logos"."uploaded_by"=(select current_setting('borderless.user_id',true)));--> statement-breakpoint
CREATE POLICY "organization_logo_update" ON "organization_logos" AS PERMISSIVE FOR UPDATE TO public USING (exists(select 1 from memberships m where m.organization_id="organization_logos"."organization_id" and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin'))) WITH CHECK (exists(select 1 from memberships m where m.organization_id="organization_logos"."organization_id" and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin')) and "organization_logos"."uploaded_by"=(select current_setting('borderless.user_id',true)));--> statement-breakpoint
CREATE POLICY "organization_logo_delete" ON "organization_logos" AS PERMISSIVE FOR DELETE TO public USING (exists(select 1 from memberships m where m.organization_id="organization_logos"."organization_id" and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin')));
--> statement-breakpoint
ALTER TABLE organization_logos FORCE ROW LEVEL SECURITY;
ALTER TABLE organization_logo_cleanup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON organization_logos,organization_logo_cleanup FROM PUBLIC;
DO $$ DECLARE runtime_role text:=current_database()||'_runtime';auth_role text:=current_database()||'_auth'; BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON organization_logos TO %I',runtime_role);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON organization_logo_cleanup TO %I',runtime_role);
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=auth_role) THEN EXECUTE format('REVOKE ALL ON organization_logos,organization_logo_cleanup FROM %I',auth_role); END IF;
END $$;
