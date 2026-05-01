/**
 * Automation API
 *
 * GET    /api/automation/scheduled        — список фоновых задач (read-only)
 * GET    /api/automation/fraud-rules      — список правил детекции фрода
 * POST   /api/automation/fraud-rules
 * PATCH  /api/automation/fraud-rules/:id
 * DELETE /api/automation/fraud-rules/:id
 * GET    /api/automation/fraud-alerts
 * PATCH  /api/automation/fraud-alerts/:id
 * GET    /api/automation/moderation-rules
 * POST   /api/automation/moderation-rules
 * PATCH  /api/automation/moderation-rules/:id
 * DELETE /api/automation/moderation-rules/:id
 *
 * Доступ: admin/manager only (проставляется в routes/index.ts).
 */
import { Router } from "express";
import { z } from "zod";
import { db, fraudRulesTable, fraudAlertsTable, moderationRulesTable, paymentAutomationRulesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { auditMutation } from "../lib/audit";

const router = Router();

const IdParam = z.object({ id: z.coerce.number().int().positive() });

// ── Scheduled tasks ─────────────────────────────────────────────────────────
// Возвращаем ДВЕ группы: (1) системные воркеры, скомпилированные в код
// (видно по наличию файла в src/workers/) и (2) настраиваемые админом правила
// автоматизации (paymentAutomationRulesTable со scheduleCron). lastRunAt
// читается из БД, если он там есть.

interface ScheduledTaskOut {
  source: "system" | "rule";
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  ruleId?: number;
}

// Системные воркеры — описания и расписания соответствуют коду в src/workers/.
// Если воркер удалён из кода, его нужно убрать и отсюда (намеренно дублируется,
// чтобы UI показывал именно то, что реально работает на этом сервере).
const SYSTEM_WORKERS: Omit<ScheduledTaskOut, "source" | "lastRunAt">[] = [
  { name: "delivery-worker",   description: "Отправка DDEX-сообщений в очереди и retry",  schedule: "каждые 30 сек", enabled: true },
  { name: "ack-poller",        description: "Опрос SFTP-ящиков для входящих ack",         schedule: "каждые 10 мин", enabled: true },
  { name: "webhook-dispatcher", description: "Доставка webhook-сообщений подписчикам",     schedule: "каждые 30 сек", enabled: true },
  { name: "trigger-evaluator",  description: "Срабатывание email-триггеров автоматизации", schedule: "при событии",   enabled: true },
];

router.get("/automation/scheduled", async (_req, res) => {
  // Реальные cron-правила выплат из БД
  const rules = await db.select().from(paymentAutomationRulesTable).orderBy(desc(paymentAutomationRulesTable.createdAt));

  const tasks: ScheduledTaskOut[] = [
    ...SYSTEM_WORKERS.map((w) => ({
      source: "system" as const,
      ...w,
      lastRunAt: null,
    })),
    ...rules.map((r) => ({
      source: "rule" as const,
      name: r.name,
      description: r.notes ?? r.kind,
      schedule: r.scheduleCron ?? "при событии",
      enabled: r.enabled,
      lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
      ruleId: r.id,
    })),
  ];

  res.json({ tasks });
});

// ── Fraud rules ──────────────────────────────────────────────────────────────

const FraudRuleBody = z.object({
  name: z.string().min(1).max(200),
  ruleType: z.enum(["spike_streams", "low_completion", "geo_burst", "duplicate_play", "stream_botting", "custom"]),
  threshold: z.number().int().min(0),
  windowMinutes: z.number().int().min(1).max(10080).default(60),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  enabled: z.boolean().default(true),
  notes: z.string().max(2000).nullish(),
});

router.get("/automation/fraud-rules", async (_req, res) => {
  const rows = await db.select().from(fraudRulesTable).orderBy(desc(fraudRulesTable.createdAt));
  res.json({ rules: rows });
});

router.post("/automation/fraud-rules", async (req, res) => {
  const parsed = FraudRuleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const [row] = await db.insert(fraudRulesTable).values(parsed.data).returning();
  void auditMutation(req, { action: "create", entityType: "fraud_rule", entityId: row.id, before: null, after: row });
  res.status(201).json(row);
});

router.patch("/automation/fraud-rules/:id", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const parsed = FraudRuleBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation" }); return; }
  const [row] = await db.update(fraudRulesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(fraudRulesTable.id, p.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "update", entityType: "fraud_rule", entityId: row.id, before: null, after: row });
  res.json(row);
});

router.delete("/automation/fraud-rules/:id", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const [del] = await db.delete(fraudRulesTable).where(eq(fraudRulesTable.id, p.data.id)).returning();
  if (!del) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "delete", entityType: "fraud_rule", entityId: p.data.id, before: del, after: null });
  res.json({ ok: true });
});

// ── Fraud alerts ─────────────────────────────────────────────────────────────

router.get("/automation/fraud-alerts", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  let q = db.select().from(fraudAlertsTable).$dynamic();
  if (status) q = q.where(eq(fraudAlertsTable.status, status));
  const rows = await q.orderBy(desc(fraudAlertsTable.createdAt)).limit(200);
  res.json({ alerts: rows });
});

const FraudAlertPatch = z.object({
  status: z.enum(["open", "investigating", "resolved", "dismissed"]).optional(),
  resolutionNote: z.string().max(2000).nullish(),
});

router.patch("/automation/fraud-alerts/:id", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const parsed = FraudAlertPatch.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "validation" }); return; }
  const userId = req.session?.user?.id ?? null;
  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "resolved" || parsed.data.status === "dismissed") {
    patch.resolvedBy = userId;
    patch.resolvedAt = new Date();
  }
  const [row] = await db.update(fraudAlertsTable).set(patch).where(eq(fraudAlertsTable.id, p.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "update", entityType: "fraud_alert", entityId: row.id, before: null, after: row });
  res.json(row);
});

// ── Moderation rules ─────────────────────────────────────────────────────────

const ModerationRuleBody = z.object({
  name: z.string().min(1).max(200),
  field: z.string().min(1).max(80),
  ruleType: z.enum(["required", "regex", "min_length", "max_length", "blocklist"]),
  pattern: z.string().max(2000).nullish(),
  minLength: z.number().int().min(0).nullish(),
  maxLength: z.number().int().min(0).nullish(),
  blockOnFail: z.boolean().default(false),
  severity: z.enum(["info", "warning", "error"]).default("warning"),
  enabled: z.boolean().default(true),
  notes: z.string().max(2000).nullish(),
});

router.get("/automation/moderation-rules", async (_req, res) => {
  const rows = await db.select().from(moderationRulesTable).orderBy(desc(moderationRulesTable.createdAt));
  res.json({ rules: rows });
});

router.post("/automation/moderation-rules", async (req, res) => {
  const parsed = ModerationRuleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const [row] = await db.insert(moderationRulesTable).values(parsed.data).returning();
  void auditMutation(req, { action: "create", entityType: "moderation_rule", entityId: row.id, before: null, after: row });
  res.status(201).json(row);
});

router.patch("/automation/moderation-rules/:id", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const parsed = ModerationRuleBody.partial().safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "validation" }); return; }
  const [row] = await db.update(moderationRulesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(moderationRulesTable.id, p.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "update", entityType: "moderation_rule", entityId: row.id, before: null, after: row });
  res.json(row);
});

router.delete("/automation/moderation-rules/:id", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const [del] = await db.delete(moderationRulesTable).where(eq(moderationRulesTable.id, p.data.id)).returning();
  if (!del) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "delete", entityType: "moderation_rule", entityId: p.data.id, before: del, after: null });
  res.json({ ok: true });
});

export default router;
