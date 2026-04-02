import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const crmTasksTable = pgTable("crm_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  assignedToId: integer("assigned_to_id"),
  dueDate: text("due_date"),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: integer("related_entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCrmTaskSchema = createInsertSchema(crmTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrmTask = z.infer<typeof insertCrmTaskSchema>;
export type CrmTask = typeof crmTasksTable.$inferSelect;
