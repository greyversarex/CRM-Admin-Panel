CREATE TABLE IF NOT EXISTS "audio_qc" (
  "id" serial PRIMARY KEY NOT NULL,
  "track_id" integer NOT NULL REFERENCES "tracks"("id") ON DELETE CASCADE,
  "object_path" text NOT NULL,
  "duration_sec" real,
  "sample_rate_hz" integer,
  "channels" integer,
  "codec" text,
  "bit_depth" integer,
  "integrated_lufs" real,
  "true_peak_db" real,
  "fade_in" boolean,
  "fade_out" boolean,
  "distortion" boolean,
  "clipped_samples" integer,
  "clipping_events" jsonb,
  "silences" jsonb,
  "dead_air" jsonb,
  "peaks" jsonb,
  "issues" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'pass',
  "analyzed_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "audio_qc_track_uniq" ON "audio_qc" ("track_id");
