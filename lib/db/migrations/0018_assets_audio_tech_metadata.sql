-- 0018: расширение assets техническими метаданными аудио.
--
-- До этой миграции при загрузке трека мы сохраняли только duration_seconds.
-- Для модерации (и для DDEX TechnicalSoundRecordingDetails) нам нужно знать
-- частоту дискретизации, разрядность, число каналов, кодек и битрейт.
-- Это парсится через music-metadata одним проходом по заголовку файла.
--
-- Также добавляем колонки идемпотентно: если миграция уже применена частично
-- — повторный запуск не упадёт.

ALTER TABLE assets ADD COLUMN IF NOT EXISTS sample_rate_hz integer;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS bit_depth      integer;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS channels       integer;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS codec          text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS bitrate_kbps   integer;
