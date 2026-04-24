import { pgTable, text, serial, integer, timestamp, numeric, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Журнал импортов CSV-отчётов от DSP. Одна строка = один загруженный файл.
// idempotencyKey (sha256(file)+dsp+period) предотвращает двойной импорт.
export const ingestionImportsTable = pgTable("ingestion_imports", {
  id: serial("id").primaryKey(),
  dsp: text("dsp").notNull(),
  period: text("period").notNull(),
  filename: text("filename").notNull(),
  // set null: пользователь может быть удалён, но история импортов сохраняется
  uploadedBy: integer("uploaded_by").references(() => usersTable.id, { onDelete: "set null" }),
  totalRows: integer("total_rows").notNull().default(0),
  insertedRows: integer("inserted_rows").notNull().default(0),
  unmatchedRows: integer("unmatched_rows").notNull().default(0),
  totalRevenue: numeric("total_revenue", { precision: 14, scale: 4 }).notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ingestion_imports_idempotency_uniq").on(t.idempotencyKey),
  index("ingestion_imports_dsp_period_idx").on(t.dsp, t.period),
  index("ingestion_imports_created_idx").on(t.createdAt),
]);

// Строки CSV, у которых ISRC не нашёлся в tracks. Не теряем доход — админ
// разрешает руками (resolved=true → ручная проводка в transactions).
export const ingestionUnmatchedTable = pgTable("ingestion_unmatched", {
  id: serial("id").primaryKey(),
  // cascade: если удалили родительский импорт, нематченные строки тоже не нужны
  importId: integer("import_id").notNull().references(() => ingestionImportsTable.id, { onDelete: "cascade" }),
  dsp: text("dsp").notNull(),
  period: text("period").notNull(),
  rawIsrc: text("raw_isrc"),
  rawTitle: text("raw_title"),
  rawArtist: text("raw_artist"),
  revenue: numeric("revenue", { precision: 12, scale: 4 }).notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  countryCode: text("country_code"),
  streams: integer("streams").notNull().default(0),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ingestion_unmatched_import_idx").on(t.importId),
  index("ingestion_unmatched_isrc_idx").on(t.rawIsrc),
  index("ingestion_unmatched_resolved_idx").on(t.resolved),
]);

export const insertIngestionImportSchema = createInsertSchema(ingestionImportsTable).omit({ id: true, createdAt: true });
export type InsertIngestionImport = z.infer<typeof insertIngestionImportSchema>;
export type IngestionImport = typeof ingestionImportsTable.$inferSelect;

export const insertIngestionUnmatchedSchema = createInsertSchema(ingestionUnmatchedTable).omit({ id: true, createdAt: true });
export type InsertIngestionUnmatched = z.infer<typeof insertIngestionUnmatchedSchema>;
export type IngestionUnmatched = typeof ingestionUnmatchedTable.$inferSelect;
