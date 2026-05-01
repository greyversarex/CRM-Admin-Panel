CREATE TABLE "takedown_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"release_title" text NOT NULL,
	"artist_name" text NOT NULL,
	"upc" text,
	"reason" text NOT NULL,
	"note" text,
	"dsps" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"artist_id" integer,
	"label_id" integer,
	"created_by_id" integer,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "presave_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist_name" text NOT NULL,
	"release_date" text NOT NULL,
	"platforms" text DEFAULT 'all' NOT NULL,
	"slug" text NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"artist_id" integer,
	"label_id" integer,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist_name" text NOT NULL,
	"slug" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"top_platform" text,
	"dsps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artist_id" integer,
	"label_id" integer,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "smart_links_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "promo_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"release_id" integer,
	"release_title" text NOT NULL,
	"artist_name" text NOT NULL,
	"asset_type" text NOT NULL,
	"format" text NOT NULL,
	"dimensions" text NOT NULL,
	"file_url" text,
	"artist_id" integer,
	"label_id" integer,
	"created_by_id" integer,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"playlist_name" text NOT NULL,
	"dsp" text NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"streams" integer DEFAULT 0 NOT NULL,
	"trend_pct" real DEFAULT 0 NOT NULL,
	"artist_id" integer,
	"label_id" integer,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiktok_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"track_id" integer,
	"track_title" text NOT NULL,
	"artist_name" text NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"video_views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"reposts" integer DEFAULT 0 NOT NULL,
	"artist_id" integer,
	"label_id" integer,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "label_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"label_id" integer NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invite_token" text,
	"invite_expires_at" timestamp with time zone,
	"user_id" integer,
	"invited_by_id" integer,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takedown_requests" ADD CONSTRAINT "takedown_requests_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presave_campaigns" ADD CONSTRAINT "presave_campaigns_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presave_campaigns" ADD CONSTRAINT "presave_campaigns_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presave_campaigns" ADD CONSTRAINT "presave_campaigns_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_links" ADD CONSTRAINT "smart_links_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_links" ADD CONSTRAINT "smart_links_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_links" ADD CONSTRAINT "smart_links_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_assets" ADD CONSTRAINT "promo_assets_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_assets" ADD CONSTRAINT "promo_assets_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_assets" ADD CONSTRAINT "promo_assets_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_assets" ADD CONSTRAINT "promo_assets_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_stats" ADD CONSTRAINT "playlist_stats_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_stats" ADD CONSTRAINT "playlist_stats_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_stats" ADD CONSTRAINT "tiktok_stats_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_stats" ADD CONSTRAINT "tiktok_stats_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_stats" ADD CONSTRAINT "tiktok_stats_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_members" ADD CONSTRAINT "label_members_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_members" ADD CONSTRAINT "label_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_members" ADD CONSTRAINT "label_members_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "takedown_requests_label_idx" ON "takedown_requests" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "takedown_requests_artist_idx" ON "takedown_requests" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "takedown_requests_status_idx" ON "takedown_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "presave_campaigns_label_idx" ON "presave_campaigns" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "presave_campaigns_artist_idx" ON "presave_campaigns" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "smart_links_label_idx" ON "smart_links" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "smart_links_artist_idx" ON "smart_links" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "promo_assets_release_idx" ON "promo_assets" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "promo_assets_label_idx" ON "promo_assets" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "promo_assets_artist_idx" ON "promo_assets" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "playlist_stats_label_idx" ON "playlist_stats" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "playlist_stats_artist_idx" ON "playlist_stats" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "tiktok_stats_label_idx" ON "tiktok_stats" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "tiktok_stats_artist_idx" ON "tiktok_stats" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "tiktok_stats_track_idx" ON "tiktok_stats" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "label_members_label_idx" ON "label_members" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "label_members_label_email_unique" ON "label_members" USING btree ("label_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "label_members_invite_token_unique" ON "label_members" USING btree ("invite_token");