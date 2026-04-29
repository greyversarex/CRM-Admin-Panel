/**
 * Analytics — UGC / Social + Realtime Alerts
 *
 * GET    /api/analytics/ugc?platform=&from=&to=
 * POST   /api/analytics/ugc                        — ручная регистрация метрик (CSV-импорт через UI)
 * GET    /api/analytics/realtime-alerts?status=
 * POST   /api/analytics/realtime-alerts            — создать алерт вручную
 * PATCH  /api/analytics/realtime-alerts/:id        — resolve / re-open
 *
 * Доступ: admin/manager (общий guard в routes/index.ts на /analytics).
 */
import { Router } from "express";
import { z } from "zod";
import { db, ugcMetricsTable, realtimeAlertsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql, isNull } from "drizzle-orm";
import { auditMutation } from "../lib/audit";

const router = Router();

const IdParam = z.object({ id: z.coerce.number().int().positive() });

// ── UGC ────────────────────────────────────────────────────────────────────
router.get("/analytics/ugc", async (req, res) => {
  const platform = typeof req.query.platform === "string" ? req.query.platform : null;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;

  const conds = [];
  if (platform) conds.push(eq(ugcMetricsTable.platform, platform));
  if (from && !Number.isNaN(from.getTime())) conds.push(gte(ugcMetricsTable.recordedAt, from));
  if (to && !Number.isNaN(to.getTime())) conds.push(lte(ugcMetricsTable.recordedAt, to));

  const where = conds.length ? and(...conds) : undefined;

  const rows = await db.select().from(ugcMetricsTable).where(where).orderBy(desc(ugcMetricsTable.recordedAt)).limit(500);

  // Aggregate by platform
  const byPlatform = await db.select({
    platform: ugcMetricsTable.platform,
    views: sql<number>`coalesce(sum(${ugcMetricsTable.views}), 0)::bigint`,
    likes: sql<number>`coalesce(sum(${ugcMetricsTable.likes}), 0)::bigint`,
    shares: sql<number>`coalesce(sum(${ugcMetricsTable.shares}), 0)::bigint`,
    videos: sql<number>`coalesce(sum(${ugcMetricsTable.videosCount}), 0)::bigint`,
    revenueCents: sql<number>`coalesce(sum(${ugcMetricsTable.revenueCents}), 0)::bigint`,
  }).from(ugcMetricsTable).where(where).groupBy(ugcMetricsTable.platform);

  res.json({ rows, byPlatform });
});

const UgcMetricBody = z.object({
  platform: z.enum(["youtube_cms", "tiktok", "meta", "instagram"]),
  externalContentId: z.string().max(120).nullish(),
  releaseId: z.number().int().positive().nullish(),
  trackId: z.number().int().positive().nullish(),
  views: z.number().int().nonnegative().default(0),
  likes: z.number().int().nonnegative().default(0),
  shares: z.number().int().nonnegative().default(0),
  videosCount: z.number().int().nonnegative().default(0),
  revenueCents: z.number().int().nonnegative().default(0),
  recordedAt: z.string().datetime().optional(),
});

router.post("/analytics/ugc", async (req, res) => {
  const parsed = UgcMetricBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const data = { ...parsed.data, recordedAt: parsed.data.recordedAt ? new Date(parsed.data.recordedAt) : new Date() };
  const [row] = await db.insert(ugcMetricsTable).values(data).returning();
  void auditMutation(req, { action: "create", entityType: "ugc_metric", entityId: row.id, before: null, after: row });
  res.status(201).json(row);
});

// ── Realtime Alerts ────────────────────────────────────────────────────────
router.get("/analytics/realtime-alerts", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null; // "open" | "resolved"
  const conds = [];
  if (status === "open") conds.push(isNull(realtimeAlertsTable.resolvedAt));
  // resolved → resolvedAt IS NOT NULL — drizzle: `sql\`...\``; используем not(isNull)
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select().from(realtimeAlertsTable).where(where).orderBy(desc(realtimeAlertsTable.createdAt)).limit(200);
  const openCount = await db.select({ c: sql<number>`count(*)::int` }).from(realtimeAlertsTable).where(isNull(realtimeAlertsTable.resolvedAt));
  res.json({ alerts: rows, openCount: openCount[0]?.c ?? 0 });
});

const AlertBody = z.object({
  kind: z.enum(["spike", "drop", "fraud", "takedown", "system_error", "payment_failed"]),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  message: z.string().min(1).max(2000),
  entityType: z.string().max(80).nullish(),
  entityId: z.number().int().positive().nullish(),
  meta: z.record(z.string(), z.unknown()).default({}),
});

router.post("/analytics/realtime-alerts", async (req, res) => {
  const parsed = AlertBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const [row] = await db.insert(realtimeAlertsTable).values(parsed.data).returning();
  void auditMutation(req, { action: "create", entityType: "realtime_alert", entityId: row.id, before: null, after: row });
  res.status(201).json(row);
});

router.patch("/analytics/realtime-alerts/:id", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const body = z.object({ resolved: z.boolean() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "validation" }); return; }
  const userId = req.session?.user?.id ?? null;
  const patch: Record<string, unknown> = body.data.resolved
    ? { resolvedAt: new Date(), resolvedBy: userId }
    : { resolvedAt: null, resolvedBy: null };
  const [row] = await db.update(realtimeAlertsTable).set(patch).where(eq(realtimeAlertsTable.id, p.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: body.data.resolved ? "resolve" : "reopen", entityType: "realtime_alert", entityId: row.id, before: null, after: row });
  res.json(row);
});

export default router;
