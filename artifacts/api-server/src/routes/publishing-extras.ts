/**
 * Publishing — Conflict Detection + Registration API
 *
 * GET    /api/publishing/conflicts?resolved=
 * POST   /api/publishing/conflicts/detect            — авто-сканирование (split overlap, duplicate ISWC, unclaimed share)
 * PATCH  /api/publishing/conflicts/:id               — resolve / re-open
 * POST   /api/publishing/works/:id/register/:pro     — отправка в PRO; pro ∈ ascap|bmi|songtrust|mlc
 *                                                      Без credentials в settings.publishing.pros — возвращает 503.
 */
import { Router } from "express";
import { z } from "zod";
import { db, publishingConflictsTable, publishingWorksTable, platformSettingsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { auditMutation } from "../lib/audit";

const router = Router();

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const ProParam = z.object({ id: z.coerce.number().int().positive(), pro: z.enum(["ascap", "bmi", "songtrust", "mlc"]) });

router.get("/publishing/conflicts", async (req, res) => {
  const resolved = req.query.resolved === "true" ? true : req.query.resolved === "false" ? false : null;
  let q = db.select().from(publishingConflictsTable).$dynamic();
  if (resolved !== null) q = q.where(eq(publishingConflictsTable.resolved, resolved));
  const rows = await q.orderBy(desc(publishingConflictsTable.detectedAt)).limit(300);
  res.json({ conflicts: rows });
});

/**
 * Простое авто-сканирование:
 *  - duplicate_iswc: одинаковый iswc у разных works
 *  - split_overlap: сумма долей для work > 100
 *  - unclaimed_share: сумма долей < 100
 */
router.post("/publishing/conflicts/detect", async (req, res) => {
  let added = 0;

  // duplicate ISWC
  const dupIswc = await db.execute(sql`
    SELECT iswc, array_agg(id) AS ids
    FROM publishing_works
    WHERE iswc IS NOT NULL AND iswc <> ''
    GROUP BY iswc HAVING count(*) > 1
  `);
  for (const r of dupIswc.rows as Array<{ iswc: string; ids: number[] }>) {
    for (const wid of r.ids) {
      await db.insert(publishingConflictsTable).values({
        workId: wid, conflictType: "duplicate_iswc", severity: "high",
        description: `Дубликат ISWC ${r.iswc} (works: ${r.ids.join(", ")})`,
        meta: { iswc: r.iswc, peerIds: r.ids.filter((x) => x !== wid) },
      });
      added++;
    }
  }

  // split_overlap / unclaimed_share — суммарно по долям в writers (jsonb).
  // writers: [{ name, role, share?, percentage?, ... }]
  const works = await db.select({ id: publishingWorksTable.id, writers: publishingWorksTable.writers }).from(publishingWorksTable);
  for (const w of works) {
    const arr = (Array.isArray(w.writers) ? w.writers : []) as Array<{ percentage?: number; share?: number }>;
    const sum = arr.reduce((s, x) => s + (Number(x?.percentage) || 0), 0);
    if (sum > 100.001) {
      await db.insert(publishingConflictsTable).values({
        workId: w.id, conflictType: "split_overlap", severity: "high",
        description: `Сумма долей превышает 100% (${sum.toFixed(2)}%)`, meta: { sum },
      });
      added++;
    } else if (sum > 0 && sum < 99.999) {
      await db.insert(publishingConflictsTable).values({
        workId: w.id, conflictType: "unclaimed_share", severity: "medium",
        description: `Не распределено ${(100 - sum).toFixed(2)}% долей`, meta: { sum },
      });
      added++;
    }
  }

  res.json({ ok: true, added });
});

router.patch("/publishing/conflicts/:id", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const body = z.object({ resolved: z.boolean(), resolutionNote: z.string().max(2000).nullish() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "validation" }); return; }
  const userId = req.session?.user?.id ?? null;
  const patch: Record<string, unknown> = body.data.resolved
    ? { resolved: true, resolvedAt: new Date(), resolvedBy: userId, resolutionNote: body.data.resolutionNote ?? null }
    : { resolved: false, resolvedAt: null, resolvedBy: null, resolutionNote: null };
  const [row] = await db.update(publishingConflictsTable).set(patch).where(eq(publishingConflictsTable.id, p.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: body.data.resolved ? "resolve" : "reopen", entityType: "publishing_conflict", entityId: row.id, before: null, after: row });
  res.json(row);
});

// ── PRO Registration (caркас) ──────────────────────────────────────────────
interface ProConfig {
  endpoint?: string;
  apiKey?: string;
  enabled?: boolean;
}

async function loadProsConfig(): Promise<Record<string, ProConfig>> {
  try {
    const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "publishing"));
    const v = (row?.value ?? {}) as { pros?: Record<string, ProConfig> };
    if (v.pros && Object.keys(v.pros).length > 0) return v.pros;
    const [prosRow] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "pros"));
    return (prosRow?.value ?? {}) as Record<string, ProConfig>;
  } catch { return {}; }
}

router.post("/publishing/works/:id/register/:pro", async (req, res) => {
  const p = ProParam.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: "Bad params" }); return; }
  const cfg = (await loadProsConfig())[p.data.pro];
  if (!cfg?.endpoint || !cfg?.apiKey || cfg.enabled === false) {
    res.status(503).json({
      error: "credentials_not_configured",
      message: `Заполните Настройки → Publishing → ${p.data.pro.toUpperCase()} (endpoint + apiKey)`,
    });
    return;
  }

  const [work] = await db.select().from(publishingWorksTable).where(eq(publishingWorksTable.id, p.data.id));
  if (!work) { res.status(404).json({ error: "Work not found" }); return; }

  // Реальный POST на endpoint PRO (CWR-like JSON payload).
  const payload = {
    pro: p.data.pro,
    workId: work.id,
    title: work.title,
    iswc: work.iswc ?? null,
    publisher: work.publisher ?? null,
    writers: work.writers ?? [],
    territory: work.territory ?? ["WW"],
    metadata: { source: "tajik-music-distribution", version: "1.0" },
  };

  let externalId: string | null = null;
  try {
    const resp = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) {
      const errText = (await resp.text().catch(() => "")).slice(0, 400);
      const [updFailed] = await db.update(publishingWorksTable).set({
        status: "failed",
        updatedAt: new Date(),
      } as Record<string, unknown>).where(eq(publishingWorksTable.id, p.data.id)).returning();
      void auditMutation(req, { action: "pro_register_failed", entityType: "publishing_work", entityId: p.data.id, before: work, after: { status: "failed", upstream: { status: resp.status, body: errText } } });
      res.status(502).json({
        error: "pro_upstream_error",
        message: `${p.data.pro.toUpperCase()} вернул HTTP ${resp.status}`,
        upstreamBody: errText,
        work: updFailed,
      });
      return;
    }
    const json = await resp.json().catch(() => ({})) as { id?: string; externalId?: string; reference?: string };
    externalId = json.id ?? json.externalId ?? json.reference ?? null;
  } catch (e) {
    void auditMutation(req, { action: "pro_register_network_error", entityType: "publishing_work", entityId: p.data.id, before: work, after: { error: (e as Error).message } });
    res.status(502).json({
      error: "pro_network_error",
      message: `Не удалось связаться с ${p.data.pro.toUpperCase()}: ${(e as Error).message}`,
    });
    return;
  }

  const registeredWith = Array.from(new Set([...(work.registeredWith ?? []), p.data.pro]));
  const proFlag = ["ascap", "bmi", "songtrust"].includes(p.data.pro) ? { [p.data.pro]: true } : {};
  const [updated] = await db.update(publishingWorksTable).set({
    status: "registered",
    registeredWith,
    ...proFlag,
    updatedAt: new Date(),
  } as Record<string, unknown>).where(eq(publishingWorksTable.id, p.data.id)).returning();

  void auditMutation(req, { action: "pro_register", entityType: "publishing_work", entityId: p.data.id, before: work, after: { ...updated, externalId } });
  res.json({ ok: true, work: updated, pro: p.data.pro, status: "submitted", externalId });
});

export default router;
