import { pgTable, text, serial, integer, timestamp, numeric, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releasesTable } from "./releases";
import { tracksTable } from "./tracks";
import { usersTable } from "./users";

/**
 * Сегмент multi-segment скана. Описывает результат проверки одного окна
 * аудио-файла. Сэмплируется по байтовым диапазонам, поэтому хранится
 * startBytes/endBytes + соответствующий процент от файла.
 */
export type AcrCheckSegment = {
  /** Порядковый номер сегмента (0..N-1). */
  index: number;
  /** Процентное положение от длины файла (0..100). UI рисует таймлайн. */
  startPct: number;
  endPct: number;
  /** Сырые байтовые границы — для отладки/повтора при необходимости. */
  startBytes?: number;
  endBytes?: number;
  /** Результат скана этого окна. */
  status: "matched" | "clean" | "error";
  /** Найденный трек если status=matched. */
  matchedTitle?: string | null;
  matchedArtist?: string | null;
  matchedIsrc?: string | null;
  /** Score от ACR 0..100 (или MusicBrainz). */
  score?: number | null;
  /** Сообщение об ошибке если status=error. */
  error?: string | null;
  /** Длительность HTTP+identify вызова в мс — для мониторинга. */
  tookMs?: number;
};

export const acrChecksTable = pgTable("acr_checks", {
  id: serial("id").primaryKey(),
  releaseId: integer("release_id").references(() => releasesTable.id, { onDelete: "cascade" }),
  trackId: integer("track_id").references(() => tracksTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending|matched|clean|error
  /**
   * Режим проверки:
   *  - "sample" (по умолчанию): один кусок ~12 сек из 20% файла, быстро.
   *  - "full":   multi-segment скан, окна по всему треку, медленно но точно.
   */
  mode: text("mode").notNull().default("sample"),
  /**
   * Движок проверки:
   *  - "acrcloud" (по умолчанию): аудио-fingerprint через ACRCloud Identify API.
   *  - "musicbrainz_isrc": проверка ISRC трека против базы MusicBrainz (free, public).
   */
  engine: text("engine").notNull().default("acrcloud"),
  confidence: numeric("confidence", { precision: 5, scale: 2 }), // 0..100
  matchedTitle: text("matched_title"),
  matchedArtist: text("matched_artist"),
  matchedIsrc: text("matched_isrc"),
  matchedLabel: text("matched_label"),
  /**
   * Для mode="full": массив результатов по каждому окну.
   * Для mode="sample": null.
   */
  segments: jsonb("segments").$type<AcrCheckSegment[]>(),
  resultJson: jsonb("result_json").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
  scannedBy: integer("scanned_by").references(() => usersTable.id, { onDelete: "set null" }),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("acr_checks_release_idx").on(t.releaseId),
  index("acr_checks_track_idx").on(t.trackId),
  index("acr_checks_status_idx").on(t.status),
  index("acr_checks_engine_idx").on(t.engine),
]);

export const insertAcrCheckSchema = createInsertSchema(acrChecksTable).omit({ id: true, scannedAt: true });
export type AcrCheck = typeof acrChecksTable.$inferSelect;
export type InsertAcrCheck = z.infer<typeof insertAcrCheckSchema>;
