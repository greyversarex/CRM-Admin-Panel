import { pgTable, text, serial, integer, timestamp, numeric, boolean, index } from "drizzle-orm/pg-core";
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
  // 2-step approval flow (Maker/Checker)
  approvalStage: text("approval_stage").notNull().default("pending"), // pending|approved_l1|approved_l2|paid|rejected
  approvedL1By: integer("approved_l1_by"),
  approvedL1At: timestamp("approved_l1_at", { withTimezone: true }),
  approvedL2By: integer("approved_l2_by"),
  approvedL2At: timestamp("approved_l2_at", { withTimezone: true }),
  twoStepRequired: boolean("two_step_required").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("payouts_artist_idx").on(t.artistId),
  index("payouts_label_idx").on(t.labelId),
  index("payouts_status_idx").on(t.status),
  index("payouts_approval_stage_idx").on(t.approvalStage),
]);

export const insertPayoutSchema = createInsertSchema(payoutsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayout = z.infer<typeof insertPayoutSchema>;
export type Payout = typeof payoutsTable.$inferSelect;
