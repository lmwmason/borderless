CREATE TABLE "engagement_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"engagement_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"author_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagement_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "engagement_events" (
	"id" text PRIMARY KEY NOT NULL,
	"engagement_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagement_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "engagement_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"engagement_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"resource_kind" text NOT NULL,
	"resource_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagement_resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "engagements" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"expert_id" text NOT NULL,
	"expert_user_id" text NOT NULL,
	"created_by" text NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"payload" jsonb NOT NULL,
	"access_expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_id_org_project_unique" UNIQUE("id","organization_id","project_id"),
	CONSTRAINT "engagement_status_check" CHECK ("engagements"."status" in ('Draft','Submitted','Accepted','Declined','Agreement Pending','Active','Completed','Canceled'))
);
--> statement-breakpoint
ALTER TABLE "engagements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expert_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"payload" jsonb NOT NULL,
	"public_payload" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expert_profile_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "expert_profile_status_check" CHECK ("expert_profiles"."status" in ('Draft','Pending Verification','Verified','Rejected')),
	CONSTRAINT "expert_profile_visibility_check" CHECK ("expert_profiles"."visibility" in ('private','public'))
);
--> statement-breakpoint
ALTER TABLE "expert_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expert_services" (
	"id" text PRIMARY KEY NOT NULL,
	"expert_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"public_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expert_services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "engagement_entries" ADD CONSTRAINT "engagement_entries_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_entries" ADD CONSTRAINT "engagement_entry_parent_fk" FOREIGN KEY ("engagement_id","organization_id","project_id") REFERENCES "public"."engagements"("id","organization_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_event_parent_fk" FOREIGN KEY ("engagement_id","organization_id","project_id") REFERENCES "public"."engagements"("id","organization_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_resources" ADD CONSTRAINT "engagement_resource_parent_fk" FOREIGN KEY ("engagement_id","organization_id","project_id") REFERENCES "public"."engagements"("id","organization_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_expert_id_expert_profiles_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."expert_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_expert_user_id_user_id_fk" FOREIGN KEY ("expert_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagement_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagement_assigned_expert_fk" FOREIGN KEY ("expert_id","expert_user_id") REFERENCES "public"."expert_profiles"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_services" ADD CONSTRAINT "expert_services_expert_id_expert_profiles_id_fk" FOREIGN KEY ("expert_id") REFERENCES "public"."expert_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "engagement_entry_parent_idx" ON "engagement_entries" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "engagement_entry_project_idx" ON "engagement_entries" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "engagement_entry_author_idx" ON "engagement_entries" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "engagement_event_parent_idx" ON "engagement_events" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "engagement_event_project_idx" ON "engagement_events" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "engagement_event_actor_idx" ON "engagement_events" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_resource_unique" ON "engagement_resources" USING btree ("engagement_id","resource_kind","resource_id");--> statement-breakpoint
CREATE INDEX "engagement_resource_project_idx" ON "engagement_resources" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "engagement_project_idx" ON "engagements" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "engagement_expert_idx" ON "engagements" USING btree ("expert_id");--> statement-breakpoint
CREATE INDEX "engagement_expert_user_idx" ON "engagements" USING btree ("expert_user_id");--> statement-breakpoint
CREATE INDEX "engagement_creator_idx" ON "engagements" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "expert_profile_user_unique" ON "expert_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "expert_profile_directory_idx" ON "expert_profiles" USING btree ("visibility","status");--> statement-breakpoint
CREATE INDEX "expert_service_profile_idx" ON "expert_services" USING btree ("expert_id");--> statement-breakpoint
CREATE POLICY "engagement_entry_read" ON "engagement_entries" AS PERMISSIVE FOR SELECT TO public USING (exists(select 1 from engagements e where e.id="engagement_entries"."engagement_id" and e.organization_id="engagement_entries"."organization_id" and e.project_id="engagement_entries"."project_id" and (exists(select 1 from memberships m where m.organization_id=e.organization_id and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member','Viewer')) or (e.expert_user_id=(select current_setting('borderless.user_id',true)) and e.status in ('Active','Completed') and e.revoked_at is null and (e.access_expires_at is null or e.access_expires_at>now())))));--> statement-breakpoint
CREATE POLICY "engagement_entry_write" ON "engagement_entries" AS PERMISSIVE FOR ALL TO public USING (exists(select 1 from engagements e where e.id="engagement_entries"."engagement_id" and e.organization_id="engagement_entries"."organization_id" and e.project_id="engagement_entries"."project_id" and (exists(select 1 from memberships m where m.organization_id=e.organization_id and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member')) or (e.expert_user_id=(select current_setting('borderless.user_id',true)) and e.status in ('Active') and e.revoked_at is null and (e.access_expires_at is null or e.access_expires_at>now()))))) WITH CHECK (exists(select 1 from engagements e where e.id="engagement_entries"."engagement_id" and e.organization_id="engagement_entries"."organization_id" and e.project_id="engagement_entries"."project_id" and (exists(select 1 from memberships m where m.organization_id=e.organization_id and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member')) or (e.expert_user_id=(select current_setting('borderless.user_id',true)) and e.status in ('Active') and e.revoked_at is null and (e.access_expires_at is null or e.access_expires_at>now())))) and "engagement_entries"."author_id"=(select current_setting('borderless.user_id',true)));--> statement-breakpoint
CREATE POLICY "engagement_event_read" ON "engagement_events" AS PERMISSIVE FOR SELECT TO public USING (exists(select 1 from engagements e where e.id="engagement_events"."engagement_id" and e.organization_id="engagement_events"."organization_id" and e.project_id="engagement_events"."project_id" and (exists(select 1 from memberships m where m.organization_id=e.organization_id and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member','Viewer')) or (e.expert_user_id=(select current_setting('borderless.user_id',true)) and e.status in ('Active','Completed') and e.revoked_at is null and (e.access_expires_at is null or e.access_expires_at>now())))));--> statement-breakpoint
CREATE POLICY "engagement_event_create" ON "engagement_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (exists(select 1 from engagements e where e.id="engagement_events"."engagement_id" and e.organization_id="engagement_events"."organization_id" and e.project_id="engagement_events"."project_id" and (exists(select 1 from memberships m where m.organization_id=e.organization_id and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member')) or (e.expert_user_id=(select current_setting('borderless.user_id',true)) and e.status in ('Active') and e.revoked_at is null and (e.access_expires_at is null or e.access_expires_at>now())))) and "engagement_events"."actor_id"=(select current_setting('borderless.user_id',true)));--> statement-breakpoint
CREATE POLICY "engagement_resource_read" ON "engagement_resources" AS PERMISSIVE FOR SELECT TO public USING (exists(select 1 from engagements e where e.id="engagement_resources"."engagement_id" and e.organization_id="engagement_resources"."organization_id" and e.project_id="engagement_resources"."project_id" and (exists(select 1 from memberships m where m.organization_id=e.organization_id and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member','Viewer')) or (e.expert_user_id=(select current_setting('borderless.user_id',true)) and e.status in ('Active','Completed') and e.revoked_at is null and (e.access_expires_at is null or e.access_expires_at>now())))));--> statement-breakpoint
CREATE POLICY "engagement_resource_write" ON "engagement_resources" AS PERMISSIVE FOR ALL TO public USING (exists(select 1 from engagements e where e.id="engagement_resources"."engagement_id" and e.organization_id="engagement_resources"."organization_id" and e.project_id="engagement_resources"."project_id" and (exists(select 1 from memberships m where m.organization_id=e.organization_id and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member')) or (e.expert_user_id=(select current_setting('borderless.user_id',true)) and e.status in ('Active') and e.revoked_at is null and (e.access_expires_at is null or e.access_expires_at>now()))))) WITH CHECK (exists(select 1 from engagements e where e.id="engagement_resources"."engagement_id" and e.organization_id="engagement_resources"."organization_id" and e.project_id="engagement_resources"."project_id" and (exists(select 1 from memberships m where m.organization_id=e.organization_id and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member')) or (e.expert_user_id=(select current_setting('borderless.user_id',true)) and e.status in ('Active') and e.revoked_at is null and (e.access_expires_at is null or e.access_expires_at>now())))));--> statement-breakpoint
CREATE POLICY "engagement_read" ON "engagements" AS PERMISSIVE FOR SELECT TO public USING (exists(select 1 from memberships m where m.organization_id="engagements"."organization_id" and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member','Viewer')) or ("engagements"."expert_user_id"=(select current_setting('borderless.user_id',true)) and "engagements"."status"<>'Draft' and "engagements"."revoked_at" is null and ("engagements"."access_expires_at" is null or "engagements"."access_expires_at">now()) and exists(select 1 from expert_profiles p where p.id="engagements"."expert_id" and p.user_id=(select current_setting('borderless.user_id',true)) and p.status in ('Pending Verification','Verified'))) or ((select current_setting('borderless.expert_reviewer',true)) = 'on' and "engagements"."id"=(select current_setting('borderless.expert_review_engagement_id',true))));--> statement-breakpoint
CREATE POLICY "engagement_create" ON "engagements" AS PERMISSIVE FOR INSERT TO public WITH CHECK (exists(select 1 from memberships m where m.organization_id="engagements"."organization_id" and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member')) and "engagements"."created_by"=(select current_setting('borderless.user_id',true)) and "engagements"."status"='Draft');--> statement-breakpoint
CREATE POLICY "engagement_update" ON "engagements" AS PERMISSIVE FOR UPDATE TO public USING (exists(select 1 from memberships m where m.organization_id="engagements"."organization_id" and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member')) or ("engagements"."expert_user_id"=(select current_setting('borderless.user_id',true)) and "engagements"."status"<>'Draft' and "engagements"."revoked_at" is null and ("engagements"."access_expires_at" is null or "engagements"."access_expires_at">now()) and exists(select 1 from expert_profiles p where p.id="engagements"."expert_id" and p.user_id=(select current_setting('borderless.user_id',true)) and p.status in ('Pending Verification','Verified')))) WITH CHECK (exists(select 1 from memberships m where m.organization_id="engagements"."organization_id" and m.user_id=(select current_setting('borderless.user_id',true)) and m.role in ('Owner','Admin','Member')) or ("engagements"."expert_user_id"=(select current_setting('borderless.user_id',true)) and "engagements"."status"<>'Draft' and "engagements"."revoked_at" is null and ("engagements"."access_expires_at" is null or "engagements"."access_expires_at">now()) and exists(select 1 from expert_profiles p where p.id="engagements"."expert_id" and p.user_id=(select current_setting('borderless.user_id',true)) and p.status in ('Pending Verification','Verified'))));--> statement-breakpoint
CREATE POLICY "expert_profile_read" ON "expert_profiles" AS PERMISSIVE FOR SELECT TO public USING ("expert_profiles"."user_id"=(select current_setting('borderless.user_id',true)) or (select current_setting('borderless.expert_reviewer',true)) = 'on');--> statement-breakpoint
CREATE POLICY "expert_profile_create" ON "expert_profiles" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("expert_profiles"."user_id"=(select current_setting('borderless.user_id',true)) and "expert_profiles"."status"='Draft');--> statement-breakpoint
CREATE POLICY "expert_profile_update" ON "expert_profiles" AS PERMISSIVE FOR UPDATE TO public USING ("expert_profiles"."user_id"=(select current_setting('borderless.user_id',true)) or ((select current_setting('borderless.expert_reviewer',true)) = 'on' and "expert_profiles"."user_id"<>(select current_setting('borderless.user_id',true)))) WITH CHECK (("expert_profiles"."user_id"=(select current_setting('borderless.user_id',true)) and "expert_profiles"."status" in ('Draft','Pending Verification')) or ((select current_setting('borderless.expert_reviewer',true)) = 'on' and "expert_profiles"."user_id"<>(select current_setting('borderless.user_id',true))));--> statement-breakpoint
CREATE POLICY "expert_service_owner" ON "expert_services" AS PERMISSIVE FOR ALL TO public USING (exists(select 1 from expert_profiles p where p.id="expert_services"."expert_id" and p.user_id=(select current_setting('borderless.user_id',true)))) WITH CHECK (exists(select 1 from expert_profiles p where p.id="expert_services"."expert_id" and p.user_id=(select current_setting('borderless.user_id',true))));