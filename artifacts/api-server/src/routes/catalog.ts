/**
 * Catalog API — duplicate detection helpers.
 *
 * GET /api/catalog/duplicates?type=artist|track|release|asset
 * Возвращает группы потенциальных дубликатов по нормализованному имени, ISRC/UPC, sha256.
 */
import { Router } from "express";
import { z } from "zod";
import { db, artistsTable, tracksTable, releasesTable, assetsTable, platformSettingsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { logger } from "../lib/logger";

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

// ── Code generators (ISRC / UPC) ───────────────────────────────────────────
// Раньше: Math.random → коллизии и отказы DSP. Теперь: настраиваемые префиксы
// + атомарный sequential counter в platform_settings. Конфиг ключ: "codes".
//
// platform_settings.value (key="codes") = {
//   isrcCountry: "TJ",          // ISO 3166-1 alpha-2 (по умолчанию TJ)
//   isrcRegistrant: "TM1",      // 3-символьный код регистранта от IFPI
//   isrcCounter: 0,             // монотонный счётчик в году
//   isrcYear: 26,               // год последнего значения (двузначный)
//   upcCompanyPrefix: "859",    // префикс компании от GS1 (3-12 цифр; для не-зарегистрированных оставлять пустым)
//   upcCounter: 0,              // монотонный счётчик
//   warnUnregistered: true,     // если префиксы не настроены — пишем warning в audit log
// }

type CodesConfig = {
  isrcCountry: string;
  isrcRegistrant: string;
  isrcCounter: number;
  isrcYear: number;
  upcCompanyPrefix: string;
  upcCounter: number;
  warnUnregistered: boolean;
};

const DEFAULT_CODES: CodesConfig = {
  isrcCountry: "TJ",
  isrcRegistrant: "TM1",
  isrcCounter: 0,
  isrcYear: new Date().getFullYear() % 100,
  upcCompanyPrefix: "",
  upcCounter: 0,
  warnUnregistered: true,
};

async function loadAndIncrementCodes<T>(producer: (cfg: CodesConfig) => { value: T; next: CodesConfig }): Promise<T> {
  // Атомарный update через single UPDATE с computed JSON — иначе два параллельных
  // запроса могут получить один и тот же counter и сгенерируют одинаковый ISRC.
  return await db.transaction(async (tx) => {
    const [row] = await tx.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "codes")).for("update");
    const current = { ...DEFAULT_CODES, ...((row?.value as Partial<CodesConfig>) ?? {}) };
    const { value, next } = producer(current);
    if (row) {
      await tx.update(platformSettingsTable).set({ value: next as unknown as Record<string, unknown> }).where(eq(platformSettingsTable.key, "codes"));
    } else {
      await tx.insert(platformSettingsTable).values({ key: "codes", value: next as unknown as Record<string, unknown> });
    }
    return value;
  });
}

export async function generateIsrc(): Promise<{ code: string; warning?: string }> {
  const yy = new Date().getFullYear() % 100;
  const result = await loadAndIncrementCodes<{ code: string; warning?: string }>((cfg) => {
    // Если год сменился — counter обнуляется (так требует стандарт ISRC).
    const counter = cfg.isrcYear === yy ? cfg.isrcCounter + 1 : 1;
    if (counter > 99999) {
      throw new Error("ISRC year counter exhausted (>99999) — это исключительная ситуация, требующая нового регистранта на этот год");
    }
    const n = String(counter).padStart(5, "0");
    const yyStr = String(yy).padStart(2, "0");
    const code = `${cfg.isrcCountry}${cfg.isrcRegistrant}${yyStr}${n}`;
    const warning = (cfg.warnUnregistered && cfg.isrcRegistrant === "TM1")
      ? "ISRC-регистрант не настроен (используется placeholder TM1). Зарегистрируйте префикс в IFPI и обновите Настройки → Каталог → ISRC."
      : undefined;
    return { value: { code, warning }, next: { ...cfg, isrcCounter: counter, isrcYear: yy } };
  });
  if (result.warning) logger.warn({ code: result.code }, `[catalog] ${result.warning}`);
  return result;
}

function calcEanCheck(d11: string): string {
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += Number(d11[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export async function generateUpc(): Promise<{ code: string; warning?: string }> {
  const result = await loadAndIncrementCodes<{ code: string; warning?: string }>((cfg) => {
    const counter = cfg.upcCounter + 1;
    const prefix = cfg.upcCompanyPrefix.replace(/\D/g, "");
    if (!prefix) {
      // Префикс не настроен — отказываемся выдавать UPC. Лучше явная ошибка
      // на UI (и менеджер пойдёт настраивать), чем мусор в DSP.
      throw new Error("UPC company prefix not configured. Откройте Настройки → Каталог → UPC и укажите префикс GS1.");
    }
    const need = 11 - prefix.length;
    if (need <= 0 || need > 11) {
      throw new Error(`UPC company prefix length invalid (got ${prefix.length}, expected 3..10)`);
    }
    const item = String(counter).padStart(need, "0");
    if (item.length !== need) {
      throw new Error(`UPC counter overflow for prefix length ${prefix.length} — нужно расширить префикс`);
    }
    const d11 = prefix + item;
    const code = d11 + calcEanCheck(d11);
    return { value: { code }, next: { ...cfg, upcCounter: counter } };
  });
  return result;
}

router.post("/catalog/codes/isrc", async (_req, res) => {
  try {
    const { code, warning } = await generateIsrc();
    res.json({ code, warning });
  } catch (e) {
    res.status(409).json({ error: "isrc_generation_failed", message: (e as Error).message });
  }
});

router.post("/catalog/codes/upc", async (_req, res) => {
  try {
    const { code, warning } = await generateUpc();
    res.json({ code, warning });
  } catch (e) {
    res.status(409).json({ error: "upc_generation_failed", message: (e as Error).message });
  }
});

// GET текущие настройки кодов (для UI Настройки → Каталог)
router.get("/catalog/codes/config", async (_req, res) => {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "codes"));
  const cfg = { ...DEFAULT_CODES, ...((row?.value as Partial<CodesConfig>) ?? {}) };
  res.json(cfg);
});

// PUT настроек кодов (только admin/manager — guard в index.ts)
const CodesConfigSchema = z.object({
  isrcCountry: z.string().length(2),
  isrcRegistrant: z.string().min(3).max(3),
  upcCompanyPrefix: z.string().regex(/^\d{0,12}$/),
});
router.put("/catalog/codes/config", async (req, res) => {
  const parsed = CodesConfigSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.format() }); return; }
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "codes"));
  const current = { ...DEFAULT_CODES, ...((row?.value as Partial<CodesConfig>) ?? {}) };
  const next: CodesConfig = { ...current, ...parsed.data, warnUnregistered: parsed.data.isrcRegistrant === "TM1" };
  if (row) {
    await db.update(platformSettingsTable).set({ value: next as unknown as Record<string, unknown> }).where(eq(platformSettingsTable.key, "codes"));
  } else {
    await db.insert(platformSettingsTable).values({ key: "codes", value: next as unknown as Record<string, unknown> });
  }
  res.json(next);
});

export default router;
