import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const splitsTable = pgTable("splits", {
  id: serial("id").primaryKey(),
  releaseId: integer("release_id"),
  trackId: integer("track_id"),
  participants: jsonb("participants").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSplitSchema = createInsertSchema(splitsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSplit = z.infer<typeof insertSplitSchema>;
export type Split = typeof splitsTable.$inferSelect;
