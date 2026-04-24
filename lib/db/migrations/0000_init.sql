CREATE TABLE IF NOT EXISTS "labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"country" text,
	"website" text,
	"parent_label_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "artists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"image_url" text,
	"genre" text,
	"bio" text,
	"country" text,
	"label_id" integer,
	"spotify_id" text,
	"apple_id" text,
	"social_links" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "releases" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"release_type" text DEFAULT 'single' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"upc" text,
	"artist_id" integer NOT NULL,
	"label_id" integer,
	"cover_url" text,
	"genre" text,
	"release_date" text,
	"language" text,
	"is_explicit" boolean DEFAULT false NOT NULL,
	"territories" text[] DEFAULT '{"WW"}' NOT NULL,
	"p_line" text,
	"c_line" text,
	"status_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"isrc" text,
	"release_id" integer,
	"artist_id" integer NOT NULL,
	"track_number" integer,
	"duration_seconds" integer,
	"genre" text,
	"language" text,
	"is_explicit" boolean DEFAULT false NOT NULL,
	"composer_name" text,
	"lyricist_name" text,
	"iswc" text,
	"audio_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'artist' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"avatar_url" text,
	"artist_id" integer,
	"label_id" integer,
	"phone" text,
	"address" text,
	"country" text,
	"region" text,
	"city" text,
	"zip_code" text,
	"about" text,
	"dsp_profiles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'artist' NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"country" text,
	"notes" text,
	"telegram" text,
	"whatsapp" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"assigned_to_id" integer,
	"due_date" text,
	"related_entity_type" text,
	"related_entity_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"artist_id" integer,
	"label_id" integer,
	"release_id" integer,
	"platform" text,
	"description" text,
	"period" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "splits" (
	"id" serial PRIMARY KEY NOT NULL,
	"release_id" integer,
	"track_id" integer,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"artist_id" integer,
	"label_id" integer,
	"amount" numeric(12, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_details" text,
	"rejection_reason" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publishing_works" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"iswc" text,
	"isrc" text,
	"track_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"writers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"publisher" text,
	"territory" text[] DEFAULT '{"WW"}' NOT NULL,
	"registered_with" text[] DEFAULT '{}' NOT NULL,
	"mlc_song_code" text,
	"songtrust" boolean DEFAULT false NOT NULL,
	"ascap" boolean DEFAULT false NOT NULL,
	"bmi" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"artist_id" integer,
	"release_id" integer,
	"track_id" integer,
	"platform" text NOT NULL,
	"period" text NOT NULL,
	"streams" integer DEFAULT 0 NOT NULL,
	"revenue" numeric(12, 4) DEFAULT '0' NOT NULL,
	"country_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"release_id" integer NOT NULL,
	"target" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"ddex_version" text DEFAULT '4.0',
	"package_url" text,
	"error_message" text,
	"acknowledged_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"integration_id" integer NOT NULL,
	"field_key" text NOT NULL,
	"cipher_text" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_sync_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"integration_id" integer NOT NULL,
	"job_type" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"result" jsonb,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"auth_type" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"object_path" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text,
	"duration_seconds" integer,
	"release_id" integer,
	"track_id" integer,
	"artist_id" integer,
	"label_id" integer,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'labels_parent_label_id_labels_id_fk') THEN
    ALTER TABLE "labels" ADD CONSTRAINT "labels_parent_label_id_labels_id_fk" FOREIGN KEY ("parent_label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artists_label_id_labels_id_fk') THEN
    ALTER TABLE "artists" ADD CONSTRAINT "artists_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'releases_artist_id_artists_id_fk') THEN
    ALTER TABLE "releases" ADD CONSTRAINT "releases_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'releases_label_id_labels_id_fk') THEN
    ALTER TABLE "releases" ADD CONSTRAINT "releases_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tracks_release_id_releases_id_fk') THEN
    ALTER TABLE "tracks" ADD CONSTRAINT "tracks_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tracks_artist_id_artists_id_fk') THEN
    ALTER TABLE "tracks" ADD CONSTRAINT "tracks_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_artist_id_artists_id_fk') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_label_id_labels_id_fk') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_tasks_assigned_to_id_users_id_fk') THEN
    ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_artist_id_artists_id_fk') THEN
    ALTER TABLE "transactions" ADD CONSTRAINT "transactions_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_label_id_labels_id_fk') THEN
    ALTER TABLE "transactions" ADD CONSTRAINT "transactions_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_release_id_releases_id_fk') THEN
    ALTER TABLE "transactions" ADD CONSTRAINT "transactions_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'splits_release_id_releases_id_fk') THEN
    ALTER TABLE "splits" ADD CONSTRAINT "splits_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'splits_track_id_tracks_id_fk') THEN
    ALTER TABLE "splits" ADD CONSTRAINT "splits_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payouts_artist_id_artists_id_fk') THEN
    ALTER TABLE "payouts" ADD CONSTRAINT "payouts_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payouts_label_id_labels_id_fk') THEN
    ALTER TABLE "payouts" ADD CONSTRAINT "payouts_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publishing_works_track_id_tracks_id_fk') THEN
    ALTER TABLE "publishing_works" ADD CONSTRAINT "publishing_works_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_reports_artist_id_artists_id_fk') THEN
    ALTER TABLE "usage_reports" ADD CONSTRAINT "usage_reports_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_reports_release_id_releases_id_fk') THEN
    ALTER TABLE "usage_reports" ADD CONSTRAINT "usage_reports_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_reports_track_id_tracks_id_fk') THEN
    ALTER TABLE "usage_reports" ADD CONSTRAINT "usage_reports_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_release_id_releases_id_fk') THEN
    ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_log_user_id_users_id_fk') THEN
    ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_credentials_integration_id_integrations_id_fk') THEN
    ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_sync_jobs_integration_id_integrations_id_fk') THEN
    ALTER TABLE "integration_sync_jobs" ADD CONSTRAINT "integration_sync_jobs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_release_id_releases_id_fk') THEN
    ALTER TABLE "assets" ADD CONSTRAINT "assets_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_track_id_tracks_id_fk') THEN
    ALTER TABLE "assets" ADD CONSTRAINT "assets_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_artist_id_artists_id_fk') THEN
    ALTER TABLE "assets" ADD CONSTRAINT "assets_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_label_id_labels_id_fk') THEN
    ALTER TABLE "assets" ADD CONSTRAINT "assets_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_uploaded_by_users_id_fk') THEN
    ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "labels_parent_idx" ON "labels" USING btree ("parent_label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "labels_status_idx" ON "labels" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artists_label_idx" ON "artists" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artists_slug_idx" ON "artists" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artists_status_idx" ON "artists" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "releases_artist_idx" ON "releases" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "releases_label_idx" ON "releases" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "releases_status_idx" ON "releases" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "releases_release_date_idx" ON "releases" USING btree ("release_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "releases_upc_idx" ON "releases" USING btree ("upc");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracks_release_idx" ON "tracks" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracks_artist_idx" ON "tracks" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracks_isrc_idx" ON "tracks" USING btree ("isrc");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_artist_idx" ON "users" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_label_idx" ON "users" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_type_idx" ON "contacts" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_tasks_status_idx" ON "crm_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_tasks_assignee_idx" ON "crm_tasks" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_tasks_related_idx" ON "crm_tasks" USING btree ("related_entity_type","related_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_period_idx" ON "transactions" USING btree ("period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_artist_idx" ON "transactions" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_label_idx" ON "transactions" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_release_idx" ON "transactions" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_type_idx" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_period_artist_idx" ON "transactions" USING btree ("period","artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "splits_release_idx" ON "splits" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "splits_track_idx" ON "splits" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payouts_artist_idx" ON "payouts" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payouts_label_idx" ON "payouts" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payouts_status_idx" ON "payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishing_works_track_idx" ON "publishing_works" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishing_works_status_idx" ON "publishing_works" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publishing_works_iswc_idx" ON "publishing_works" USING btree ("iswc");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_reports_period_idx" ON "usage_reports" USING btree ("period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_reports_track_idx" ON "usage_reports" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_reports_release_idx" ON "usage_reports" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_reports_artist_idx" ON "usage_reports" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_reports_platform_idx" ON "usage_reports" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_reports_period_track_idx" ON "usage_reports" USING btree ("period","track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_release_idx" ON "deliveries" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_status_idx" ON "deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_target_idx" ON "deliveries" USING btree ("target");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_user_idx" ON "activity_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_created_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creds_integration_idx" ON "integration_credentials" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_integration_idx" ON "integration_sync_jobs" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_started_idx" ON "integration_sync_jobs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrations_code_idx" ON "integrations" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" USING btree ("expire");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_release_idx" ON "assets" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_track_idx" ON "assets" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_artist_idx" ON "assets" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_sha256_idx" ON "assets" USING btree ("sha256");