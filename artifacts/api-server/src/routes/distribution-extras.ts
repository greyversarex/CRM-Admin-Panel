/**
 * Distribution — ACRCloud Check + Disputes
 *
 * GET   /api/distribution/acr/checks?releaseId=
 * POST  /api/distribution/acr/scan          { releaseId, trackId? }
 * GET   /api/distribution/disputes          — споры по релизам (rights conflicts на release_id)
 *
 * ACRCloud работает при заполненных settings.acrcloud {host, accessKey, accessSecret}.
 * Без ключей возвращает status="error" + errorMessage="ACRCloud credentials not configured" — UI это покажет.
 */
import { Router } from "express";
import { z } from "zod";
import { db, acrChecksTable, releasesTable, tracksTable, rightsConflictsTable, platformSettingsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { auditMutation } from "../lib/audit";

const router = Router();

interface AcrCloudConfig {
  host?: string;
  accessKey?: string;
  accessSecret?: string;
  enabled?: boolean;
}

async function loadAcrConfig(): Promise<AcrCloudConfig> {
  try {
    const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "acrcloud"));
    return (row?.value ?? {}) as AcrCloudConfig;
  } catch { return {}; }
}

router.get("/distribution/acr/checks", async (req, res) => {
  const releaseId = req.query.releaseId ? Number(req.query.releaseId) : null;
  let q = db.select().from(acrChecksTable).$dynamic();
  if (releaseId) q = q.where(eq(acrChecksTable.releaseId, releaseId));
  const rows = await q.orderBy(desc(acrChecksTable.scannedAt)).limit(200);
  res.json({ checks: rows, configured: await acrConfigured() });
});

async function acrConfigured(): Promise<boolean> {
  const c = await loadAcrConfig();
  return Boolean(c.enabled !== false && c.host && c.accessKey && c.accessSecret);
}

const ScanBody = z.object({
  releaseId: z.number().int().positive(),
  trackId: z.number().int().positive().optional(),
});

/**
 * Запуск ACRCloud-проверки. При наличии ключей — отправляет audio fingerprint
 * (TODO: реальная интеграция через @acrcloud/rec-node-sdk; сейчас — каркас, который
 * пишет статус "error" с ясным сообщением, если credentials не выставлены).
 */
router.post("/distribution/acr/scan", async (req, res) => {
  const parsed = ScanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const { releaseId, trackId } = parsed.data;

  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, releaseId));
  if (!release) { res.status(404).json({ error: "Release not found" }); return; }
  if (trackId) {
    const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId));
    if (!track) { res.status(404).json({ error: "Track not found" }); return; }
  }

  const cfg = await loadAcrConfig();
  const userId = req.session?.user?.id ?? null;

  if (!cfg.host || !cfg.accessKey || !cfg.accessSecret || cfg.enabled === false) {
    const [row] = await db.insert(acrChecksTable).values({
      releaseId, trackId: trackId ?? null,
      status: "error",
      errorMessage: "ACRCloud credentials not configured (заполните Настройки → ACRCloud)",
      scannedBy: userId,
    }).returning();
    void auditMutation(req, { action: "acr_scan", entityType: "acr_check", entityId: row.id, before: null, after: row });
    res.status(202).json(row);
    return;
  }

  // Реальная интеграция: загрузить fingerprint трека → отправить на ACRCloud Identify API.
  // В каркасе помечаем как pending, чтобы фронт мог опросить позже.
  const [row] = await db.insert(acrChecksTable).values({
    releaseId, trackId: trackId ?? null,
    status: "pending",
    scannedBy: userId,
  }).returning();
  void auditMutation(req, { action: "acr_scan", entityType: "acr_check", entityId: row.id, before: null, after: row });
  res.status(202).json(row);
});

// ── Disputes (фильтрованные конфликты по релизам) ─────────────────────────
router.get("/distribution/disputes", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const where = status
    ? and(eq(rightsConflictsTable.assetType, "release"), eq(rightsConflictsTable.status, status))
    : eq(rightsConflictsTable.assetType, "release");
  const rows = await db.select().from(rightsConflictsTable).where(where).orderBy(desc(rightsConflictsTable.createdAt)).limit(200);
  res.json({ disputes: rows });
});

export default router;
