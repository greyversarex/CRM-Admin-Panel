import { pgTable, text, serial, integer, timestamp, boolean, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";

/**
 * Один фактор риска релиза, который видит модератор. Поднимается в UI
 * на странице релиза в блоке «Оценка риска».
 */
export type ReleaseRiskFactor = {
  /** Машинный код фактора, напр. "regional_genre", "label_strikes_high". */
  code: string;
  /** Человекочитаемое описание для модератора (ru). */
  message: string;
  /** Уровень: low (0-25), medium (25-60), high (60-100). */
  severity: "low" | "medium" | "high";
};

export const releasesTable = pgTable("releases", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  releaseType: text("release_type").notNull().default("single"),
  status: text("status").notNull().default("draft"),
  upc: text("upc"),
  // restrict: нельзя удалить артиста с релизами — это финансово/юридически связано
  artistId: integer("artist_id").notNull().references(() => artistsTable.id, { onDelete: "restrict" }),
  labelId: integer("label_id").references(() => labelsTable.id, { onDelete: "set null" }),
  coverUrl: text("cover_url"),
  genre: text("genre"),
  releaseDate: text("release_date"),
  language: text("language"),
  isExplicit: boolean("is_explicit").notNull().default(false),
  territories: text("territories").array().notNull().default(["WW"]),
  pLine: text("p_line"),
  cLine: text("c_line"),
  statusNote: text("status_note"),
  /**
   * Композитный risk-score 0..100, перерасчитывается risk-engine'ом при
   * submit/approve/scan. 0 = чисто, 100 = максимальный риск отказа DSP.
   */
  riskScore: integer("risk_score").notNull().default(0),
  /**
   * Набор причин текущего score. Показывается модератору в карточке.
   * Пересчитывается вместе с riskScore.
   */
  riskFactors: jsonb("risk_factors").$type<ReleaseRiskFactor[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("releases_artist_idx").on(t.artistId),
  index("releases_label_idx").on(t.labelId),
  index("releases_status_idx").on(t.status),
  index("releases_release_date_idx").on(t.releaseDate),
  // Partial unique index: prevents duplicate UPCs at the DB level (race-safe).
  // NULL/empty UPCs are allowed for drafts that haven't received a barcode yet.
  uniqueIndex("releases_upc_unique_idx").on(t.upc).where(sql`${t.upc} IS NOT NULL AND ${t.upc} <> ''`),
]);

export const insertReleaseSchema = createInsertSchema(releasesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRelease = z.infer<typeof insertReleaseSchema>;
export type Release = typeof releasesTable.$inferSelect;
