import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const dspDealsTable = pgTable("dsp_deals", {
  id: serial("id").primaryKey(),
  dspName: text("dsp_name").notNull(),
  dealType: text("deal_type").notNull().default("distribution"),
  status: text("status").notNull().default("active"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  revenueShare: text("revenue_share"),
  territory: text("territory").notNull().default("WW"),
  contractRef: text("contract_ref"),
  notes: text("notes"),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("dsp_deals_dsp_idx").on(t.dspName),
  index("dsp_deals_status_idx").on(t.status),
]);

export const insertDspDealSchema = createInsertSchema(dspDealsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDspDeal = z.infer<typeof insertDspDealSchema>;
export type DspDeal = typeof dspDealsTable.$inferSelect;
