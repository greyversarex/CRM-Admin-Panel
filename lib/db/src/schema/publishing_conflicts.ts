import { pgTable, text, serial, integer, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { publishingWorksTable } from "./publishing_works";
import { usersTable } from "./users";

export const publishingConflictsTable = pgTable("publishing_conflicts", {
  id: serial("id").primaryKey(),
  workId: integer("work_id").references(() => publishingWorksTable.id, { onDelete: "cascade" }),
  conflictType: text("conflict_type").notNull(), // 'split_overlap' | 'duplicate_iswc' | 'unclaimed_share' | 'pro_mismatch'
  severity: text("severity").notNull().default("medium"),
  description: text("description").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: integer("resolved_by").references(() => usersTable.id, { onDelete: "set null" }),
  resolutionNote: text("resolution_note"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("publishing_conflicts_work_idx").on(t.workId),
  index("publishing_conflicts_resolved_idx").on(t.resolved),
]);

export const insertPublishingConflictSchema = createInsertSchema(publishingConflictsTable).omit({ id: true, detectedAt: true });
export type PublishingConflict = typeof publishingConflictsTable.$inferSelect;
export type InsertPublishingConflict = z.infer<typeof insertPublishingConflictSchema>;
