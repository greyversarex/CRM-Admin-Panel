/**
 * Automation — Payment Automation Rules CRUD.
 *
 * GET    /api/automation/payment-rules
 * POST   /api/automation/payment-rules
 * PATCH  /api/automation/payment-rules/:id
 * DELETE /api/automation/payment-rules/:id
 *
 * fraud-rules ruleType enum уже расширяется через свободный text — на стороне UI
 * добавим опцию 'acrcloud_match' (триггерится из distribution-extras при ACR-проверке).
 */
import { Router } from "express";
import { z } from "zod";
import { db, paymentAutomationRulesTable, insertPaymentAutomationRuleSchema } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { auditMutation } from "../lib/audit";

const router = Router();
const IdParam = z.object({ id: z.coerce.number().int().positive() });

router.get("/automation/payment-rules", async (_req, res) => {
  const rows = await db.select().from(paymentAutomationRulesTable).orderBy(desc(paymentAutomationRulesTable.id));
  res.json({ rules: rows });
});

router.post("/automation/payment-rules", async (req, res) => {
  const parsed = insertPaymentAutomationRuleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const [row] = await db.insert(paymentAutomationRulesTable).values(parsed.data).returning();
  void auditMutation(req, { action: "create", entityType: "payment_automation_rule", entityId: row.id, before: null, after: row });
  res.status(201).json(row);
});

const PatchBody = insertPaymentAutomationRuleSchema.partial();

router.patch("/automation/payment-rules/:id", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const [before] = await db.select().from(paymentAutomationRulesTable).where(eq(paymentAutomationRulesTable.id, p.data.id));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(paymentAutomationRulesTable).set(parsed.data).where(eq(paymentAutomationRulesTable.id, p.data.id)).returning();
  void auditMutation(req, { action: "update", entityType: "payment_automation_rule", entityId: row.id, before, after: row });
  res.json(row);
});

router.delete("/automation/payment-rules/:id", async (req, res) => {
  const p = IdParam.safeParse(req.params); if (!p.success) { res.status(400).json({ error: "Bad id" }); return; }
  const [before] = await db.select().from(paymentAutomationRulesTable).where(eq(paymentAutomationRulesTable.id, p.data.id));
  if (!before) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(paymentAutomationRulesTable).where(eq(paymentAutomationRulesTable.id, p.data.id));
  void auditMutation(req, { action: "delete", entityType: "payment_automation_rule", entityId: p.data.id, before, after: null });
  res.json({ ok: true });
});

export default router;
