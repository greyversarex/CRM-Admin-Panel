-- Смартлинки: привязка к релизу, оформление публичной страницы и счётчики.
-- Все колонки с DEFAULT + NOT NULL, чтобы существующие строки не сломались.

ALTER TABLE "smart_links"
ADD COLUMN IF NOT EXISTS "release_id" integer,
ADD COLUMN IF NOT EXISTS "cover_url" text,
ADD COLUMN IF NOT EXISTS "release_date" text,
ADD COLUMN IF NOT EXISTS "theme" text DEFAULT 'light' NOT NULL,
ADD COLUMN IF NOT EXISTS "socials_enabled" boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS "socials" jsonb DEFAULT '[]'::jsonb NOT NULL,
ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS "views" integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS "clicks_by_dsp" jsonb DEFAULT '{}'::jsonb NOT NULL,
ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- Релиз может быть удалён, а разосланная ссылка обязана продолжать работать.
DO $$ BEGIN
  ALTER TABLE "smart_links"
  ADD CONSTRAINT "smart_links_release_id_releases_id_fk"
  FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "smart_links_release_idx" ON "smart_links" ("release_id");
