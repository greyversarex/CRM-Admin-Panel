import { pgTable, text, serial, integer, timestamp, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const labelsTable = pgTable("labels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  country: text("country"),
  website: text("website"),
  parentLabelId: integer("parent_label_id").references((): AnyPgColumn => labelsTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("labels_parent_idx").on(t.parentLabelId),
  index("labels_status_idx").on(t.status),
]);

export const insertLabelSchema = createInsertSchema(labelsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLabel = z.infer<typeof insertLabelSchema>;
export type Label = typeof labelsTable.$inferSelect;
