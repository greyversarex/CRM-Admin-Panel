import { pgTable, text, serial, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { labelsTable } from "./labels";
import { usersTable } from "./users";

export const labelMembersTable = pgTable("label_members", {
  id:          serial("id").primaryKey(),
  labelId:     integer("label_id").notNull().references(() => labelsTable.id, { onDelete: "cascade" }),
  email:       text("email").notNull(),
  name:        text("name").notNull(),
  role:        text("role").notNull().default("viewer"),
  status:      text("status").notNull().default("pending"),
  invitedById: integer("invited_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  invitedAt:   timestamp("invited_at",  { withTimezone: true }).notNull().defaultNow(),
  joinedAt:    timestamp("joined_at",   { withTimezone: true }),
}, (t) => [
  index("label_members_label_idx").on(t.labelId),
  uniqueIndex("label_members_label_email_unique").on(t.labelId, t.email),
]);

export type LabelMember = typeof labelMembersTable.$inferSelect;
