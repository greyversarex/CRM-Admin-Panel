-- ── Release advanced dates ───────────────────────────────────────
-- Оригинальная дата выхода (перевыпуски/каталог) и дата предзаказа.
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "original_release_date" text;
ALTER TABLE "releases" ADD COLUMN IF NOT EXISTS "preorder_date" text;
