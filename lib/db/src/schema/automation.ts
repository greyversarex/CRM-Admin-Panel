import { pgTable, text, serial, integer, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { releasesTable } from "./releases";
import { tracksTable } from "./tracks";

export const fraudRulesTable = pgTable("fraud_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ruleType: text("rule_type").notNull(),
  threshold: integer("threshold").notNull().default(0),
  windowMinutes: integer("window_minutes").notNull().default(60),
  severity: text("severity").notNull().default("medium"),
  enabled: boolean("enabled").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("fraud_rules_enabled_idx").on(t.enabled),
]);

export const fraudAlertsTable = pgTable("fraud_alerts", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").references(() => fraudRulesTable.id, { onDelete: "set null" }),
  ruleName: text("rule_name").notNull(),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  releaseId: integer("release_id").references(() => releasesTable.id, { onDelete: "set null" }),
  trackId: integer("track_id").references(() => tracksTable.id, { onDelete: "set null" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
  resolvedBy: integer("resolved_by").references(() => usersTable.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("fraud_alerts_status_idx").on(t.status),
  index("fraud_alerts_severity_idx").on(t.severity),
]);

export const moderationRulesTable = pgTable("moderation_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  field: text("field").notNull(),
  ruleType: text("rule_type").notNull(),
  pattern: text("pattern"),
  minLength: integer("min_length"),
  maxLength: integer("max_length"),
  blockOnFail: boolean("block_on_fail").notNull().default(false),
  severity: text("severity").notNull().default("warning"),
  enabled: boolean("enabled").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("moderation_rules_enabled_idx").on(t.enabled),
  index("moderation_rules_field_idx").on(t.field),
]);

export const insertFraudRuleSchema = createInsertSchema(fraudRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFraudAlertSchema = createInsertSchema(fraudAlertsTable).omit({ id: true, createdAt: true });
export const insertModerationRuleSchema = createInsertSchema(moderationRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type FraudRule = typeof fraudRulesTable.$inferSelect;
export type FraudAlert = typeof fraudAlertsTable.$inferSelect;
export type ModerationRule = typeof moderationRulesTable.$inferSelect;
export type InsertFraudRule = z.infer<typeof insertFraudRuleSchema>;
export type InsertFraudAlert = z.infer<typeof insertFraudAlertSchema>;
export type InsertModerationRule = z.infer<typeof insertModerationRuleSchema>;
