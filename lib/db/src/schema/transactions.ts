import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 12, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  artistId: integer("artist_id"),
  labelId: integer("label_id"),
  releaseId: integer("release_id"),
  platform: text("platform"),
  description: text("description"),
  period: text("period"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
