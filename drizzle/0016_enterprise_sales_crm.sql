CREATE TABLE "notification_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"channel" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now(),
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"error_category" text,
	"uncertain" boolean DEFAULT false NOT NULL,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notification_status_check" CHECK ("notification_outbox"."status" in ('Pending','Sent','Failed','Retry Scheduled','Disabled')),
	CONSTRAINT "notification_attempts_check" CHECK ("notification_outbox"."attempts">=0)
);
--> statement-breakpoint
ALTER TABLE "notification_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "platform_operator_grants" (
	"user_id" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'server_environment' NOT NULL,
	"provisioned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_operator_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales_inquiry_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"inquiry_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_inquiry_activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales_inquiry_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"inquiry_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_inquiry_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD COLUMN "sales_status" text DEFAULT 'New' NOT NULL;--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD COLUMN "assignee_id" text;--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD COLUMN "request_fingerprint" text;--> statement-breakpoint
ALTER TABLE "platform_operator_grants" ADD CONSTRAINT "platform_operator_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_inquiry_activity" ADD CONSTRAINT "sales_inquiry_activity_inquiry_id_enterprise_requests_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."enterprise_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_inquiry_activity" ADD CONSTRAINT "sales_inquiry_activity_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_inquiry_notes" ADD CONSTRAINT "sales_inquiry_notes_inquiry_id_enterprise_requests_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."enterprise_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_inquiry_notes" ADD CONSTRAINT "sales_inquiry_notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_event_aggregate_unique" ON "notification_outbox" USING btree ("event","channel","aggregate_id");--> statement-breakpoint
CREATE INDEX "notification_due_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_lease_idx" ON "notification_outbox" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "notification_aggregate_idx" ON "notification_outbox" USING btree ("aggregate_id");--> statement-breakpoint
CREATE INDEX "sales_activity_inquiry_date_idx" ON "sales_inquiry_activity" USING btree ("inquiry_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_activity_actor_idx" ON "sales_inquiry_activity" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "sales_note_inquiry_date_idx" ON "sales_inquiry_notes" USING btree ("inquiry_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_note_author_idx" ON "sales_inquiry_notes" USING btree ("author_id");--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD CONSTRAINT "enterprise_requests_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enterprise_sales_updated_idx" ON "enterprise_requests" USING btree ("sales_status","updated_at");--> statement-breakpoint
CREATE INDEX "enterprise_assignee_updated_idx" ON "enterprise_requests" USING btree ("assignee_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_request_key_unique" ON "enterprise_requests" USING btree ("organization_id","request_key");--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD CONSTRAINT "enterprise_sales_status_check" CHECK ("enterprise_requests"."sales_status" in ('New','Contacted','Negotiating','Won','Lost'));--> statement-breakpoint
CREATE POLICY "notification_read" ON "notification_outbox" AS PERMISSIVE FOR SELECT TO public USING ((select current_setting('borderless.platform_actor',true))='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active) or (select current_setting('borderless.notification_worker',true))='on');--> statement-breakpoint
CREATE POLICY "notification_insert" ON "notification_outbox" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((select current_setting('borderless.platform_actor',true))='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active) or (select current_setting('borderless.notification_worker',true))='on');--> statement-breakpoint
CREATE POLICY "notification_update" ON "notification_outbox" AS PERMISSIVE FOR UPDATE TO public USING ((select current_setting('borderless.platform_actor',true))='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active) or (select current_setting('borderless.notification_worker',true))='on') WITH CHECK ((select current_setting('borderless.platform_actor',true))='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active) or (select current_setting('borderless.notification_worker',true))='on');--> statement-breakpoint
CREATE POLICY "platform_grants_read" ON "platform_operator_grants" AS PERMISSIVE FOR SELECT TO public USING ((select current_setting('borderless.platform_provisioner',true))='on' or (select current_setting('borderless.platform_actor',true))='on');--> statement-breakpoint
CREATE POLICY "platform_grants_insert" ON "platform_operator_grants" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((select current_setting('borderless.platform_provisioner',true))='on');--> statement-breakpoint
CREATE POLICY "platform_grants_update" ON "platform_operator_grants" AS PERMISSIVE FOR UPDATE TO public USING ((select current_setting('borderless.platform_provisioner',true))='on') WITH CHECK ((select current_setting('borderless.platform_provisioner',true))='on');--> statement-breakpoint
CREATE POLICY "sales_activity_read" ON "sales_inquiry_activity" AS PERMISSIVE FOR SELECT TO public USING ((select current_setting('borderless.platform_actor',true))='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active));--> statement-breakpoint
CREATE POLICY "sales_activity_insert" ON "sales_inquiry_activity" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((select current_setting('borderless.platform_actor',true))='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active) and "sales_inquiry_activity"."actor_id"=(select current_setting('borderless.user_id',true))) or ((select current_setting('borderless.platform_provisioner',true))='on' and "sales_inquiry_activity"."actor_id" is null and "sales_inquiry_activity"."action"='sales.assignee_unassigned'));--> statement-breakpoint
CREATE POLICY "sales_notes_read" ON "sales_inquiry_notes" AS PERMISSIVE FOR SELECT TO public USING ((select current_setting('borderless.platform_actor',true))='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active));--> statement-breakpoint
CREATE POLICY "sales_notes_insert" ON "sales_inquiry_notes" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((select current_setting('borderless.platform_actor',true))='on' and exists(select 1 from platform_operator_grants g where g.user_id=(select current_setting('borderless.user_id',true)) and g.active) and "sales_inquiry_notes"."author_id"=(select current_setting('borderless.user_id',true)));