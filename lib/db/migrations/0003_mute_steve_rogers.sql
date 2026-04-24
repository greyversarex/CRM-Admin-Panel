ALTER TABLE "deliveries" ALTER COLUMN "status" SET DEFAULT 'queued';--> statement-breakpoint
ALTER TABLE "deliveries" ALTER COLUMN "ddex_version" SET DEFAULT '4.3';--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "xml_payload" text;--> statement-breakpoint
CREATE INDEX "deliveries_queue_idx" ON "deliveries" USING btree ("status","next_retry_at");--> statement-breakpoint
-- Data migration: remap legacy status values to new enum (Task #4)
UPDATE "deliveries" SET "status" = 'queued'     WHERE "status" = 'pending';
--> statement-breakpoint
UPDATE "deliveries" SET "status" = 'processing' WHERE "status" = 'in_progress';
