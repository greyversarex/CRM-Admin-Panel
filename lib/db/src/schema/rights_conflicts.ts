import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releasesTable } from "./releases";
import { tracksTable } from "./tracks";
import { usersTable } from "./users";

/**
 * Таблица конфликтов/споров по правам.
 *
 * conflict_type:
 *   dsp_claim          — DSP (Spotify/Apple/...) поднял claim на наш контент
 *   acr_flag           — ACRCloud обнаружил аудио-совпадение
 *   manual_dispute     — ручной спор от третьей стороны
 *   territorial_overlap — конфликт прав по территориям
 *
 * status: open → investigating → resolved | dismissed | escalated
 *
 * priority: low | medium | high | critical
 */
export const rightsConflictsTable = pgTable("rights_conflicts", {
  id: serial("id").primaryKey(),

  assetType: text("asset_type").notNull(), // "track" | "release"
  trackId: integer("track_id").references(() => tracksTable.id, { onDelete: "cascade" }),
  releaseId: integer("release_id").references(() => releasesTable.id, { onDelete: "cascade" }),

  conflictType: text("conflict_type").notNull(), // "dsp_claim" | "acr_flag" | "manual_dispute" | "territorial_overlap"
  claimantName: text("claimant_name").notNull(),
  claimantInfo: text("claimant_info"),  // доп. сведения: DSP, claim ID, ссылка
  status: text("status").notNull().default("open"), // "open" | "investigating" | "resolved" | "dismissed" | "escalated"
  priority: text("priority").notNull().default("medium"), // "low" | "medium" | "high" | "critical"
  description: text("description").notNull(),
  resolutionNote: text("resolution_note"),

  openedBy: integer("opened_by").references(() => usersTable.id, { onDelete: "set null" }),
  resolvedBy: integer("resolved_by").references(() => usersTable.id, { onDelete: "set null" }),

  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("rc_track_idx").on(t.trackId),
  index("rc_release_idx").on(t.releaseId),
  index("rc_status_idx").on(t.status),
  index("rc_priority_idx").on(t.priority),
  index("rc_conflict_type_idx").on(t.conflictType),
  index("rc_opened_by_idx").on(t.openedBy),
]);

export const insertRightsConflictSchema = createInsertSchema(rightsConflictsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRightsConflict = z.infer<typeof insertRightsConflictSchema>;
export type RightsConflict = typeof rightsConflictsTable.$inferSelect;
