import { pgTable, text, serial, integer, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";
import { releasesTable } from "./releases";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 12, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  // restrict: финансовые записи нельзя осиротить
  artistId: integer("artist_id").references(() => artistsTable.id, { onDelete: "restrict" }),
  labelId: integer("label_id").references(() => labelsTable.id, { onDelete: "restrict" }),
  releaseId: integer("release_id").references(() => releasesTable.id, { onDelete: "restrict" }),
  platform: text("platform"),
  description: text("description"),
  period: text("period"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("transactions_period_idx").on(t.period),
  index("transactions_artist_idx").on(t.artistId),
  index("transactions_label_idx").on(t.labelId),
  index("transactions_release_idx").on(t.releaseId),
  index("transactions_type_idx").on(t.type),
  index("transactions_period_artist_idx").on(t.period, t.artistId),
]);

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
