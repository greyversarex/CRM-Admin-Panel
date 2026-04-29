/**
 * Finance — Commission Settings + 2-step Payout Approval
 *
 * GET    /api/finance/commissions
 * POST   /api/finance/commissions
 * PATCH  /api/finance/commissions/:id
 * DELETE /api/finance/commissions/:id
 * POST   /api/finance/payouts/:id/approve         — L1 (Maker→approved_l1) или L2 (approved_l1→approved_l2)
 * POST   /api/finance/payouts/:id/reject
 *
 * Доступ: admin/manager (общий guard в routes/index.ts).
 * 2-step approval: admin не может одобрить второй шаг своей же L1-визы (separation of duties).
 */
import { Router } from "express";
import { z } from "zod";
import { db, commissionRulesTable, payoutsTable, platformSettingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { auditMutation } from "../lib/audit";
import { requireRole } from "../lib/auth";

const router = Router();
router.use(requireRole("admin", "manager"));

const IdParam = z.object({ id: z.coerce.number().int().positive() });

// ── Commissions ────────────────────────────────────────────────────────────
const CommissionBody = z.object({
  scope: z.enum(["global", "label", "artist", "dsp"]).default("global"),
  labelId: z.number().int().nullish(),
  artistId: z.number().int().nullish(),
  dspCode: z.string().max(64).nullish(),
  percentage: z.number().min(0).max(100),
  effectiveFrom: z.string().datetime().optional(),
  enabled: z.boolean().default(true),
  notes: z.string().max(2000).nullish(),
});

router.get("/finance/commissions", async (_req, res) => {
  const rows = await db.select().from(commissionRulesTable).orderBy(desc(commissionRulesTable.createdAt));
  res.json({ rules: rows });
});

router.post("/finance/commissions", async (req, res) => {
  const parsed = CommissionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const data = { ...parsed.data, percentage: String(parsed.data.percentage), effectiveFrom: parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : new Date() };
  const [row] = await db.insert(commissionRulesTable).values(data).returning();
  void auditMutation(req, { action: "create", entityType: "commission_rule", entityId: row.id, before: null, after: row });
  res.status(201).json(row);
});

router.patch("/finance/commissions/:id", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const parsed = CommissionBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation" }); return; }
  const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.percentage != null) patch.percentage = String(parsed.data.percentage);
  if (parsed.data.effectiveFrom) patch.effectiveFrom = new Date(parsed.data.effectiveFrom);
  const [row] = await db.update(commissionRulesTable).set(patch).where(eq(commissionRulesTable.id, p.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "update", entityType: "commission_rule", entityId: row.id, before: null, after: row });
  res.json(row);
});

router.delete("/finance/commissions/:id", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const [del] = await db.delete(commissionRulesTable).where(eq(commissionRulesTable.id, p.data.id)).returning();
  if (!del) { res.status(404).json({ error: "Not found" }); return; }
  void auditMutation(req, { action: "delete", entityType: "commission_rule", entityId: p.data.id, before: del, after: null });
  res.json({ ok: true });
});

// ── 2-step payout approval ─────────────────────────────────────────────────
async function getTwoStepThresholdCents(): Promise<number> {
  try {
    const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "finance"));
    const v = (row?.value ?? {}) as Record<string, unknown>;
    const n = Number(v.twoStepThresholdCents);
    return Number.isFinite(n) && n > 0 ? n : 100000; // default $1000
  } catch { return 100000; }
}

router.post("/finance/payouts/:id/approve", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const userId = req.session?.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [payout] = await db.select().from(payoutsTable).where(eq(payoutsTable.id, p.data.id));
  if (!payout) { res.status(404).json({ error: "Not found" }); return; }
  if (payout.approvalStage === "paid" || payout.approvalStage === "rejected") {
    res.status(409).json({ error: "Выплата уже завершена" }); return;
  }

  const amountCents = Math.round(Number(payout.amount) * 100);
  const threshold = await getTwoStepThresholdCents();
  const requiresTwoStep = amountCents >= threshold;
  const now = new Date();

  let nextStage = payout.approvalStage;
  const patch: Record<string, unknown> = { updatedAt: now };

  if (payout.approvalStage === "pending") {
    nextStage = requiresTwoStep ? "approved_l1" : "approved_l2";
    patch.approvalStage = nextStage;
    patch.approvedL1By = userId;
    patch.approvedL1At = now;
    patch.twoStepRequired = requiresTwoStep;
    if (!requiresTwoStep) {
      patch.approvedL2By = userId;
      patch.approvedL2At = now;
      patch.status = "approved";
    }
  } else if (payout.approvalStage === "approved_l1") {
    if (payout.approvedL1By === userId) {
      res.status(403).json({ error: "Нельзя подтверждать второй шаг той же учётной записью, что выдала L1" });
      return;
    }
    nextStage = "approved_l2";
    patch.approvalStage = nextStage;
    patch.approvedL2By = userId;
    patch.approvedL2At = now;
    patch.status = "approved";
  } else {
    res.status(409).json({ error: `Недопустимый переход из ${payout.approvalStage}` });
    return;
  }

  const [row] = await db.update(payoutsTable).set(patch).where(eq(payoutsTable.id, p.data.id)).returning();
  void auditMutation(req, { action: "approve_payout", entityType: "payout", entityId: row.id, before: payout, after: row });
  res.json(row);
});

router.post("/finance/payouts/:id/reject", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const reason = z.object({ reason: z.string().min(1).max(500) }).safeParse(req.body);
  if (!reason.success) { res.status(400).json({ error: "validation" }); return; }
  const [payout] = await db.select().from(payoutsTable).where(eq(payoutsTable.id, p.data.id));
  if (!payout) { res.status(404).json({ error: "Not found" }); return; }
  if (payout.approvalStage === "paid") { res.status(409).json({ error: "Уже выплачено" }); return; }
  const [row] = await db.update(payoutsTable).set({
    approvalStage: "rejected", status: "rejected", rejectionReason: reason.data.reason, updatedAt: new Date(),
  }).where(eq(payoutsTable.id, p.data.id)).returning();
  void auditMutation(req, { action: "reject_payout", entityType: "payout", entityId: row.id, before: payout, after: row });
  res.json(row);
});

export default router;
