import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, and, isNull, isNotNull, desc, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { sseRegistry } from "../services/sse-registry";
import { logger } from "../lib/logger";
import { z } from "zod/v4";

const router = Router();

// All notification routes require auth.
router.use(requireAuth);

/**
 * GET /notifications/stream — Server-Sent Events endpoint.
 *
 * Keeps the HTTP connection open and pushes "notification" events whenever
 * a new notification is created for the current user. The browser's native
 * EventSource API reconnects automatically on drops.
 *
 * Headers:
 *   X-Accel-Buffering: no  — prevents nginx from buffering the stream in prod.
 *   Cache-Control: no-cache — prevents intermediary caches from storing events.
 *
 * Heartbeat comment frames are sent every 25 s to keep the connection alive
 * through proxies that close idle connections (Replit preview proxy, nginx).
 */
router.get("/notifications/stream", (req, res): void => {
  const userId = req.session.user!.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  // Allow CORS for EventSource (credentials already sent via cookie).
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.flushHeaders();

  // Initial "connected" event so the client knows the stream is live.
  res.write(`event: connected\ndata: {"userId":${userId}}\n\n`);

  sseRegistry.subscribe(userId, res);
  logger.debug({ userId, total: sseRegistry.size }, "[sse] client connected");

  // Heartbeat every 25 s — SSE comment lines (": ...") are ignored by clients
  // but keep the TCP connection and proxy timeouts from firing.
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseRegistry.unsubscribe(userId, res);
    logger.debug({ userId, total: sseRegistry.size }, "[sse] client disconnected");
  });
});

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
