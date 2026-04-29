/**
 * Platform Settings routes — §12 ТЗ
 *
 *   GET    /api/settings/:key              — получить настройки секции
 *   PUT    /api/settings/:key              — сохранить (merge) настройки секции
 *   GET    /api/api-keys                   — список API-ключей (без hash)
 *   POST   /api/api-keys                   — создать ключ (возвращает raw once)
 *   DELETE /api/api-keys/:id               — удалить
 *   GET    /api/webhooks                   — список webhooks
 *   POST   /api/webhooks                   — создать
 *   PUT    /api/webhooks/:id               — обновить
 *   DELETE /api/webhooks/:id               — удалить
 *   POST   /api/webhooks/:id/test          — тестовый ping
 */

import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { db, platformSettingsTable, apiKeysTable, webhooksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSessionUser } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { logger } from "../lib/logger";

const router = Router();

// ── DEFAULT VALUES ───────────────────────────────────────────────────

const DEFAULTS: Record<string, Record<string, unknown>> = {
  general: {
    platformName: "Tajik Music Distribution",
    contactEmail: "admin@tajikmusic.com",
    supportEmail: "support@tajikmusic.com",
    timezone: "Asia/Dushanbe",
    language: "ru",
    logoUrl: "",
    faviconUrl: "",
    primaryColor: "#6d28d9",
    maintenanceMode: false,
    registrationOpen: true,
  },
  security: {
    sessionTimeoutMinutes: 1440,
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 15,
    require2FA: false,
    ipWhitelist: [],
    passwordMinLength: 8,
    passwordRequireUppercase: true,
    passwordRequireNumbers: true,
    passwordRequireSpecial: false,
    auditRetentionDays: 365,
  },
  storage: {
    provider: "local",
    localBasePath: "./uploads",
    s3Bucket: "",
    s3Region: "eu-central-1",
    s3KeyPrefix: "tjm/",
    cdnBaseUrl: "",
    maxFileSizeMb: 500,
    allowedAudioFormats: ["wav", "flac", "mp3", "aiff"],
    allowedImageFormats: ["jpg", "jpeg", "png", "webp"],
  },
  notifications: {
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpFromAddress: "noreply@tajikmusic.com",
    smtpFromName: "Tajik Music Distribution",
    smtpTls: true,
    emailEnabled: false,
    pushEnabled: false,
    pushVapidPublicKey: "",
    notifyOnNewRelease: true,
    notifyOnPayment: true,
    notifyOnKyc: true,
    notifyOnDelivery: true,
  },
  currency: {
    defaultCurrency: "USD",
    supportedCurrencies: ["USD", "EUR", "RUB", "TJS"],
    taxEnabled: false,
    taxRate: 0,
    taxLabel: "НДС",
    taxIncluded: false,
    royaltyPayoutThreshold: 50,
    payoutCurrencies: ["USD", "TJS"],
    fxUpdateFrequency: "daily",
  },
};

// ── /api/settings/:key ───────────────────────────────────────────────

const VALID_KEYS = ["general", "security", "storage", "notifications", "currency"] as const;

router.get("/settings/:key", async (req, res): Promise<void> => {
  const key = req.params.key as string;
  if (!VALID_KEYS.includes(key as typeof VALID_KEYS[number])) {
    res.status(400).json({ error: `Unknown settings key: ${key}` }); return;
  }
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
  const value = row ? { ...DEFAULTS[key], ...(row.value as Record<string, unknown>) } : DEFAULTS[key];
  res.json({ key, value, updatedAt: row?.updatedAt?.toISOString() ?? null });
});

router.put("/settings/:key", async (req, res): Promise<void> => {
  const key = req.params.key as string;
  if (!VALID_KEYS.includes(key as typeof VALID_KEYS[number])) {
    res.status(400).json({ error: `Unknown settings key: ${key}` }); return;
  }
  const body = req.body as Record<string, unknown>;
  if (!body || typeof body !== "object") { res.status(400).json({ error: "Body must be JSON object" }); return; }

  const [existing] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
  const merged: Record<string, unknown> = { ...(existing?.value ?? {}), ...body };

  const [row] = existing
    ? await db.update(platformSettingsTable).set({ value: merged }).where(eq(platformSettingsTable.key, key)).returning()
    : await db.insert(platformSettingsTable).values({ key, value: merged }).returning();

  void auditMutation(req, {
    action: "update",
    entityType: "platform_settings",
    entityId: row.id,
    before: existing?.value ?? {},
    after: merged,
  });

  res.json({ key, value: { ...DEFAULTS[key], ...merged }, updatedAt: row.updatedAt.toISOString() });
});

// ── /api/api-keys ────────────────────────────────────────────────────

router.get("/api-keys", async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: apiKeysTable.id,
    name: apiKeysTable.name,
    keyPrefix: apiKeysTable.keyPrefix,
    permissions: apiKeysTable.permissions,
    enabled: apiKeysTable.enabled,
    lastUsedAt: apiKeysTable.lastUsedAt,
    expiresAt: apiKeysTable.expiresAt,
    createdAt: apiKeysTable.createdAt,
    createdBy: apiKeysTable.createdBy,
  }).from(apiKeysTable).orderBy(apiKeysTable.createdAt);
  res.json({
    data: rows.map((r) => ({
      ...r,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

const CreateApiKeyBody = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().optional(),
});

router.post("/api-keys", async (req, res): Promise<void> => {
  const parsed = CreateApiKeyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const user = getSessionUser(req);
  const rawKey = `tjm_${randomBytes(32).toString("hex")}`;
  const keyPrefix = rawKey.slice(0, 12);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const [row] = await db.insert(apiKeysTable).values({
    name: parsed.data.name,
    keyPrefix,
    keyHash,
    permissions: parsed.data.permissions,
    createdBy: user?.id ?? null,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  }).returning();

  logger.info({ apiKeyId: row.id, name: row.name, createdBy: user?.id }, "api key created");
  res.status(201).json({
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    permissions: row.permissions,
    rawKey,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    note: "rawKey показывается однократно — сохраните его немедленно",
  });
});

router.delete("/api-keys/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [deleted] = await db.delete(apiKeysTable).where(eq(apiKeysTable.id, id)).returning({ id: apiKeysTable.id });
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.patch("/api-keys/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const body = z.object({ enabled: z.boolean().optional(), name: z.string().min(1).optional() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(apiKeysTable).set(body.data).where(eq(apiKeysTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: row.id, name: row.name, enabled: row.enabled });
});

// ── /api/webhooks ────────────────────────────────────────────────────

function toWebhookDto(w: typeof webhooksTable.$inferSelect) {
  return {
    id: w.id,
    name: w.name,
    url: w.url,
    events: w.events,
    enabled: w.enabled,
    retryCount: w.retryCount,
    timeoutMs: w.timeoutMs,
    lastTriggeredAt: w.lastTriggeredAt?.toISOString() ?? null,
    lastStatus: w.lastStatus,
    lastError: w.lastError,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    hasSecret: !!w.secret,
  };
}

const WebhookBody = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.string()).default([]),
  secret: z.string().optional(),
  enabled: z.boolean().default(true),
  retryCount: z.number().int().min(0).max(10).default(3),
  timeoutMs: z.number().int().min(1000).max(30000).default(5000),
});

router.get("/webhooks", async (_req, res): Promise<void> => {
  const rows = await db.select().from(webhooksTable).orderBy(webhooksTable.createdAt);
  res.json({ data: rows.map(toWebhookDto) });
});

router.post("/webhooks", async (req, res): Promise<void> => {
  const parsed = WebhookBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = getSessionUser(req);
  const [row] = await db.insert(webhooksTable).values({
    name: parsed.data.name,
    url: parsed.data.url,
    secret: parsed.data.secret ?? null,
    events: parsed.data.events,
    enabled: parsed.data.enabled,
    retryCount: parsed.data.retryCount,
    timeoutMs: parsed.data.timeoutMs,
    createdBy: user?.id ?? null,
  }).returning();
  res.status(201).json(toWebhookDto(row));
});

router.put("/webhooks/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const parsed = WebhookBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Partial<typeof webhooksTable.$inferInsert> = { ...parsed.data };
  if ("secret" in parsed.data) {
    update.secret = parsed.data.secret ?? null;
  }
  const [row] = await db.update(webhooksTable).set(update).where(eq(webhooksTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toWebhookDto(row));
});

router.delete("/webhooks/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [deleted] = await db.delete(webhooksTable).where(eq(webhooksTable.id, id)).returning({ id: webhooksTable.id });
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.post("/webhooks/:id/test", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [hook] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
  if (!hook) { res.status(404).json({ error: "Not found" }); return; }

  const payload = JSON.stringify({
    event: "webhook.test",
    timestamp: new Date().toISOString(),
    data: { message: "Test ping from Tajik Music Distribution" },
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), hook.timeoutMs);
  try {
    const r = await fetch(hook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "TajikMusic/1.0" },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    await db.update(webhooksTable).set({ lastStatus: r.status, lastTriggeredAt: new Date(), lastError: null }).where(eq(webhooksTable.id, id));
    res.json({ ok: r.ok, status: r.status, message: `HTTP ${r.status}` });
  } catch (e) {
    clearTimeout(timeout);
    const errMsg = (e as Error).message;
    await db.update(webhooksTable).set({ lastStatus: null, lastTriggeredAt: new Date(), lastError: errMsg }).where(eq(webhooksTable.id, id));
    res.json({ ok: false, status: null, message: errMsg });
  }
});

export default router;
