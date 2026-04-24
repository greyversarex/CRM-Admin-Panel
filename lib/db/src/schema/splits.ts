import { pgTable, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releasesTable } from "./releases";
import { tracksTable } from "./tracks";

export const splitsTable = pgTable("splits", {
  id: serial("id").primaryKey(),
  // cascade: split — атрибут релиза/трека, без них смысла нет
  releaseId: integer("release_id").references(() => releasesTable.id, { onDelete: "cascade" }),
  trackId: integer("track_id").references(() => tracksTable.id, { onDelete: "cascade" }),
  participants: jsonb("participants").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("splits_release_idx").on(t.releaseId),
  index("splits_track_idx").on(t.trackId),
]);

export const insertSplitSchema = createInsertSchema(splitsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSplit = z.infer<typeof insertSplitSchema>;
export type Split = typeof splitsTable.$inferSelect;
