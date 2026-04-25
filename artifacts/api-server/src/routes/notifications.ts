import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, and, isNull, isNotNull, desc, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { z } from "zod/v4";

const router = Router();

// All notification routes require auth.
router.use(requireAuth);

// GET /notifications — paginated list for the current user.
router.get("/notifications", async (req, res): Promise<void> => {
  const userId = req.session.user!.id;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const unreadOnly = req.query.unread_only === "true" || req.query.unread_only === "1";
  const offset = (page - 1) * limit;

  const baseWhere = unreadOnly
    ? and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt))
    : eq(notificationsTable.userId, userId);

  const [totalResult] = await db
    .select({ count: count() })
    .from(notificationsTable)
    .where(baseWhere);

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(baseWhere)
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    data: rows,
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

// GET /notifications/unread-count — lightweight badge count.
router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  const userId = req.session.user!.id;
  const [result] = await db
    .select({ count: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt)));
  res.json({ count: result.count });
});

// POST /notifications/read-all — mark all unread as read.
router.post("/notifications/read-all", async (req, res): Promise<void> => {
  const userId = req.session.user!.id;
  const result = await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt)))
    .returning({ id: notificationsTable.id });
  res.json({ updated: result.length });
});

// POST /notifications/:id/read — mark one as read.
router.post("/notifications/:id/read", async (req, res): Promise<void> => {
  const userId = req.session.user!.id;
  const parsed = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }
  const [row] = await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.id, parsed.data), eq(notificationsTable.userId, userId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(row);
});

export default router;
