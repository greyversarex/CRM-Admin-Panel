/**
 * Communications routes — §10 ТЗ
 *
 * Templates:
 *   GET    /api/communications/templates
 *   POST   /api/communications/templates
 *   GET    /api/communications/templates/:id
 *   PUT    /api/communications/templates/:id
 *   DELETE /api/communications/templates/:id
 *   POST   /api/communications/templates/:id/preview   — рендер с тестовыми переменными
 *
 * Campaigns:
 *   GET    /api/communications/campaigns
 *   POST   /api/communications/campaigns
 *   GET    /api/communications/campaigns/:id
 *   PUT    /api/communications/campaigns/:id
 *   POST   /api/communications/campaigns/:id/send      — немедленная отправка
 *   POST   /api/communications/campaigns/:id/cancel
 *
 * Automation Triggers:
 *   GET    /api/communications/triggers
 *   POST   /api/communications/triggers
 *   PUT    /api/communications/triggers/:id
 *   PATCH  /api/communications/triggers/:id/toggle
 *   DELETE /api/communications/triggers/:id
 *
 * Internal Notes:
 *   GET    /api/communications/notes?entity_type=release&entity_id=5
 *   POST   /api/communications/notes
 *   PUT    /api/communications/notes/:id
 *   DELETE /api/communications/notes/:id
 *   PATCH  /api/communications/notes/:id/pin
 */

import { Router } from "express";
import { z } from "zod";
import { db, emailTemplatesTable, campaignsTable, automationTriggersTable, internalNotesTable, usersTable } from "@workspace/db";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { getSessionUser } from "../lib/auth";
import { logger } from "../lib/logger";
import { createNotification } from "../services/notifications";
import { sendMailAndForget } from "../lib/mail";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDto<T extends object>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out as T;
}

// ── Templates ────────────────────────────────────────────────────────────────

const TemplateBody = z.object({
  code: z.string().min(1).max(100).regex(/^[a-z0-9_.-]+$/, "code must be lowercase slug"),
  name: z.string().min(1).max(200),
  type: z.enum(["email", "push"]).default("email"),
  category: z.string().default("general"),
  subject: z.string().default(""),
  bodyHtml: z.string().default(""),
  bodyText: z.string().default(""),
  variables: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

router.get("/communications/templates", async (_req, res): Promise<void> => {
  const rows = await db.select().from(emailTemplatesTable).orderBy(asc(emailTemplatesTable.category), asc(emailTemplatesTable.name));
  res.json({ data: rows.map(toDto) });
});

router.get("/communications/templates/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [row] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toDto(row));
});

router.post("/communications/templates", async (req, res): Promise<void> => {
  const parsed = TemplateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = getSessionUser(req);
  const [row] = await db.insert(emailTemplatesTable).values({ ...parsed.data, createdBy: user?.id ?? null }).returning();
  res.status(201).json(toDto(row));
});

router.put("/communications/templates/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const parsed = TemplateBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(emailTemplatesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(emailTemplatesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toDto(row));
});

router.delete("/communications/templates/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [del] = await db.delete(emailTemplatesTable).where(eq(emailTemplatesTable.id, id)).returning({ id: emailTemplatesTable.id });
  if (!del) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.post("/communications/templates/:id/preview", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [row] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const vars: Record<string, string> = req.body ?? {};
  let html = row.bodyHtml;
  let text = row.bodyText;
  let subject = row.subject;
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g");
    html = html.replace(re, v);
    text = text.replace(re, v);
    subject = subject.replace(re, v);
  }
  res.json({ subject, bodyHtml: html, bodyText: text });
});

// ── Campaigns ────────────────────────────────────────────────────────────────

const CampaignBody = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["email", "push"]).default("email"),
  templateId: z.number().int().nullable().optional(),
  subject: z.string().optional(),
  audienceFilter: z.record(z.unknown()).default({}),
  scheduledAt: z.string().datetime().optional(),
});

router.get("/communications/campaigns", async (_req, res): Promise<void> => {
  const rows = await db.select().from(campaignsTable).orderBy(desc(campaignsTable.createdAt));
  res.json({ data: rows.map(toDto) });
});

router.get("/communications/campaigns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [row] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toDto(row));
});

router.post("/communications/campaigns", async (req, res): Promise<void> => {
  const parsed = CampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = getSessionUser(req);
  const [row] = await db.insert(campaignsTable).values({
    ...parsed.data,
    scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
    createdBy: user?.id ?? null,
  }).returning();
  res.status(201).json(toDto(row));
});

router.put("/communications/campaigns/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const parsed = CampaignBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update = {
    ...parsed.data,
    scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
    updatedAt: new Date(),
  };
  const [row] = await db.update(campaignsTable).set(update).where(eq(campaignsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toDto(row));
});

router.post("/communications/campaigns/:id/send", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [camp] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!camp) { res.status(404).json({ error: "Not found" }); return; }
  if (camp.status === "sent") { res.status(409).json({ error: "Campaign already sent" }); return; }

  // Реальная фильтрация аудитории по ролям и статусу
  const filter = camp.audienceFilter as Record<string, unknown>;
  const roleFilter = Array.isArray(filter.roles) ? (filter.roles as string[]) : null;
  const labelIdFilter = typeof filter.labelId === "number" ? (filter.labelId as number) : null;

  const conds = [eq(usersTable.status, "active")];
  if (roleFilter && roleFilter.length > 0) conds.push(inArray(usersTable.role, roleFilter));
  if (labelIdFilter !== null) conds.push(eq(usersTable.labelId, labelIdFilter));

  const recipients = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(and(...conds));

  // Подгружаем шаблон (если задан) — рендерим subject/тело с подстановкой имени
  let tpl: { subject: string; bodyHtml: string; bodyText: string } | null = null;
  if (camp.templateId) {
    const [t] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, camp.templateId));
    if (t && t.isActive) {
      tpl = { subject: t.subject || camp.subject || camp.name, bodyHtml: t.bodyHtml, bodyText: t.bodyText };
    }
  }

  const subjectBase = tpl?.subject ?? camp.subject ?? camp.name;
  const errors: string[] = [];

  // Реально создаём notifications + кладём письма в SMTP-очередь
  for (const r of recipients) {
    const vars: Record<string, string> = {
      user_name: r.name ?? r.email,
      platform_name: "Tajik Music Distribution",
    };
    const interp = (s: string) =>
      Object.entries(vars).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v), s);

    const subject = interp(subjectBase);
    const text = tpl ? interp(tpl.bodyText) : subject;
    const html = tpl ? interp(tpl.bodyHtml) : undefined;

    void createNotification({
      userId: r.id,
      type: "campaign",
      title: subject,
      body: text.slice(0, 500),
      entityType: "general",
      link: "/communications",
    }).catch((err) => errors.push(`notification ${r.id}: ${err instanceof Error ? err.message : String(err)}`));

    if (camp.type === "email") {
      sendMailAndForget({ to: r.email, subject, text: text || subject, html });
    }
  }

  const [updated] = await db.update(campaignsTable).set({
    status: "sent",
    sentAt: new Date(),
    recipientCount: recipients.length,
    errors,
    updatedAt: new Date(),
  }).where(eq(campaignsTable.id, id)).returning();

  logger.info({
    campaignId: id, recipientCount: recipients.length, type: camp.type, hasTemplate: !!tpl,
  }, "[campaign] sent");
  res.json({ ok: true, recipientCount: recipients.length, campaign: toDto(updated) });
});

router.post("/communications/campaigns/:id/cancel", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [row] = await db.update(campaignsTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(campaignsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toDto(row));
});

// ── Quick-send: создать кампанию и сразу отправить ───────────────────────────
// POST /api/communications/campaigns/quick-send
// Body: { name?, subject, bodyHtml, bodyText?, audienceFilter?, type? }
// Returns: { ok, recipientCount, campaign }

const QuickSendBody = z.object({
  name: z.string().max(200).optional(),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional().default(""),
  type: z.enum(["email", "push", "telegram", "whatsapp"]).default("email"),
  audienceFilter: z.record(z.unknown()).optional().default({}),
});

router.post("/communications/campaigns/quick-send", async (req, res): Promise<void> => {
  const parsed = QuickSendBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { name, subject, bodyHtml, bodyText, type, audienceFilter } = parsed.data;
  const campaignName = name?.trim() || `Рассылка от ${new Date().toLocaleDateString("ru-RU")}`;

  const [camp] = await db.insert(campaignsTable).values({
    name: campaignName,
    type,
    status: "sending",
    subject,
    audienceFilter,
    templateId: null,
  }).returning();

  const filter = audienceFilter as Record<string, unknown>;
  const roleFilter = Array.isArray(filter.roles) ? (filter.roles as string[]) : null;
  const labelIdFilter = typeof filter.labelId === "number" ? (filter.labelId as number) : null;

  const conds = [eq(usersTable.status, "active")];
  if (roleFilter && roleFilter.length > 0) conds.push(inArray(usersTable.role, roleFilter));
  if (labelIdFilter !== null) conds.push(eq(usersTable.labelId, labelIdFilter));

  const recipients = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(and(...conds));

  const errors: string[] = [];
  for (const r of recipients) {
    const vars: Record<string, string> = {
      user_name: r.name ?? r.email,
      platform_name: "Tajik Music Distribution",
    };
    const interp = (s: string) =>
      Object.entries(vars).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v), s);

    const subjInterp = interp(subject);
    const htmlInterp = interp(bodyHtml);
    const textInterp = interp(bodyText || subject);

    void createNotification({
      userId: r.id,
      type: "campaign",
      title: subjInterp,
      body: textInterp.slice(0, 500),
      entityType: "general",
      link: "/communications",
    }).catch((err) => errors.push(`notification ${r.id}: ${err instanceof Error ? err.message : String(err)}`));

    if (type === "email") {
      sendMailAndForget({ to: r.email, subject: subjInterp, text: textInterp || subjInterp, html: htmlInterp });
    }
  }

  const [updated] = await db.update(campaignsTable).set({
    status: "sent",
    sentAt: new Date(),
    recipientCount: recipients.length,
    errors,
    updatedAt: new Date(),
  }).where(eq(campaignsTable.id, camp.id)).returning();

  logger.info({ campaignId: camp.id, recipientCount: recipients.length }, "[quick-send] campaign sent");
  res.status(201).json({ ok: true, recipientCount: recipients.length, campaign: toDto(updated) });
});

// ── Automation Triggers ──────────────────────────────────────────────────────

const TriggerBody = z.object({
  name: z.string().min(1).max(200),
  event: z.string().min(1),
  enabled: z.boolean().default(false),
  templateId: z.number().int().nullable().optional(),
  delayMinutes: z.number().int().min(0).default(0),
  recipient: z.enum(["requester", "assignee", "admins", "managers", "all"]).default("requester"),
});

router.get("/communications/triggers", async (_req, res): Promise<void> => {
  const rows = await db.select().from(automationTriggersTable).orderBy(asc(automationTriggersTable.event));
  res.json({ data: rows.map(toDto) });
});

router.post("/communications/triggers", async (req, res): Promise<void> => {
  const parsed = TriggerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(automationTriggersTable).values(parsed.data).returning();
  res.status(201).json(toDto(row));
});

router.put("/communications/triggers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const parsed = TriggerBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(automationTriggersTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(automationTriggersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toDto(row));
});

router.patch("/communications/triggers/:id/toggle", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [existing] = await db.select({ enabled: automationTriggersTable.enabled }).from(automationTriggersTable).where(eq(automationTriggersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(automationTriggersTable).set({ enabled: !existing.enabled, updatedAt: new Date() }).where(eq(automationTriggersTable.id, id)).returning();
  res.json(toDto(row));
});

router.delete("/communications/triggers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [del] = await db.delete(automationTriggersTable).where(eq(automationTriggersTable.id, id)).returning({ id: automationTriggersTable.id });
  if (!del) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

// ── Internal Notes ────────────────────────────────────────────────────────────

const NoteBody = z.object({
  entityType: z.string().min(1),
  entityId: z.number().int(),
  body: z.string().min(1),
  tags: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
});

const ENTITY_TYPES = ["release", "artist", "label", "user", "ticket"] as const;

router.get("/communications/notes", async (req, res): Promise<void> => {
  const entityType = req.query.entity_type as string;
  const entityId = parseInt(req.query.entity_id as string, 10);
  if (!entityType || !Number.isFinite(entityId)) { res.status(400).json({ error: "entity_type and entity_id required" }); return; }
  const rows = await db.select({
    id: internalNotesTable.id,
    entityType: internalNotesTable.entityType,
    entityId: internalNotesTable.entityId,
    body: internalNotesTable.body,
    tags: internalNotesTable.tags,
    pinned: internalNotesTable.pinned,
    editedAt: internalNotesTable.editedAt,
    createdAt: internalNotesTable.createdAt,
    authorUserId: internalNotesTable.authorUserId,
    authorName: usersTable.name,
    authorEmail: usersTable.email,
    authorRole: usersTable.role,
  })
    .from(internalNotesTable)
    .leftJoin(usersTable, eq(internalNotesTable.authorUserId, usersTable.id))
    .where(and(eq(internalNotesTable.entityType, entityType), eq(internalNotesTable.entityId, entityId)))
    .orderBy(desc(internalNotesTable.pinned), asc(internalNotesTable.createdAt));
  res.json({
    data: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt?.toISOString(),
      editedAt: r.editedAt?.toISOString() ?? null,
    })),
  });
});

router.post("/communications/notes", async (req, res): Promise<void> => {
  const parsed = NoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = getSessionUser(req);
  const [row] = await db.insert(internalNotesTable).values({ ...parsed.data, authorUserId: user?.id ?? null }).returning();
  res.status(201).json(toDto(row));
});

router.put("/communications/notes/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const body = z.object({ body: z.string().min(1), tags: z.array(z.string()).optional() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.update(internalNotesTable).set({ ...body.data, editedAt: new Date() }).where(eq(internalNotesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toDto(row));
});

router.delete("/communications/notes/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [del] = await db.delete(internalNotesTable).where(eq(internalNotesTable.id, id)).returning({ id: internalNotesTable.id });
  if (!del) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

router.patch("/communications/notes/:id/pin", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [existing] = await db.select({ pinned: internalNotesTable.pinned }).from(internalNotesTable).where(eq(internalNotesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(internalNotesTable).set({ pinned: !existing.pinned }).where(eq(internalNotesTable.id, id)).returning();
  res.json(toDto(row));
});

// ── Summary counts (for Overview tab) ────────────────────────────────────────

router.get("/communications/overview", async (_req, res): Promise<void> => {
  const [templates, campaigns, triggers] = await Promise.all([
    db.select({ id: emailTemplatesTable.id, isActive: emailTemplatesTable.isActive }).from(emailTemplatesTable),
    db.select({ id: campaignsTable.id, status: campaignsTable.status, recipientCount: campaignsTable.recipientCount }).from(campaignsTable),
    db.select({ id: automationTriggersTable.id, enabled: automationTriggersTable.enabled, fireCount: automationTriggersTable.fireCount }).from(automationTriggersTable),
  ]);

  const totalEmailsSent = campaigns.filter((c) => c.status === "sent").reduce((acc, c) => acc + c.recipientCount, 0);

  res.json({
    templates: { total: templates.length, active: templates.filter((t) => t.isActive).length },
    campaigns: { total: campaigns.length, sent: campaigns.filter((c) => c.status === "sent").length, draft: campaigns.filter((c) => c.status === "draft").length, totalEmailsSent },
    triggers: { total: triggers.length, enabled: triggers.filter((t) => t.enabled).length, totalFires: triggers.reduce((acc, t) => acc + t.fireCount, 0) },
  });
});

export default router;
