/**
 * Rights — Manual Override (freeze/unfreeze) + Rights History (audit-based)
 *
 * POST  /api/rights/holders/:id/freeze        { reason }
 * POST  /api/rights/holders/:id/unfreeze
 * GET   /api/rights/history?entityType=&limit=
 *
 * Доступ: admin/manager (общий guard уже на /rights в routes/index.ts? Проверить.)
 */
import { Router } from "express";
import { z } from "zod";
import { db, rightsHoldersTable, auditLogTable } from "@workspace/db";
import { eq, desc, inArray, and } from "drizzle-orm";
import { auditMutation } from "../lib/audit";
import { requireRole } from "../lib/auth";

const router = Router();
const adminOnly = requireRole("admin", "manager");

const IdParam = z.object({ id: z.coerce.number().int().positive() });

router.post("/rights/holders/:id/freeze", adminOnly, async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const body = z.object({ reason: z.string().min(1).max(500) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "validation" }); return; }
  const userId = req.session?.user?.id ?? null;
  const [before] = await db.select().from(rightsHoldersTable).where(eq(rightsHoldersTable.id, p.data.id));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(rightsHoldersTable).set({
    frozen: true, frozenReason: body.data.reason, frozenBy: userId, frozenAt: new Date(),
  }).where(eq(rightsHoldersTable.id, p.data.id)).returning();
  void auditMutation(req, { action: "freeze", entityType: "right_holder", entityId: row.id, before, after: row });
  res.json(row);
});

router.post("/rights/holders/:id/unfreeze", adminOnly, async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const [before] = await db.select().from(rightsHoldersTable).where(eq(rightsHoldersTable.id, p.data.id));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(rightsHoldersTable).set({
    frozen: false, frozenReason: null, frozenBy: null, frozenAt: null,
  }).where(eq(rightsHoldersTable.id, p.data.id)).returning();
  void auditMutation(req, { action: "unfreeze", entityType: "right_holder", entityId: row.id, before, after: row });
  res.json(row);
});

router.get("/rights/history", adminOnly, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const types = ["right_holder", "dsp_deal", "content_id_asset", "ownership_claim", "rights_conflict"];
  const where = req.query.entityType
    ? eq(auditLogTable.entityType, String(req.query.entityType))
    : inArray(auditLogTable.entityType, types);
  const userIdFilter = req.query.userId ? Number(req.query.userId) : null;
  const cond = userIdFilter ? and(where, eq(auditLogTable.userId, userIdFilter)) : where;
  const rows = await db.select().from(auditLogTable).where(cond).orderBy(desc(auditLogTable.createdAt)).limit(limit);
  res.json({ history: rows });
});

export default router;
