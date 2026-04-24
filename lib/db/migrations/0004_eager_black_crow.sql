CREATE TABLE "ingestion_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"dsp" text NOT NULL,
	"period" text NOT NULL,
	"filename" text NOT NULL,
	"uploaded_by" integer,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"inserted_rows" integer DEFAULT 0 NOT NULL,
	"unmatched_rows" integer DEFAULT 0 NOT NULL,
	"total_revenue" numeric(14, 4) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_unmatched" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"dsp" text NOT NULL,
	"period" text NOT NULL,
	"raw_isrc" text,
	"raw_title" text,
	"raw_artist" text,
	"revenue" numeric(12, 4) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"country_code" text,
	"streams" integer DEFAULT 0 NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingestion_imports" ADD CONSTRAINT "ingestion_imports_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_unmatched" ADD CONSTRAINT "ingestion_unmatched_import_id_ingestion_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."ingestion_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_imports_idempotency_uniq" ON "ingestion_imports" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ingestion_imports_dsp_period_idx" ON "ingestion_imports" USING btree ("dsp","period");--> statement-breakpoint
CREATE INDEX "ingestion_imports_created_idx" ON "ingestion_imports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ingestion_unmatched_import_idx" ON "ingestion_unmatched" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "ingestion_unmatched_isrc_idx" ON "ingestion_unmatched" USING btree ("raw_isrc");--> statement-breakpoint
CREATE INDEX "ingestion_unmatched_resolved_idx" ON "ingestion_unmatched" USING btree ("resolved");