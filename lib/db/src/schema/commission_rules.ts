import { pgTable, text, serial, integer, timestamp, numeric, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { labelsTable } from "./labels";
import { artistsTable } from "./artists";

export const commissionRulesTable = pgTable("commission_rules", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull().default("global"),
  labelId: integer("label_id").references(() => labelsTable.id, { onDelete: "cascade" }),
  artistId: integer("artist_id").references(() => artistsTable.id, { onDelete: "cascade" }),
  dspCode: text("dsp_code"),
  percentage: numeric("percentage", { precision: 6, scale: 4 }).notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  enabled: boolean("enabled").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("commission_rules_scope_idx").on(t.scope),
  index("commission_rules_label_idx").on(t.labelId),
]);

export const insertCommissionRuleSchema = createInsertSchema(commissionRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type CommissionRule = typeof commissionRulesTable.$inferSelect;
export type InsertCommissionRule = z.infer<typeof insertCommissionRuleSchema>;
