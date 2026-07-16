CREATE TABLE IF NOT EXISTS "metadata_cache" (
	"upc" text PRIMARY KEY NOT NULL,
	"spotify_album_id" text,
	"spotify_artist_id" text,
	"deezer_album_id" text,
	"musicbrainz_mbid" text,
	"itunes_collection_id" text,
	"artist_name" text,
	"album_name" text,
	"label_name" text,
	"p_line" text,
	"c_line" text,
	"cover_url" text,
	"genre" text,
	"subgenre" text,
	"release_date" text,
	"release_type" text,
	"tracks" jsonb,
	"source_used" text,
	"raw_itunes" jsonb,
	"raw_source" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metadata_cache_fetched_at_idx" ON "metadata_cache" USING btree ("fetched_at");
