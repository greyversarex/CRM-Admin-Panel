-- 0019: расширение схемы под Symphonic-style "Create Release" flow.
--
-- Что добавляется:
--   releases.cover_ai_usage           — раскрытие AI для обложки (none|some|all|null)
--   releases.upc_request_pending      — пользователь выбрал "I need a UPC" в гейте
--   releases.metadata_translations    — переводы названия/версии релиза (jsonb)
--   tracks.spatial_audio_url          — путь к Dolby Atmos / spatial audio файлу
--   tracks.spatial_isrc               — отдельный ISRC для spatial-релиза
--   tracks.spatial_ai_usage           — AI disclosure для spatial трека
--   tracks.spatial_billing_status     — статус оплаты spatial track ($24.99 в Symphonic)
--   tracks.metadata_translations      — переводы названия трека
--
-- Все колонки добавляются IF NOT EXISTS для идемпотентности.

ALTER TABLE releases ADD COLUMN IF NOT EXISTS cover_ai_usage text;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS upc_request_pending boolean NOT NULL DEFAULT false;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS metadata_translations jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS spatial_audio_url text;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS spatial_isrc text;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS spatial_ai_usage text;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS spatial_billing_status text NOT NULL DEFAULT 'none';
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS metadata_translations jsonb NOT NULL DEFAULT '[]'::jsonb;
