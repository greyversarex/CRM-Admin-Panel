import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activityLogTable = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  userId: integer("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogTable).omit({ id: true, createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogTable.$inferSelect;
