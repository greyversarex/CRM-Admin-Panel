ALTER TABLE "labels" ADD COLUMN "copyright_strikes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "risk_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "risk_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "risk_factors" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "acr_checks" ADD COLUMN "mode" text DEFAULT 'sample' NOT NULL;--> statement-breakpoint
ALTER TABLE "acr_checks" ADD COLUMN "engine" text DEFAULT 'acrcloud' NOT NULL;--> statement-breakpoint
ALTER TABLE "acr_checks" ADD COLUMN "segments" jsonb;--> statement-breakpoint
CREATE INDEX "labels_strikes_idx" ON "labels" USING btree ("copyright_strikes");--> statement-breakpoint
CREATE INDEX "acr_checks_engine_idx" ON "acr_checks" USING btree ("engine");