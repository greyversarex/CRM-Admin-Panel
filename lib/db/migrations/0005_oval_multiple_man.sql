ALTER TABLE "transactions" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "import_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_ingestion_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."ingestion_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_source_idx" ON "transactions" USING btree ("source");--> statement-breakpoint
CREATE INDEX "transactions_import_idx" ON "transactions" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_reports_dedup_uniq" ON "usage_reports" USING btree ("platform","period","track_id",coalesce("country_code", '_'));