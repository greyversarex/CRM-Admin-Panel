import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releasesTable } from "./releases";

/**
 * Выбранные DSP/площадки для конкретного релиза (шаг Delivery Options).
 *
 * `dspCode` ссылается на `dsp_catalog.code` логически (без FK, потому что
 * каталог переменчив, а исторические выборы должны переживать переименование
 * кода). Если DSP удалён из каталога — запись остаётся для аудита.
 *
 * cascade: запись принадлежит релизу.
 */
export const releaseDspsTable = pgTable("release_dsps", {
  id: serial("id").primaryKey(),
  releaseId: integer("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
  dspCode: text("dsp_code").notNull(),
  selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("release_dsps_release_code_uniq").on(t.releaseId, t.dspCode),
  index("release_dsps_release_idx").on(t.releaseId),
]);

export const insertReleaseDspSchema = createInsertSchema(releaseDspsTable).omit({ id: true, selectedAt: true });
export type InsertReleaseDsp = z.infer<typeof insertReleaseDspSchema>;
export type ReleaseDsp = typeof releaseDspsTable.$inferSelect;
