import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const payoutsTable = pgTable("payouts", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id"),
  labelId: integer("label_id"),
  amount: numeric("amount", { precision: 12, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  method: text("method").notNull(),
  status: text("status").notNull().default("pending"),
  paymentDetails: text("payment_details"),
  rejectionReason: text("rejection_reason"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPayoutSchema = createInsertSchema(payoutsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayout = z.infer<typeof insertPayoutSchema>;
export type Payout = typeof payoutsTable.$inferSelect;
