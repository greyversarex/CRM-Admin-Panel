import { pgTable, text, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Обучаемый словарь соответствий колонок для универсального импорта каталога.
 *
 * Любой заголовок из Excel/CSV дистрибьютора (Symphonic, FUGA, TuneCore,
 * DistroKid, OneRPM, CD Baby …) сопоставляется с нашим внутренним полем
 * (`internalField`). При ручном сопоставлении неизвестной колонки новый алиас
 * сохраняется навсегда — в следующий раз колонка распознаётся автоматически.
 *
 * `alias` хранится в НОРМАЛИЗОВАННОМ виде (нижний регистр, только буквы/цифры,
 * одиночные пробелы) — сравнение заголовков не зависит от регистра/пунктуации.
 * `source` = '' — универсальный алиас (для всех источников); иначе привязан к
 * конкретному дистрибьютору.
 */
export const metadataFieldAliasesTable = pgTable("metadata_field_aliases", {
  id: serial("id").primaryKey(),
  internalField: text("internal_field").notNull(),
  alias: text("alias").notNull(),
  source: text("source").notNull().default(""),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("metadata_field_aliases_alias_source_uq").on(t.alias, t.source),
  index("metadata_field_aliases_internal_field_idx").on(t.internalField),
]);

export type MetadataFieldAlias = typeof metadataFieldAliasesTable.$inferSelect;
