import { pgTable, text, serial, integer, timestamp, boolean, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";
import { releasesTable } from "./releases";
import { tracksTable } from "./tracks";
import { usersTable } from "./users";

/**
 * Таблица владельцев прав.
 *
 * Каждая строка описывает, кому принадлежит определённый вид прав
 * на конкретный трек или релиз, в каком проценте и на какой территории.
 *
 * Полиморфная связь: либо track_id, либо release_id (не оба сразу).
 *
 * rights_type:
 *   master      — права на звукозапись (мастер)
 *   sync        — синхронизационные права (для ТВ/кино)
 *   mechanical  — механические права (воспроизведение)
 *   neighboring — смежные права (исполнители, продюсеры)
 *   all         — полный пакет
 *
 * holder_type:
 *   artist      — физлицо-исполнитель из нашего каталога
 *   label       — лейбл из нашего каталога
 *   publisher   — паблишер (внешний, имя в holder_name)
 *   distributor — дистрибьютор (сам Tajik Music)
 *   other       — прочие (продюсер, автор и т.д.)
 */
export const rightsHoldersTable = pgTable("rights_holders", {
  id: serial("id").primaryKey(),

  assetType: text("asset_type").notNull(), // "track" | "release"
  // FK-ссылки полиморфные — одно из двух не null.
  trackId: integer("track_id").references(() => tracksTable.id, { onDelete: "cascade" }),
  releaseId: integer("release_id").references(() => releasesTable.id, { onDelete: "cascade" }),

  holderType: text("holder_type").notNull(), // "artist" | "label" | "publisher" | "distributor" | "other"
  holderName: text("holder_name").notNull(),  // текстовое имя (всегда заполнено)
  // Ссылки на наши сущности (опционально):
  holderArtistId: integer("holder_artist_id").references(() => artistsTable.id, { onDelete: "set null" }),
  holderLabelId: integer("holder_label_id").references(() => labelsTable.id, { onDelete: "set null" }),

  rightsType: text("rights_type").notNull().default("master"), // "master" | "sync" | "mechanical" | "neighboring" | "all"
  sharePct: numeric("share_pct", { precision: 6, scale: 3 }).notNull().default("100"),
  territory: text("territory").notNull().default("WW"),  // "WW" или ISO-код(ы)
  exclusive: boolean("exclusive").notNull().default(false),

  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  notes: text("notes"),

  // Manual override / killswitch — заморозка прав
  frozen: boolean("frozen").notNull().default(false),
  frozenReason: text("frozen_reason"),
  frozenBy: integer("frozen_by").references(() => usersTable.id, { onDelete: "set null" }),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),

  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("rh_track_idx").on(t.trackId),
  index("rh_release_idx").on(t.releaseId),
  index("rh_holder_artist_idx").on(t.holderArtistId),
  index("rh_holder_label_idx").on(t.holderLabelId),
  index("rh_asset_type_idx").on(t.assetType),
  index("rh_rights_type_idx").on(t.rightsType),
]);

export const insertRightsHolderSchema = createInsertSchema(rightsHoldersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRightsHolder = z.infer<typeof insertRightsHolderSchema>;
export type RightsHolder = typeof rightsHoldersTable.$inferSelect;
