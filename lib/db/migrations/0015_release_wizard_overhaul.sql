-- 0015_release_wizard_overhaul.sql
-- Полная переделка системы создания релизов под Symphonic Distribution UX:
-- 4-шаговый мастер, multi-primary artists, structured contributors,
-- AI Usage, lyrics, full Audio Details, DSP catalog.
--
-- Все ALTER идемпотентны (IF NOT EXISTS / IF EXISTS) — миграция безопасна
-- против чистой и уже-применённой БД.

-- ── releases: новые поля ──────────────────────────────────────────────────
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "release_version" text;
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "catalog_number" text;
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "subgenre" text;
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "release_time" text;
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "is_compilation" boolean NOT NULL DEFAULT false;
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "is_various_artists" boolean NOT NULL DEFAULT false;
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "p_line_year" integer;
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "c_line_year" integer;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "releases_catalog_number_uniq_idx"
  ON "releases" ("catalog_number")
  WHERE "catalog_number" IS NOT NULL AND "catalog_number" <> '';
--> statement-breakpoint

-- ── tracks: новые поля ────────────────────────────────────────────────────
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "track_version" text;
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "subgenre" text;
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "explicit_status" text NOT NULL DEFAULT 'non_explicit';
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "ai_usage" text NOT NULL DEFAULT 'none';
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "clip_start_seconds" integer NOT NULL DEFAULT 0;
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "recording_year" integer;
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "country_of_recording" text;
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "audio_style" text NOT NULL DEFAULT 'vocal';
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "vocal_language" text;
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "lyrics" text;
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "display_artists" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "writers" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "performers" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "production" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint

-- ── tracks: миграция legacy composer/lyricist в writers, потом DROP ──────
-- Идемпотентно: если столбцов уже нет, просто пропускаем.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='tracks' AND column_name='composer_name') THEN
    UPDATE "tracks"
    SET writers = COALESCE(writers, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('name', composer_name, 'role', 'composer', 'share', 100)
    )
    WHERE composer_name IS NOT NULL AND composer_name <> ''
      AND NOT (writers @> jsonb_build_array(jsonb_build_object('name', composer_name, 'role', 'composer')));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='tracks' AND column_name='lyricist_name') THEN
    UPDATE "tracks"
    SET writers = COALESCE(writers, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('name', lyricist_name, 'role', 'lyricist', 'share', 0)
    )
    WHERE lyricist_name IS NOT NULL AND lyricist_name <> ''
      AND NOT (writers @> jsonb_build_array(jsonb_build_object('name', lyricist_name, 'role', 'lyricist')));
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "tracks" DROP COLUMN IF EXISTS "composer_name";
--> statement-breakpoint
ALTER TABLE "tracks" DROP COLUMN IF EXISTS "lyricist_name";
--> statement-breakpoint

-- ── dsp_catalog ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "dsp_catalog" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "logo_url" text,
  "ddex_party_id" text,
  "ddex_party_name" text,
  "sort_order" integer NOT NULL DEFAULT 100,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dsp_catalog_code_uniq" UNIQUE ("code")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dsp_catalog_active_idx" ON "dsp_catalog" ("is_active", "sort_order");
--> statement-breakpoint

-- ── release_artists (multi-primary) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "release_artists" (
  "id" serial PRIMARY KEY NOT NULL,
  "release_id" integer NOT NULL,
  "artist_id" integer NOT NULL,
  "role" text NOT NULL DEFAULT 'primary',
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "release_artists_release_artist_uniq"
  ON "release_artists" ("release_id", "artist_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_artists_release_idx" ON "release_artists" ("release_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_artists_artist_idx" ON "release_artists" ("artist_id");
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'release_artists_release_id_fk') THEN
    ALTER TABLE "release_artists"
      ADD CONSTRAINT "release_artists_release_id_fk"
      FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE NOT VALID;
    ALTER TABLE "release_artists" VALIDATE CONSTRAINT "release_artists_release_id_fk";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'release_artists_artist_id_fk') THEN
    ALTER TABLE "release_artists"
      ADD CONSTRAINT "release_artists_artist_id_fk"
      FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE NOT VALID;
    ALTER TABLE "release_artists" VALIDATE CONSTRAINT "release_artists_artist_id_fk";
  END IF;
END $$;
--> statement-breakpoint

-- Backfill: для каждого существующего релиза создаём запись primary artist
-- из releases.artist_id, если её ещё нет.
INSERT INTO "release_artists" ("release_id", "artist_id", "role", "position")
SELECT r.id, r.artist_id, 'primary', 0
FROM "releases" r
LEFT JOIN "release_artists" ra
  ON ra.release_id = r.id AND ra.artist_id = r.artist_id
WHERE ra.id IS NULL;
--> statement-breakpoint

-- ── release_dsps ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "release_dsps" (
  "id" serial PRIMARY KEY NOT NULL,
  "release_id" integer NOT NULL,
  "dsp_code" text NOT NULL,
  "selected_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "release_dsps_release_code_uniq"
  ON "release_dsps" ("release_id", "dsp_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "release_dsps_release_idx" ON "release_dsps" ("release_id");
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'release_dsps_release_id_fk') THEN
    ALTER TABLE "release_dsps"
      ADD CONSTRAINT "release_dsps_release_id_fk"
      FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE NOT VALID;
    ALTER TABLE "release_dsps" VALIDATE CONSTRAINT "release_dsps_release_id_fk";
  END IF;
END $$;
--> statement-breakpoint

-- ── seed dsp_catalog ──────────────────────────────────────────────────────
-- Главные DSP по которым сейчас работают независимые лейблы. Ddex_party_id
-- проставлен где он публично известен; остальные дозаполнятся при настройке
-- интеграции SFTP под конкретного партнёра.
INSERT INTO "dsp_catalog" ("code", "name", "logo_url", "ddex_party_id", "ddex_party_name", "sort_order", "is_active") VALUES
  ('spotify',         'Spotify',              null, 'PADPIDA2014020802I', 'Spotify',           10, true),
  ('apple_music',     'Apple Music / iTunes', null, 'PADPIDA2007081303A', 'Apple',             20, true),
  ('amazon_music',    'Amazon Music',         null, 'PADPIDA2014091602I', 'Amazon',            30, true),
  ('youtube_music',   'YouTube Music',        null, 'PADPIDA2014092501M', 'YouTube',           40, true),
  ('youtube_content', 'YouTube Content ID',   null, 'PADPIDA2014092501M', 'YouTube',           45, true),
  ('deezer',          'Deezer',               null, 'PADPIDA2014020701T', 'Deezer',            50, true),
  ('tidal',           'Tidal',                null, 'PADPIDA2015030801A', 'Tidal',             60, true),
  ('pandora',         'Pandora',              null, 'PADPIDA2014011201X', 'Pandora',           70, true),
  ('soundcloud',      'SoundCloud',           null, 'PADPIDA2015092201Y', 'SoundCloud',        80, true),
  ('tiktok',          'TikTok',               null, 'PADPIDA2019112803Z', 'TikTok',            90, true),
  ('meta',            'Meta / Instagram & Facebook', null, null, null,                        100, true),
  ('boom_play',       'Boom Play',            null, null, null,                               110, true),
  ('anghami',         'Anghami',              null, null, null,                               120, true),
  ('audiomack',       'Audiomack',            null, null, null,                               130, true),
  ('napster',         'Napster',              null, null, null,                               140, true),
  ('iheartradio',     'iHeartRadio',          null, null, null,                               150, true),
  ('yandex_music',    'Yandex Music',         null, null, null,                               160, true),
  ('vk_music',        'VK Music',             null, null, null,                               170, true),
  ('zvuk',            'Zvuk',                 null, null, null,                               180, true),
  ('jiosaavn',        'JioSaavn',             null, null, null,                               190, true),
  ('gaana',           'Gaana',                null, null, null,                               200, true),
  ('resso',           'Resso',                null, null, null,                               210, true),
  ('kkbox',           'KKBox',                null, null, null,                               220, true),
  ('netease',         'NetEase Cloud Music',  null, null, null,                               230, true),
  ('tencent',         'Tencent Music',        null, null, null,                               240, true),
  ('alibaba',         'Alibaba',              null, null, null,                               250, true),
  ('cap_cut',         'Cap Cut',              null, null, null,                               260, true),
  ('beatport',        'Beatport',             null, null, null,                               270, true),
  ('shazam',          'Shazam',               null, null, null,                               280, true),
  ('mixcloud',        'Mixcloud',             null, null, null,                               290, true)
ON CONFLICT ("code") DO NOTHING;
