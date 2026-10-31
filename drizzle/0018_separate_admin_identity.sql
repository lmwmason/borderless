CREATE TABLE "admin_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"login_id" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_login_unique" ON "admin_accounts" USING btree ("login_id");--> statement-breakpoint
CREATE INDEX "admin_enabled_idx" ON "admin_accounts" USING btree ("enabled","is_demo");