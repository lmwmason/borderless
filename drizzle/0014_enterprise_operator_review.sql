ALTER TABLE "enterprise_requests" DROP CONSTRAINT "enterprise_status_check";--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD COLUMN "review_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD CONSTRAINT "enterprise_requests_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_requests" ADD CONSTRAINT "enterprise_status_check" CHECK ("enterprise_requests"."status" in ('Pending','In Review','Closed','Approved','Rejected'));