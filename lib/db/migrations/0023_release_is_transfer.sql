-- 0023: Флаг переноса релиза (Transfer Track) для Broma16.
--
-- releases.is_transfer — релиз импортирован через Transfer Track (перенос каталога).
-- При отправке в Broma16 для таких релизов уходит документированное поле
-- isTransferRelease=true (регулирует особенности переноса).
--
-- Операция идемпотентна (IF NOT EXISTS).

ALTER TABLE releases ADD COLUMN IF NOT EXISTS is_transfer boolean NOT NULL DEFAULT false;
