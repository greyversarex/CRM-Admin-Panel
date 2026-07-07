-- 0022: Broma16 (ROD API) издательский режим для произведений (publishing_works).
--
-- Что добавляется:
--   publishing_works.broma16_composition_id — ID произведения (composition) в Broma16
--   publishing_works.broma16_status         — статус отправки (pending|submitted)
--
-- Используется при регистрации авторских долей без фонограммы/обложки/площадок
-- (publishing-only push). Операции идемпотентны (IF NOT EXISTS).

ALTER TABLE publishing_works ADD COLUMN IF NOT EXISTS broma16_composition_id text;
ALTER TABLE publishing_works ADD COLUMN IF NOT EXISTS broma16_status text;
