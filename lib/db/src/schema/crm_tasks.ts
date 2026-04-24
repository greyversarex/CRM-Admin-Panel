import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const crmTasksTable = pgTable("crm_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  // set null: задача "повисает" если ответственный удалён, но не теряется
  assignedToId: integer("assigned_to_id").references(() => usersTable.id, { onDelete: "set null" }),
  dueDate: text("due_date"),
  // related_entity_* — полиморфная связь, FK не вешаем
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: integer("related_entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("crm_tasks_status_idx").on(t.status),
  index("crm_tasks_assignee_idx").on(t.assignedToId),
  index("crm_tasks_related_idx").on(t.relatedEntityType, t.relatedEntityId),
]);

export const insertCrmTaskSchema = createInsertSchema(crmTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCrmTask = z.infer<typeof insertCrmTaskSchema>;
export type CrmTask = typeof crmTasksTable.$inferSelect;
