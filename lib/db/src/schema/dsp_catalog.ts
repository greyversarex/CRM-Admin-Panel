import { pgTable, text, serial, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Master-каталог DSP/площадок дистрибуции.
 *
 * Используется на шаге Delivery Options мастера релизов, чтобы пользователь
 * мог выбрать на каких площадках выпускать релиз. Заполняется через миграцию
 * (см. 0015_release_wizard_overhaul.sql) и далее правится только админом.
 *
 * `code` — стабильный машинный идентификатор (`spotify`, `apple_music`),
 * совпадает с `target` в `deliveries.target` и `dspCode` в существующих
 * сервисах. `ddexPartyId` нужен для формирования ERN <PartyId>.
 */
export const dspCatalogTable = pgTable("dsp_catalog", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  ddexPartyId: text("ddex_party_id"),
  ddexPartyName: text("ddex_party_name"),
  sortOrder: integer("sort_order").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("dsp_catalog_active_idx").on(t.isActive, t.sortOrder),
]);

export const insertDspCatalogSchema = createInsertSchema(dspCatalogTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDspCatalog = z.infer<typeof insertDspCatalogSchema>;
export type DspCatalog = typeof dspCatalogTable.$inferSelect;
