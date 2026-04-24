import { pgTable, text, serial, integer, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";

export const payoutsTable = pgTable("payouts", {
  id: serial("id").primaryKey(),
  // restrict: история выплат — финансово-юридическая запись
  artistId: integer("artist_id").references(() => artistsTable.id, { onDelete: "restrict" }),
  labelId: integer("label_id").references(() => labelsTable.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 12, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  method: text("method").notNull(),
  status: text("status").notNull().default("pending"),
  paymentDetails: text("payment_details"),
  rejectionReason: text("rejection_reason"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("payouts_artist_idx").on(t.artistId),
  index("payouts_label_idx").on(t.labelId),
  index("payouts_status_idx").on(t.status),
]);

export const insertPayoutSchema = createInsertSchema(payoutsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayout = z.infer<typeof insertPayoutSchema>;
export type Payout = typeof payoutsTable.$inferSelect;
