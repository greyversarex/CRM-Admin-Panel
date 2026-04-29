import { pgTable, text, serial, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentAutomationRulesTable = pgTable("payment_automation_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // 'auto_approve_below' | 'scheduled_payout' | 'min_payout_threshold' | 'auto_reject_failed_kyc'
  thresholdCents: integer("threshold_cents").notNull().default(0),
  scheduleCron: text("schedule_cron"),
  enabled: boolean("enabled").notNull().default(true),
  notes: text("notes"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("payment_automation_rules_enabled_idx").on(t.enabled),
  index("payment_automation_rules_kind_idx").on(t.kind),
]);

export const insertPaymentAutomationRuleSchema = createInsertSchema(paymentAutomationRulesTable).omit({ id: true, createdAt: true, updatedAt: true, lastRunAt: true });
export type PaymentAutomationRule = typeof paymentAutomationRulesTable.$inferSelect;
export type InsertPaymentAutomationRule = z.infer<typeof insertPaymentAutomationRuleSchema>;
