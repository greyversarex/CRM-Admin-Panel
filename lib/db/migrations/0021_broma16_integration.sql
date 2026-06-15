-- 0021: Broma16 (ROD API) integration.
--
-- Что добавляется:
--   releases.broma16_release_id          — ID релиза в Broma16 (после создания)
--   releases.broma16_moderation_status   — статус модерации (pending|approved|…)
--   releases.broma16_distribution_outlets — выбранные витрины (jsonb массив кодов)
--   releases.broma16_pushed_at           — когда отправлен на модерацию
--   releases.broma16_last_error          — текст последней ошибки пуша
--   tracks.broma16_recording_id          — ID фонограммы в Broma16
--   artists.broma16_artist_id / artist_h11 / ipi_name_number / ipn / isni
--   broma16_dictionaries                 — кэш словарей Broma16
--   broma16_push_jobs                    — очередь задач пуша релиза
--
-- Все операции идемпотентны (IF NOT EXISTS), безопасны для повторного прогона.

ALTER TABLE releases ADD COLUMN IF NOT EXISTS broma16_release_id integer;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS broma16_moderation_status text;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS broma16_distribution_outlets jsonb;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS broma16_pushed_at timestamp with time zone;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS broma16_last_error text;

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS broma16_recording_id integer;

ALTER TABLE artists ADD COLUMN IF NOT EXISTS broma16_artist_id text;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS artist_h11 integer;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS ipi_name_number text;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS ipn text;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS isni text;

CREATE TABLE IF NOT EXISTS broma16_dictionaries (
  id serial PRIMARY KEY NOT NULL,
  type text NOT NULL,
  external_id text NOT NULL,
  code text,
  name text NOT NULL,
  raw jsonb,
  synced_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS broma16_dict_type_extid_uniq ON broma16_dictionaries (type, external_id);
CREATE INDEX IF NOT EXISTS broma16_dict_type_idx ON broma16_dictionaries (type);

CREATE TABLE IF NOT EXISTS broma16_push_jobs (
  id serial PRIMARY KEY NOT NULL,
  release_id integer NOT NULL REFERENCES releases(id) ON DELETE cascade,
  status text DEFAULT 'queued' NOT NULL,
  step text DEFAULT 'queued' NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_error text,
  next_retry_at timestamp with time zone,
  result jsonb DEFAULT '{}'::jsonb NOT NULL,
  requested_by integer REFERENCES users(id) ON DELETE set null,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS broma16_push_jobs_release_idx ON broma16_push_jobs (release_id);
CREATE INDEX IF NOT EXISTS broma16_push_jobs_status_idx ON broma16_push_jobs (status);
