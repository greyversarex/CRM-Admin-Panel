import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),        // e.g. "release_approved" | "release_rejected" | "payout_approved" | "payout_rejected" | "general"
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  entityType: text("entity_type"),      // "release" | "payout" | null
  entityId: integer("entity_id"),       // FK to that entity
  link: text("link"),                   // frontend URL for navigation
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("notifications_user_idx").on(t.userId),
  index("notifications_user_read_idx").on(t.userId, t.readAt),
  index("notifications_created_idx").on(t.createdAt),
]);

export type Notification = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
