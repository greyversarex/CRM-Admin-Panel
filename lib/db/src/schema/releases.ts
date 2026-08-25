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
  /** Опциональная пометка версии: "Remix", "Live", "Deluxe Edition", … */
  releaseVersion: text("release_version"),
  releaseType: text("release_type").notNull().default("single"),
  status: text("status").notNull().default("draft"),
  upc: text("upc"),
  /**
   * Внутренний код лейбла. Авто-генерится на сервере как `CAT{id}` если
   * пользователь не задал вручную.
   */
  catalogNumber: text("catalog_number"),
  // restrict: нельзя удалить артиста с релизами — это финансово/юридически связано
  // Историческое поле «главный артист». Для multi-primary см. release_artists.
  artistId: integer("artist_id").notNull().references(() => artistsTable.id, { onDelete: "restrict" }),
  labelId: integer("label_id").references(() => labelsTable.id, { onDelete: "set null" }),
  coverUrl: text("cover_url"),
  genre: text("genre"),
  subgenre: text("subgenre"),
  releaseDate: text("release_date"),
  /** HH:MM в UTC. Используется в Delivery Options Timeline. */
  releaseTime: text("release_time"),
  /** Оригинальная дата первого выхода (для перевыпусков/каталога). YYYY-MM-DD. */
  originalReleaseDate: text("original_release_date"),
  /** Релиз импортирован через Transfer Track (перенос каталога). В Broma16 уходит isTransferRelease=true. */
  isTransfer: boolean("is_transfer").notNull().default(false),
  /** Дата старта предзаказа / pre-save. YYYY-MM-DD. */
  preorderDate: text("preorder_date"),
  language: text("language"),
  isExplicit: boolean("is_explicit").notNull().default(false),
  /** Сборник нескольких артистов (Compilation Yes/No). */
  isCompilation: boolean("is_compilation").notNull().default(false),
  /** Various Artists (5+ контрибьюторов как primary). */
  isVariousArtists: boolean("is_various_artists").notNull().default(false),
  territories: text("territories").array().notNull().default(["WW"]),
  /** Старые свободные поля — оставлены для совместимости и DDEX backfill. */
  pLine: text("p_line"),
  cLine: text("c_line"),
  /** Год P-line отдельно (для DDEX <PLine><Year>). */
  pLineYear: integer("p_line_year"),
  /** Год C-line отдельно (для DDEX <CLine><Year>). */
  cLineYear: integer("c_line_year"),
  statusNote: text("status_note"),
  /**
   * Раскрытие использования AI для обложки: none | some | all. NULL = не указано
   * (Symphonic: обязательное поле для отправки на модерацию).
   */
  coverAiUsage: text("cover_ai_usage"),
  /**
   * Пользователь нажал "I need a UPC" в UPC-гейте — UPC будет присвоен на сабмите.
   * До сабмита UPC поле заблокировано в UI и показывает "Assigned on submission".
   */
  upcRequestPending: boolean("upc_request_pending").notNull().default(false),
  /**
   * Переводы названия/версии релиза для разных языков: [{language, title, version}].
   * Symphonic "+ Add Translation" — необязательное многоязычие метаданных.
   */
  metadataTranslations: jsonb("metadata_translations").$type<Array<{
    language: string;
    title: string;
    version?: string | null;
  }>>().notNull().default(sql`'[]'::jsonb`),
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

  // ── Broma16 (ROD API) интеграция ─────────────────────────────────
  /** ID релиза в Broma16 после успешного создания (шаг 2 пушера). NULL = ещё не отправлен. */
  broma16ReleaseId: integer("broma16_release_id"),
  // Идентификатор записи в каталоге Broma16 (метод /accounts/{id}/assets).
  // Это ДРУГОЕ пространство номеров, чем у черновиков репертуара: раньше оба
  // складывались в broma16_release_id, и при повторной отправке мы слали PUT
  // по несуществующему черновику — Broma16 отвечала 404.
  broma16AssetId: integer("broma16_asset_id"),
  /** Статус модерации в Broma16: pending | approved | rejected | on_platforms | NULL. */
  broma16ModerationStatus: text("broma16_moderation_status"),
  /** Выбранные витрины (outlet-коды) для дистрибуции через Broma16. */
  broma16DistributionOutlets: jsonb("broma16_distribution_outlets").$type<string[]>(),
  /** Когда релиз был успешно отправлен на модерацию в Broma16. */
  broma16PushedAt: timestamp("broma16_pushed_at", { withTimezone: true }),
  /** Текст последней ошибки пуша в Broma16 (для UI «Повторить»). */
  broma16LastError: text("broma16_last_error"),

  /** Когда релиз был отправлен на модерацию (POST /releases/:id/submit). NULL = ещё не отправлен. */
  submittedAt: timestamp("submitted_at", { withTimezone: true }),

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
  uniqueIndex("releases_catalog_number_uniq_idx").on(t.catalogNumber).where(sql`${t.catalogNumber} IS NOT NULL AND ${t.catalogNumber} <> ''`),
]);

export const insertReleaseSchema = createInsertSchema(releasesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRelease = z.infer<typeof insertReleaseSchema>;
export type Release = typeof releasesTable.$inferSelect;
