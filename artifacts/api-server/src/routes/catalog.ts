/**
 * Catalog API — duplicate detection helpers.
 *
 * GET /api/catalog/duplicates?type=artist|track|release|asset
 * Возвращает группы потенциальных дубликатов по нормализованному имени, ISRC/UPC, sha256.
 */
import { Router } from "express";
import { z } from "zod";
import { db, artistsTable, tracksTable, releasesTable, assetsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const QuerySchema = z.object({
  type: z.enum(["artist", "track", "release", "asset"]).default("artist"),
});

router.get("/catalog/duplicates", async (req, res) => {
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "validation" }); return; }
  const { type } = parsed.data;

  if (type === "artist") {
    // Группируем по lower(name)
    const groups = await db.execute(sql`
      SELECT lower(name) AS key, count(*)::int AS cnt,
             json_agg(json_build_object('id', id, 'name', name, 'genre', genre)) AS items
      FROM artists
      GROUP BY lower(name)
      HAVING count(*) > 1
      ORDER BY cnt DESC
      LIMIT 100
    `);
    res.json({ type, groups: groups.rows });
    return;
  }

  if (type === "track") {
    // Группируем по ISRC (если есть) ИЛИ по lower(title)+duration
    const groups = await db.execute(sql`
      SELECT key, count(*)::int AS cnt,
             json_agg(json_build_object('id', id, 'title', title, 'isrc', isrc, 'release_id', release_id)) AS items
      FROM (
        SELECT id, title, isrc, release_id,
               COALESCE(NULLIF(isrc, ''), lower(title)) AS key
        FROM tracks
      ) sub
      GROUP BY key
      HAVING count(*) > 1
      ORDER BY cnt DESC
      LIMIT 100
    `);
    res.json({ type, groups: groups.rows });
    return;
  }

  if (type === "release") {
    const groups = await db.execute(sql`
      SELECT key, count(*)::int AS cnt,
             json_agg(json_build_object('id', id, 'title', title, 'upc', upc, 'release_date', release_date)) AS items
      FROM (
        SELECT id, title, upc, release_date,
               COALESCE(NULLIF(upc, ''), lower(title)) AS key
        FROM releases
      ) sub
      GROUP BY key
      HAVING count(*) > 1
      ORDER BY cnt DESC
      LIMIT 100
    `);
    res.json({ type, groups: groups.rows });
    return;
  }

  // assets — по sha256
  const groups = await db.execute(sql`
    SELECT sha256 AS key, count(*)::int AS cnt,
           json_agg(json_build_object('id', id, 'filename', filename, 'kind', kind, 'release_id', release_id, 'track_id', track_id)) AS items
    FROM assets
    WHERE sha256 IS NOT NULL AND sha256 <> ''
    GROUP BY sha256
    HAVING count(*) > 1
    ORDER BY cnt DESC
    LIMIT 100
  `);
  res.json({ type, groups: groups.rows });
});

// ── Code generators ────────────────────────────────────────────────────────
// ISRC / UPC standalone generators (без привязки к релизу/треку — для ручного использования).

function generateIsrc(): string {
  // CC-XXX-YY-NNNNN. CC=TJ (Таджикистан), XXX=TM1 (наш регистрант), YY = 2 последние года, NNNNN = random.
  const yy = new Date().getFullYear().toString().slice(-2);
  const n = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
  return `TJTM1${yy}${n}`;
}

function generateUpc(): string {
  // 12 цифр; первые 11 — random, 12-я — checksum по EAN-13 алгоритму.
  let base = "";
  for (let i = 0; i < 11; i++) base += String(Math.floor(Math.random() * 10));
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const d = Number(base[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return base + String(check);
}

router.post("/catalog/codes/isrc", (_req, res) => {
  res.json({ code: generateIsrc() });
});

router.post("/catalog/codes/upc", (_req, res) => {
  res.json({ code: generateUpc() });
});

export default router;
