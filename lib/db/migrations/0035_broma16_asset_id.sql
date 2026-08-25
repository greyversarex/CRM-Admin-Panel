-- Разделяем два разных идентификатора Broma16.
--
-- broma16_release_id — черновик репертуара, созданный нашей отправкой
--   (POST /repertoire/release/), по нему идут PUT и send-moderate.
-- broma16_asset_id   — запись в каталоге кабинета (/accounts/{id}/assets),
--   которую приносит импорт каталога.
--
-- Раньше импорт писал свой идентификатор в broma16_release_id, и повторная
-- отправка такого релиза уходила PUT'ом на несуществующий черновик.

ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "broma16_asset_id" integer;
CREATE INDEX IF NOT EXISTS "releases_broma16_asset_idx" ON "releases" ("broma16_asset_id");
