import { Router } from "express";
import { db, contactsTable, crmTasksTable, usersTable } from "@workspace/db";
import { count, eq, desc } from "drizzle-orm";
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

export default router;
