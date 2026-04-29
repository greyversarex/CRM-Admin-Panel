CREATE TABLE IF NOT EXISTS "rights_holders" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_type" text NOT NULL,
	"track_id" integer,
	"release_id" integer,
	"holder_type" text NOT NULL,
	"holder_name" text NOT NULL,
	"holder_artist_id" integer,
	"holder_label_id" integer,
	"rights_type" text DEFAULT 'master' NOT NULL,
	"share_pct" numeric(6, 3) DEFAULT '100' NOT NULL,
	"territory" text DEFAULT 'WW' NOT NULL,
	"exclusive" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"notes" text,
	"frozen" boolean DEFAULT false NOT NULL,
	"frozen_reason" text,
	"frozen_by" integer,
	"frozen_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rights_conflicts" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_type" text NOT NULL,
	"track_id" integer,
	"release_id" integer,
	"conflict_type" text NOT NULL,
	"claimant_name" text NOT NULL,
	"claimant_info" text,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"description" text NOT NULL,
	"resolution_note" text,
	"opened_by" integer,
	"resolved_by" integer,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"secret" text,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"last_status" integer,
	"last_error" text,
	"retry_count" integer DEFAULT 3 NOT NULL,
	"timeout_ms" integer DEFAULT 5000 NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automation_triggers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"event" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"template_id" integer,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"recipient" text DEFAULT 'requester' NOT NULL,
	"last_fired_at" timestamp with time zone,
	"fire_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'email' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"template_id" integer,
	"subject" text,
	"audience_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"open_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'email' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "internal_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"body" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"author_user_id" integer,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dsp_deals" (
	"id" serial PRIMARY KEY NOT NULL,
	"dsp_name" text NOT NULL,
	"deal_type" text DEFAULT 'distribution' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"revenue_share" text,
	"territory" text DEFAULT 'WW' NOT NULL,
	"contract_ref" text,
	"notes" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_id_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_type" text NOT NULL,
	"track_id" integer,
	"release_id" integer,
	"yt_asset_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"claim_policy" text DEFAULT 'monetize' NOT NULL,
	"ownership" text DEFAULT 'WW' NOT NULL,
	"notes" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"registered_by" integer,
	"registered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fraud_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer,
	"rule_name" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"release_id" integer,
	"track_id" integer,
	"user_id" integer,
	"description" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_by" integer,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fraud_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rule_type" text NOT NULL,
	"threshold" integer DEFAULT 0 NOT NULL,
	"window_minutes" integer DEFAULT 60 NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moderation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"field" text NOT NULL,
	"rule_type" text NOT NULL,
	"pattern" text,
	"min_length" integer,
	"max_length" integer,
	"block_on_fail" boolean DEFAULT false NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commission_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"label_id" integer,
	"artist_id" integer,
	"dsp_code" text,
	"percentage" numeric(6, 4) NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_automation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"threshold_cents" integer DEFAULT 0 NOT NULL,
	"schedule_cron" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"notes" text,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ugc_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"external_content_id" text,
	"release_id" integer,
	"track_id" integer,
	"views" bigint DEFAULT 0 NOT NULL,
	"likes" bigint DEFAULT 0 NOT NULL,
	"shares" bigint DEFAULT 0 NOT NULL,
	"videos_count" integer DEFAULT 0 NOT NULL,
	"revenue_cents" bigint DEFAULT 0 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "realtime_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"message" text NOT NULL,
	"entity_type" text,
	"entity_id" integer,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publishing_conflicts" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_id" integer,
	"conflict_type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"description" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" integer,
	"resolution_note" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acr_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"release_id" integer,
	"track_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"confidence" numeric(5, 2),
	"matched_title" text,
	"matched_artist" text,
	"matched_isrc" text,
	"matched_label" text,
	"result_json" jsonb,
	"error_message" text,
	"scanned_by" integer,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "releases_upc_idx";--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "approval_stage" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "approved_l1_by" integer;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "approved_l1_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "approved_l2_by" integer;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "approved_l2_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "two_step_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rights_holders" ADD CONSTRAINT "rights_holders_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rights_holders" ADD CONSTRAINT "rights_holders_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rights_holders" ADD CONSTRAINT "rights_holders_holder_artist_id_artists_id_fk" FOREIGN KEY ("holder_artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rights_holders" ADD CONSTRAINT "rights_holders_holder_label_id_labels_id_fk" FOREIGN KEY ("holder_label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rights_holders" ADD CONSTRAINT "rights_holders_frozen_by_users_id_fk" FOREIGN KEY ("frozen_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rights_holders" ADD CONSTRAINT "rights_holders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rights_conflicts" ADD CONSTRAINT "rights_conflicts_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rights_conflicts" ADD CONSTRAINT "rights_conflicts_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rights_conflicts" ADD CONSTRAINT "rights_conflicts_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rights_conflicts" ADD CONSTRAINT "rights_conflicts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "dsp_deals" ADD CONSTRAINT "dsp_deals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "content_id_assets" ADD CONSTRAINT "content_id_assets_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "content_id_assets" ADD CONSTRAINT "content_id_assets_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "content_id_assets" ADD CONSTRAINT "content_id_assets_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_rule_id_fraud_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."fraud_rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ugc_metrics" ADD CONSTRAINT "ugc_metrics_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ugc_metrics" ADD CONSTRAINT "ugc_metrics_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "realtime_alerts" ADD CONSTRAINT "realtime_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "publishing_conflicts" ADD CONSTRAINT "publishing_conflicts_work_id_publishing_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."publishing_works"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "publishing_conflicts" ADD CONSTRAINT "publishing_conflicts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "acr_checks" ADD CONSTRAINT "acr_checks_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "acr_checks" ADD CONSTRAINT "acr_checks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "acr_checks" ADD CONSTRAINT "acr_checks_scanned_by_users_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rh_track_idx" ON "rights_holders" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rh_release_idx" ON "rights_holders" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rh_holder_artist_idx" ON "rights_holders" USING btree ("holder_artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rh_holder_label_idx" ON "rights_holders" USING btree ("holder_label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rh_asset_type_idx" ON "rights_holders" USING btree ("asset_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rh_rights_type_idx" ON "rights_holders" USING btree ("rights_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rc_track_idx" ON "rights_conflicts" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rc_release_idx" ON "rights_conflicts" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rc_status_idx" ON "rights_conflicts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rc_priority_idx" ON "rights_conflicts" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rc_conflict_type_idx" ON "rights_conflicts" USING btree ("conflict_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rc_opened_by_idx" ON "rights_conflicts" USING btree ("opened_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_settings_key_idx" ON "platform_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_enabled_idx" ON "api_keys" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhooks_enabled_idx" ON "webhooks" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhooks_created_idx" ON "webhooks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_triggers_event_idx" ON "automation_triggers" USING btree ("event","enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_status_idx" ON "campaigns" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_templates_type_idx" ON "email_templates" USING btree ("type","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "internal_notes_entity_idx" ON "internal_notes" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "internal_notes_author_idx" ON "internal_notes" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_deals_dsp_idx" ON "dsp_deals" USING btree ("dsp_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsp_deals_status_idx" ON "dsp_deals" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_id_assets_track_idx" ON "content_id_assets" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_id_assets_release_idx" ON "content_id_assets" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_id_assets_status_idx" ON "content_id_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fraud_alerts_status_idx" ON "fraud_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fraud_alerts_severity_idx" ON "fraud_alerts" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fraud_rules_enabled_idx" ON "fraud_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_rules_enabled_idx" ON "moderation_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_rules_field_idx" ON "moderation_rules" USING btree ("field");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_rules_scope_idx" ON "commission_rules" USING btree ("scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_rules_label_idx" ON "commission_rules" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_automation_rules_enabled_idx" ON "payment_automation_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_automation_rules_kind_idx" ON "payment_automation_rules" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ugc_metrics_platform_idx" ON "ugc_metrics" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ugc_metrics_release_idx" ON "ugc_metrics" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ugc_metrics_recorded_idx" ON "ugc_metrics" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "realtime_alerts_kind_idx" ON "realtime_alerts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "realtime_alerts_severity_idx" ON "realtime_alerts" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "realtime_alerts_created_idx" ON "realtime_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishing_conflicts_work_idx" ON "publishing_conflicts" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishing_conflicts_resolved_idx" ON "publishing_conflicts" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acr_checks_release_idx" ON "acr_checks" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acr_checks_track_idx" ON "acr_checks" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acr_checks_status_idx" ON "acr_checks" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "releases_upc_unique_idx" ON "releases" USING btree ("upc") WHERE "releases"."upc" IS NOT NULL AND "releases"."upc" <> '';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payouts_approval_stage_idx" ON "payouts" USING btree ("approval_stage");