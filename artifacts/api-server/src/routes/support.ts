import { Router } from "express";
import { z } from "zod/v4";
import { db, supportTicketsTable, supportTicketMessagesTable, usersTable } from "@workspace/db";
import { and, desc, eq, or, sql, asc } from "drizzle-orm";
import { requireAuth, requireRole, getSessionUser } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { createNotification } from "../services/notifications";

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

const TICKET_STATUSES = ["open", "in_progress", "waiting", "resolved", "closed"] as const;
const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const TICKET_CATEGORIES = ["general", "finance", "distribution", "catalog", "marketing", "account", "bug", "other"] as const;

function isStaff(role: string | undefined): boolean {
  return role === "admin" || role === "manager";
}

/**
 * Генерируем читаемый ticket_ref TCK-YYYY-NNNN, где NNNN — счётчик за год.
 * Сделано через MAX по уже созданным в этом году записям + 1.
 * При гонке (двое одновременно создают тикет) уникальный индекс на ticket_ref
 * вернёт ошибку — обработаем повторной попыткой.
 */
async function nextTicketRef(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `TCK-${year}-`;
  const [{ maxRef }] = await db
    .select({
      maxRef: sql<string | null>`MAX(${supportTicketsTable.ticketRef})`.as("max_ref"),
    })
    .from(supportTicketsTable)
    .where(sql`${supportTicketsTable.ticketRef} LIKE ${prefix + "%"}`);

  let nextNum = 1;
  if (maxRef) {
    const tail = maxRef.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) nextNum = n + 1;
  }
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

// Маппер для UI: тикет + автор + назначенный.
function shapeTicket(t: typeof supportTicketsTable.$inferSelect, requester: AuthorRef | null, assignee: AuthorRef | null) {
  return {
    id: t.id,
    ticketRef: t.ticketRef,
    subject: t.subject,
    category: t.category,
    status: t.status,
    priority: t.priority,
    requester,
    assignee,
    lastMessageAt: t.lastMessageAt.toISOString(),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

interface AuthorRef {
  id: number;
  name: string;
  email: string;
  role: string;
}

function shapeMessage(
  m: typeof supportTicketMessagesTable.$inferSelect,
  author: AuthorRef | null,
) {
  return {
    id: m.id,
    ticketId: m.ticketId,
    body: m.body,
    isInternal: m.isInternal,
    author,
    createdAt: m.createdAt.toISOString(),
  };
}

// ─── GET /support/tickets ───────────────────────────────────────────────────
//
// customer (label/artist): видит ТОЛЬКО свои тикеты.
// staff (admin/manager): видит все, может фильтровать по
//   status / priority / category / assigneeUserId.
//
// Параметр `assignee` принимает либо ID, либо литерал "unassigned" / "me".
router.get("/support/tickets", requireAuth, async (req, res): Promise<void> => {
  const user = getSessionUser(req)!;
  const staff = isStaff(user.role);

  const conditions = [];

  if (!staff) {
    conditions.push(eq(supportTicketsTable.requesterUserId, user.id));
  }

  const status = String(req.query.status ?? "").trim();
  if (status && TICKET_STATUSES.includes(status as any)) {
    conditions.push(eq(supportTicketsTable.status, status));
  }

  const priority = String(req.query.priority ?? "").trim();
  if (priority && TICKET_PRIORITIES.includes(priority as any)) {
    conditions.push(eq(supportTicketsTable.priority, priority));
  }

  const category = String(req.query.category ?? "").trim();
  if (category && TICKET_CATEGORIES.includes(category as any)) {
    conditions.push(eq(supportTicketsTable.category, category));
  }

  if (staff) {
    const assignee = String(req.query.assignee ?? "").trim();
    if (assignee === "unassigned") {
      conditions.push(sql`${supportTicketsTable.assigneeUserId} IS NULL`);
    } else if (assignee === "me") {
      conditions.push(eq(supportTicketsTable.assigneeUserId, user.id));
    } else if (assignee) {
      const id = Number(assignee);
      if (Number.isFinite(id)) conditions.push(eq(supportTicketsTable.assigneeUserId, id));
    }
  }

  const requesterAlias = sql.raw("requester");
  const assigneeAlias = sql.raw("assignee");

  // Один запрос с двумя LEFT JOIN на usersTable — для requester и assignee.
  // Drizzle не поддерживает alias из коробки на одной таблице двойным JOIN
  // через `.leftJoin(usersTable.as(...))` без extra setup, поэтому делаем raw
  // join через подзапросы.
  const rows = await db
    .select({
      ticket: supportTicketsTable,
      requesterId: usersTable.id,
      requesterName: usersTable.name,
      requesterEmail: usersTable.email,
      requesterRole: usersTable.role,
    })
    .from(supportTicketsTable)
    .leftJoin(usersTable, eq(usersTable.id, supportTicketsTable.requesterUserId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(supportTicketsTable.lastMessageAt))
    .limit(200);

  // Собираем assignee отдельным запросом (proще, чем double-join alias).
  const assigneeIds = Array.from(
    new Set(rows.map((r) => r.ticket.assigneeUserId).filter((v): v is number => v !== null))
  );
  const assigneeMap = new Map<number, AuthorRef>();
  if (assigneeIds.length > 0) {
    const assignees = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
      .from(usersTable)
      .where(or(...assigneeIds.map((id) => eq(usersTable.id, id))));
    for (const a of assignees) assigneeMap.set(a.id, a);
  }

  const tickets = rows.map((r) => {
    const requester: AuthorRef | null = r.requesterId
      ? { id: r.requesterId, name: r.requesterName!, email: r.requesterEmail!, role: r.requesterRole! }
      : null;
    const assignee = r.ticket.assigneeUserId ? assigneeMap.get(r.ticket.assigneeUserId) ?? null : null;
    return shapeTicket(r.ticket, requester, assignee);
  });

  // Подсчёт messages в тикете — нужен UI для счётчика «8 сообщений».
  const ticketIds = tickets.map((t) => t.id);
  const counts = new Map<number, number>();
  if (ticketIds.length > 0) {
    const msgCounts = await db
      .select({
        ticketId: supportTicketMessagesTable.ticketId,
        cnt: sql<number>`COUNT(*)::int`.as("cnt"),
      })
      .from(supportTicketMessagesTable)
      .where(or(...ticketIds.map((id) => eq(supportTicketMessagesTable.ticketId, id))))
      .groupBy(supportTicketMessagesTable.ticketId);
    for (const c of msgCounts) counts.set(c.ticketId, Number(c.cnt));
  }

  res.json({
    data: tickets.map((t) => ({ ...t, messageCount: counts.get(t.id) ?? 0 })),
  });
});

// ─── GET /support/tickets/:id ───────────────────────────────────────────────
router.get("/support/tickets/:id", requireAuth, async (req, res): Promise<void> => {
  const user = getSessionUser(req)!;
  const staff = isStaff(user.role);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) {
    res.status(404).json({ error: "Тикет не найден" });
    return;
  }
  if (!staff && ticket.requesterUserId !== user.id) {
    res.status(403).json({ error: "Нет доступа к этому тикету" });
    return;
  }

  // requester + assignee.
  const refIds = Array.from(
    new Set(
      [ticket.requesterUserId, ticket.assigneeUserId].filter((v): v is number => v !== null)
    )
  );
  const refMap = new Map<number, AuthorRef>();
  if (refIds.length > 0) {
    const refs = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
      .from(usersTable)
      .where(or(...refIds.map((id) => eq(usersTable.id, id))));
    for (const r of refs) refMap.set(r.id, r);
  }

  // Сообщения. Для customer — фильтруем internal заметки.
  const messages = await db
    .select()
    .from(supportTicketMessagesTable)
    .where(eq(supportTicketMessagesTable.ticketId, id))
    .orderBy(asc(supportTicketMessagesTable.createdAt));

  const visibleMessages = staff ? messages : messages.filter((m) => !m.isInternal);

  const authorIds = Array.from(
    new Set(visibleMessages.map((m) => m.authorUserId).filter((v): v is number => v !== null))
  );
  const authorMap = new Map<number, AuthorRef>();
  if (authorIds.length > 0) {
    const authors = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
      .from(usersTable)
      .where(or(...authorIds.map((id) => eq(usersTable.id, id))));
    for (const a of authors) authorMap.set(a.id, a);
  }

  res.json({
    ticket: shapeTicket(
      ticket,
      ticket.requesterUserId ? refMap.get(ticket.requesterUserId) ?? null : null,
      ticket.assigneeUserId ? refMap.get(ticket.assigneeUserId) ?? null : null,
    ),
    messages: visibleMessages.map((m) =>
      shapeMessage(m, m.authorUserId ? authorMap.get(m.authorUserId) ?? null : null)
    ),
  });
});

// ─── POST /support/tickets ──────────────────────────────────────────────────
const createTicketSchema = z.object({
  subject: z.string().min(3).max(200),
  category: z.enum(TICKET_CATEGORIES).default("general"),
  priority: z.enum(TICKET_PRIORITIES).default("medium"),
  body: z.string().min(1).max(10000),
});

router.post("/support/tickets", requireAuth, async (req, res): Promise<void> => {
  const user = getSessionUser(req)!;
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Заполни все поля корректно", details: parsed.error.flatten() });
    return;
  }
  const { subject, category, priority, body } = parsed.data;

  // Создаём тикет. Если ticket_ref столкнётся (гонка) — повторим до 3 раз.
  let ticketRow;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ticketRef = await nextTicketRef();
      const now = new Date();
      const [row] = await db
        .insert(supportTicketsTable)
        .values({
          ticketRef,
          subject,
          category,
          priority,
          status: "open",
          requesterUserId: user.id,
          lastMessageAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      ticketRow = row;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!ticketRow) {
    req.log?.error({ err: lastErr }, "support.tickets create failed");
    res.status(500).json({ error: "Не удалось создать тикет" });
    return;
  }

  // Первое сообщение.
  await db.insert(supportTicketMessagesTable).values({
    ticketId: ticketRow.id,
    authorUserId: user.id,
    body,
    isInternal: false,
  });

  void auditMutation(req, {
    action: "create",
    entityType: "support_ticket",
    entityId: ticketRow.id,
    after: { ticketRef: ticketRow.ticketRef, subject, category, priority },
  });

  res.status(201).json({
    ticket: shapeTicket(
      ticketRow,
      { id: user.id, name: user.name, email: user.email, role: user.role },
      null,
    ),
  });
});

// ─── POST /support/tickets/:id/messages ─────────────────────────────────────
const addMessageSchema = z.object({
  body: z.string().min(1).max(10000),
  isInternal: z.boolean().optional().default(false),
});

router.post("/support/tickets/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const user = getSessionUser(req)!;
  const staff = isStaff(user.role);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = addMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Пустое сообщение" });
    return;
  }
  // isInternal доступен только staff. Customer молча получает false.
  const isInternal = staff ? parsed.data.isInternal === true : false;

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) {
    res.status(404).json({ error: "Тикет не найден" });
    return;
  }
  if (!staff && ticket.requesterUserId !== user.id) {
    res.status(403).json({ error: "Нет доступа к этому тикету" });
    return;
  }
  if (ticket.status === "closed") {
    res.status(400).json({ error: "Тикет закрыт — нельзя добавлять сообщения" });
    return;
  }

  const now = new Date();
  const [msg] = await db
    .insert(supportTicketMessagesTable)
    .values({
      ticketId: id,
      authorUserId: user.id,
      body: parsed.data.body,
      isInternal,
    })
    .returning();

  // Не апдейтим lastMessageAt для internal заметок (они не двигают SLA).
  if (!isInternal) {
    // Если customer написал в waiting-тикет, возвращаем его в open, чтобы
    // менеджер увидел его в очереди.
    const newStatus = !staff && ticket.status === "waiting" ? "open" : ticket.status;
    await db
      .update(supportTicketsTable)
      .set({ lastMessageAt: now, updatedAt: now, status: newStatus })
      .where(eq(supportTicketsTable.id, id));

    // Уведомление противоположной стороне:
    // - staff ответил → уведомляем requester
    // - customer ответил → уведомляем assignee (если назначен)
    if (staff && ticket.requesterUserId && ticket.requesterUserId !== user.id) {
      void createNotification({
        userId: ticket.requesterUserId,
        type: "support_message",
        title: `Новый ответ в тикете «${ticket.subject}»`,
        body: parsed.data.body.length > 200 ? parsed.data.body.slice(0, 200) + "…" : parsed.data.body,
        entityType: "general",
        link: `/support/inbox`,
      });
    } else if (!staff && ticket.assigneeUserId && ticket.assigneeUserId !== user.id) {
      void createNotification({
        userId: ticket.assigneeUserId,
        type: "support_message",
        title: `Новое сообщение от клиента в тикете «${ticket.subject}»`,
        body: parsed.data.body.length > 200 ? parsed.data.body.slice(0, 200) + "…" : parsed.data.body,
        entityType: "general",
        link: `/support/inbox`,
      });
    }
  }

  res.status(201).json({
    message: shapeMessage(msg, { id: user.id, name: user.name, email: user.email, role: user.role }),
  });
});

// ─── PATCH /support/tickets/:id (staff only) ────────────────────────────────
const patchTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  // null → снять назначение.
  assigneeUserId: z.number().int().positive().nullable().optional(),
});

router.patch("/support/tickets/:id", requireAuth, requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = patchTicketSchema.safeParse(req.body);
  if (!parsed.success || (parsed.data.status === undefined && parsed.data.priority === undefined && parsed.data.assigneeUserId === undefined)) {
    res.status(400).json({ error: "Нет полей для обновления" });
    return;
  }

  const [before] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!before) {
    res.status(404).json({ error: "Тикет не найден" });
    return;
  }

  // Если назначаем — проверим, что target существует и это staff.
  if (parsed.data.assigneeUserId !== undefined && parsed.data.assigneeUserId !== null) {
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.assigneeUserId));
    if (!target || (target.role !== "admin" && target.role !== "manager")) {
      res.status(400).json({ error: "Назначить можно только на admin/manager" });
      return;
    }
  }

  const updates: Partial<typeof supportTicketsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.assigneeUserId !== undefined) updates.assigneeUserId = parsed.data.assigneeUserId;

  const [after] = await db
    .update(supportTicketsTable)
    .set(updates)
    .where(eq(supportTicketsTable.id, id))
    .returning();

  void auditMutation(req, {
    action: "update",
    entityType: "support_ticket",
    entityId: id,
    before: { status: before.status, priority: before.priority, assigneeUserId: before.assigneeUserId },
    after: { status: after.status, priority: after.priority, assigneeUserId: after.assigneeUserId },
  });

  // Уведомление requester при смене статуса (resolved/closed/waiting)
  if (parsed.data.status !== undefined && parsed.data.status !== before.status && before.requesterUserId) {
    const statusLabel: Record<string, string> = {
      open: "переоткрыт",
      waiting: "ожидает вашего ответа",
      resolved: "помечен как решённый",
      closed: "закрыт",
    };
    void createNotification({
      userId: before.requesterUserId,
      type: `support_status_${parsed.data.status}`,
      title: `Тикет «${before.subject}» ${statusLabel[parsed.data.status] ?? parsed.data.status}`,
      body: "",
      entityType: "general",
      link: `/support/inbox`,
    });
  }

  res.json({ ticket: shapeTicket(after, null, null) });
});

// ─── GET /support/agents (staff only) ───────────────────────────────────────
// Список admin/manager для select-а «исполнитель» в инбоксе.
router.get("/support/agents", requireAuth, requireRole("admin", "manager"), async (_req, res): Promise<void> => {
  const agents = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "manager")))
    .orderBy(asc(usersTable.name));
  res.json({ data: agents });
});

export default router;
