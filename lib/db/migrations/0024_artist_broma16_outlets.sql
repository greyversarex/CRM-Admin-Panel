-- Динамический список id артиста на витринах Broma16 (массив outlets, поле id_outlet_user).
ALTER TABLE "artists" ADD COLUMN IF NOT EXISTS "broma16_outlets" jsonb;

-- Переносим старые одиночные поля spotify_id / apple_id в новый список,
-- чтобы не потерять уже введённые данные. Идемпотентно: заполняем только строки,
-- где новый список ещё пуст (NULL).
UPDATE "artists" AS t
SET "broma16_outlets" = sub.arr
FROM (
  SELECT a.id AS artist_id, jsonb_agg(elem ORDER BY ord) AS arr
  FROM "artists" a
  CROSS JOIN LATERAL (
    SELECT 1 AS ord,
           jsonb_build_object('outletId', 6140, 'outletName', 'Spotify', 'idOutletUser', a.spotify_id) AS elem
    WHERE a.spotify_id IS NOT NULL AND btrim(a.spotify_id) <> ''
    UNION ALL
    SELECT 2 AS ord,
           jsonb_build_object('outletId', 49803, 'outletName', 'Apple Music, iTunes', 'idOutletUser', a.apple_id) AS elem
    WHERE a.apple_id IS NOT NULL AND btrim(a.apple_id) <> ''
  ) elems
  GROUP BY a.id
) sub
WHERE t.id = sub.artist_id
  AND t."broma16_outlets" IS NULL;
