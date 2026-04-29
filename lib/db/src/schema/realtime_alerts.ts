import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const realtimeAlertsTable = pgTable("realtime_alerts", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // 'spike' | 'drop' | 'fraud' | 'takedown' | 'system_error' | 'payment_failed'
  severity: text("severity").notNull().default("medium"), // low|medium|high|critical
  message: text("message").notNull(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: integer("resolved_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("realtime_alerts_kind_idx").on(t.kind),
  index("realtime_alerts_severity_idx").on(t.severity),
  index("realtime_alerts_created_idx").on(t.createdAt),
]);

export const insertRealtimeAlertSchema = createInsertSchema(realtimeAlertsTable).omit({ id: true, createdAt: true });
export type RealtimeAlert = typeof realtimeAlertsTable.$inferSelect;
export type InsertRealtimeAlert = z.infer<typeof insertRealtimeAlertSchema>;
