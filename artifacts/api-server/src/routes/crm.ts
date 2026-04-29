import { Router } from "express";
import { db, contactsTable, crmTasksTable, usersTable, releasesTable, tracksTable, artistsTable, transactionsTable, deliveriesTable } from "@workspace/db";
import { count, eq, desc, sum, sql, gte, and } from "drizzle-orm";
import {
  CreateContactBody, UpdateContactBody, GetContactParams, UpdateContactParams, DeleteContactParams,
  CreateCrmTaskBody, UpdateCrmTaskBody, GetCrmTaskParams, UpdateCrmTaskParams, DeleteCrmTaskParams,
} from "@workspace/api-zod";

const router = Router();

function formatContact(c: typeof contactsTable.$inferSelect) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function formatTask(t: typeof crmTasksTable.$inferSelect, assignedToName?: string | null) {
  return {
    ...t,
    assignedToName: assignedToName ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// Contacts
router.get("/crm/contacts", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  const contacts = await db.select().from(contactsTable).limit(limit).offset(offset).orderBy(desc(contactsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(contactsTable);

  res.json({
    data: contacts.map(formatContact),
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

router.post("/crm/contacts", async (req, res): Promise<void> => {
  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [contact] = await db.insert(contactsTable).values(parsed.data).returning();
  res.status(201).json(formatContact(contact));
});

router.get("/crm/contacts/:id", async (req, res): Promise<void> => {
  const params = GetContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, params.data.id));
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.json(formatContact(contact));
});

router.put("/crm/contacts/:id", async (req, res): Promise<void> => {
  const params = UpdateContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [contact] = await db.update(contactsTable).set(parsed.data).where(eq(contactsTable.id, params.data.id)).returning();
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.json(formatContact(contact));
});

router.delete("/crm/contacts/:id", async (req, res): Promise<void> => {
  const params = DeleteContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [contact] = await db.delete(contactsTable).where(eq(contactsTable.id, params.data.id)).returning();
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.sendStatus(204);
});

// Tasks
router.get("/crm/tasks", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  const tasks = await db.select().from(crmTasksTable).limit(limit).offset(offset).orderBy(desc(crmTasksTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(crmTasksTable);

  const userIds = tasks.map(t => t.assignedToId).filter(Boolean) as number[];
  const users = userIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
    : [];
  const userMap = new Map(users.map(u => [u.id, u.name]));

  res.json({
    data: tasks.map(t => formatTask(t, t.assignedToId ? userMap.get(t.assignedToId) : null)),
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

router.post("/crm/tasks", async (req, res): Promise<void> => {
  const parsed = CreateCrmTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db.insert(crmTasksTable).values(parsed.data).returning();
  res.status(201).json(formatTask(task));
});

router.get("/crm/tasks/:id", async (req, res): Promise<void> => {
  const params = GetCrmTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db.select().from(crmTasksTable).where(eq(crmTasksTable.id, params.data.id));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(formatTask(task));
});

router.put("/crm/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateCrmTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCrmTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db.update(crmTasksTable).set(parsed.data).where(eq(crmTasksTable.id, params.data.id)).returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(formatTask(task));
});

router.delete("/crm/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteCrmTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db.delete(crmTasksTable).where(eq(crmTasksTable.id, params.data.id)).returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.sendStatus(204);
});

// ─── Analytics endpoints ────────────────────────────────────────────────────

/**
 * GET /api/crm/analytics/overview
 * Общие метрики бизнеса: треки, артисты, релизы, выручка, доставки.
 */
router.get("/crm/analytics/overview", async (_req, res): Promise<void> => {
  const [[trackCount], [artistCount], [releaseCount], [userCount]] = await Promise.all([
    db.select({ count: count() }).from(tracksTable),
    db.select({ count: count() }).from(artistsTable),
    db.select({ count: count() }).from(releasesTable),
    db.select({ count: count() }).from(usersTable),
  ]);

  const [revenueRow] = await db
    .select({ total: sum(transactionsTable.amount) })
    .from(transactionsTable)
    .where(eq(transactionsTable.type, "royalty"));

  const [deliveryRow] = await db
    .select({ total: count() })
    .from(deliveriesTable)
    .where(eq(deliveriesTable.status, "sent"));

  const [pendingDelivery] = await db
    .select({ total: count() })
    .from(deliveriesTable)
    .where(sql`${deliveriesTable.status} IN ('queued','processing')`);

  // Release status breakdown
  const releasesByStatus = await db
    .select({ status: releasesTable.status, cnt: count() })
    .from(releasesTable)
    .groupBy(releasesTable.status);

  // Contact type breakdown
  const contactsByType = await db
    .select({ type: contactsTable.type, cnt: count() })
    .from(contactsTable)
    .groupBy(contactsTable.type);

  res.json({
    tracks: trackCount.count,
    artists: artistCount.count,
    releases: releaseCount.count,
    users: userCount.count,
    revenue: parseFloat(revenueRow?.total ?? "0"),
    sentDeliveries: deliveryRow.total,
    pendingDeliveries: pendingDelivery.total,
    releasesByStatus,
    contactsByType,
  });
});

/**
 * GET /api/crm/analytics/user-activity
 * Активность пользователей: кол-во контактов, задач, релизов на пользователя.
 */
router.get("/crm/analytics/user-activity", async (_req, res): Promise<void> => {
  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, createdAt: usersTable.createdAt })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));

  // задачи по assignedToId
  const taskCounts = await db
    .select({ userId: crmTasksTable.assignedToId, cnt: count() })
    .from(crmTasksTable)
    .groupBy(crmTasksTable.assignedToId);
  const taskMap = new Map(taskCounts.map((r) => [r.userId, r.cnt]));

  // завершённые задачи
  const doneCounts = await db
    .select({ userId: crmTasksTable.assignedToId, cnt: count() })
    .from(crmTasksTable)
    .where(eq(crmTasksTable.status, "done"))
    .groupBy(crmTasksTable.assignedToId);
  const doneMap = new Map(doneCounts.map((r) => [r.userId, r.cnt]));

  const result = users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    totalTasks: taskMap.get(u.id) ?? 0,
    doneTasks: doneMap.get(u.id) ?? 0,
  }));

  res.json(result);
});

/**
 * GET /api/crm/analytics/revenue-per-user
 * Выручка по артистам: суммы из transactions, разбивка по типу.
 */
router.get("/crm/analytics/revenue-per-user", async (_req, res): Promise<void> => {
  const artists = await db
    .select({ id: artistsTable.id, name: artistsTable.name })
    .from(artistsTable)
    .orderBy(artistsTable.name);

  // royalty transactions с привязкой к artist
  const rows = await db
    .select({
      artistId: transactionsTable.artistId,
      type: transactionsTable.type,
      total: sum(transactionsTable.amount),
    })
    .from(transactionsTable)
    .groupBy(transactionsTable.artistId, transactionsTable.type);

  type Row = { artistId: number | null; type: string; total: string | null };
  const byArtist = new Map<number, { royalty: number; advance: number; payout: number }>();
  for (const r of rows as Row[]) {
    if (r.artistId == null) continue;
    const cur = byArtist.get(r.artistId) ?? { royalty: 0, advance: 0, payout: 0 };
    const val = parseFloat(r.total ?? "0");
    if (r.type === "royalty") cur.royalty += val;
    else if (r.type === "advance") cur.advance += val;
    else if (r.type === "payout") cur.payout += val;
    byArtist.set(r.artistId, cur);
  }

  const result = artists.map((a) => ({
    id: a.id,
    name: a.name,
    ...(byArtist.get(a.id) ?? { royalty: 0, advance: 0, payout: 0 }),
    net: (byArtist.get(a.id)?.royalty ?? 0) - (byArtist.get(a.id)?.payout ?? 0),
  }));

  res.json(result);
});

/**
 * GET /api/crm/analytics/growth
 * Рост: кол-во новых артистов / релизов / пользователей по месяцам (последние 12).
 */
router.get("/crm/analytics/growth", async (_req, res): Promise<void> => {
  // Генерируем 12 месяцев назад
  const since = new Date();
  since.setMonth(since.getMonth() - 11);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [artistsByMonth, releasesByMonth, usersByMonth] = await Promise.all([
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${artistsTable.createdAt}), 'YYYY-MM')`,
        cnt: count(),
      })
      .from(artistsTable)
      .where(gte(artistsTable.createdAt, since))
      .groupBy(sql`date_trunc('month', ${artistsTable.createdAt})`),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${releasesTable.createdAt}), 'YYYY-MM')`,
        cnt: count(),
      })
      .from(releasesTable)
      .where(gte(releasesTable.createdAt, since))
      .groupBy(sql`date_trunc('month', ${releasesTable.createdAt})`),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${usersTable.createdAt}), 'YYYY-MM')`,
        cnt: count(),
      })
      .from(usersTable)
      .where(gte(usersTable.createdAt, since))
      .groupBy(sql`date_trunc('month', ${usersTable.createdAt})`),
  ]);

  // Собираем все месяцы
  const months: string[] = [];
  const d = new Date(since);
  for (let i = 0; i < 12; i++) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }

  const toMap = (rows: { month: string; cnt: number }[]) => new Map(rows.map((r) => [r.month, r.cnt]));
  const aMap = toMap(artistsByMonth);
  const rMap = toMap(releasesByMonth);
  const uMap = toMap(usersByMonth);

  const result = months.map((m) => ({
    month: m,
    artists: aMap.get(m) ?? 0,
    releases: rMap.get(m) ?? 0,
    users: uMap.get(m) ?? 0,
  }));

  res.json(result);
});

/**
 * GET /api/crm/analytics/funnel
 * Воронка: release lifecycle funnel + delivery pipeline.
 */
router.get("/crm/analytics/funnel", async (_req, res): Promise<void> => {
  const [releaseRows, deliveryRows, taskRows] = await Promise.all([
    db.select({ status: releasesTable.status, cnt: count() }).from(releasesTable).groupBy(releasesTable.status),
    db.select({ status: deliveriesTable.status, cnt: count() }).from(deliveriesTable).groupBy(deliveriesTable.status),
    db.select({ status: crmTasksTable.status, cnt: count() }).from(crmTasksTable).groupBy(crmTasksTable.status),
  ]);

  const toObj = (rows: { status: string; cnt: number }[]) =>
    Object.fromEntries(rows.map((r) => [r.status, r.cnt]));

  const releases = toObj(releaseRows);
  const deliveries = toObj(deliveryRows);
  const tasks = toObj(taskRows);

  // Release funnel: draft → pending_review → approved → delivering → live
  const releaseFunnel = [
    { stage: "Черновик",          key: "draft",          value: releases["draft"] ?? 0 },
    { stage: "На проверке",       key: "pending_review", value: releases["pending_review"] ?? 0 },
    { stage: "Одобрен",           key: "approved",       value: releases["approved"] ?? 0 },
    { stage: "Доставляется",      key: "delivering",     value: releases["delivering"] ?? 0 },
    { stage: "На площадках",      key: "live",           value: releases["live"] ?? 0 },
  ];

  // Delivery pipeline
  const deliveryFunnel = [
    { stage: "В очереди",         key: "queued",     value: deliveries["queued"] ?? 0 },
    { stage: "Обрабатывается",    key: "processing", value: deliveries["processing"] ?? 0 },
    { stage: "Отправлен",         key: "sent",       value: deliveries["sent"] ?? 0 },
    { stage: "Ack получен",       key: "acked",      value: deliveries["acked"] ?? 0 },
    { stage: "Ошибка",            key: "failed",     value: deliveries["failed"] ?? 0 },
  ];

  // Task completion funnel
  const taskFunnel = [
    { stage: "К выполнению",      key: "todo",        value: tasks["todo"] ?? 0 },
    { stage: "В работе",          key: "in_progress", value: tasks["in_progress"] ?? 0 },
    { stage: "Завершено",         key: "done",        value: tasks["done"] ?? 0 },
    { stage: "Отменено",          key: "cancelled",   value: tasks["cancelled"] ?? 0 },
  ];

  res.json({ releaseFunnel, deliveryFunnel, taskFunnel });
});

export default router;
