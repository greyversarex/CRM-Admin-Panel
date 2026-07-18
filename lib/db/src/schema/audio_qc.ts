import { pgTable, text, serial, integer, timestamp, real, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { tracksTable } from "./tracks";

/** Одно замечание Audio QC (предупреждение/ошибка) с таймкодами. */
export type AudioQcIssue = {
  /** Машинный код: clipping | silence | dead_air | fade_in_missing | fade_out_missing | distortion | loudness | sample_rate | channels */
  code: string;
  severity: "error" | "warning" | "info";
  /** Готовый человекочитаемый текст (ru). */
  message: string;
  /** Таймкоды в секундах, если применимо. */
  startSec?: number;
  endSec?: number;
};

/**
 * Результат автоматического анализа качества аудио (Audio QC) для трека.
 * Одна строка на трек; при замене аудиофайла (object_path меняется)
 * анализ выполняется заново и строка перезаписывается.
 */
export const audioQcTable = pgTable("audio_qc", {
  id: serial("id").primaryKey(),
  trackId: integer("track_id").notNull().references(() => tracksTable.id, { onDelete: "cascade" }),
  /** objectPath аудиофайла, для которого выполнен анализ. */
  objectPath: text("object_path").notNull(),

  // ── Технические параметры файла ──
  durationSec: real("duration_sec"),
  sampleRateHz: integer("sample_rate_hz"),
  channels: integer("channels"),
  codec: text("codec"),
  bitDepth: integer("bit_depth"),

  // ── Громкость ──
  integratedLufs: real("integrated_lufs"),
  truePeakDb: real("true_peak_db"),

  // ── Результаты детекторов ──
  fadeIn: boolean("fade_in"),
  fadeOut: boolean("fade_out"),
  distortion: boolean("distortion"),
  clippedSamples: integer("clipped_samples"),
  /** События клиппинга: [{ startSec, peakDb }] (первые N). */
  clippingEvents: jsonb("clipping_events").$type<{ startSec: number; peakDb: number | null }[]>(),
  /** Длинные паузы внутри трека: [{ startSec, endSec }]. */
  silences: jsonb("silences").$type<{ startSec: number; endSec: number }[]>(),
  /** «Мёртвый воздух» в конце: { startSec, endSec } или null. */
  deadAir: jsonb("dead_air").$type<{ startSec: number; endSec: number } | null>(),

  /** Пики волнограммы 0..1 (~600 точек) для честного waveform в UI. */
  peaks: jsonb("peaks").$type<number[]>(),

  /** Сводный список замечаний для UI. */
  issues: jsonb("issues").$type<AudioQcIssue[]>().notNull().default([]),
  /** pass | warning | error */
  status: text("status").notNull().default("pass"),

  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("audio_qc_track_uniq").on(t.trackId),
]);

export type AudioQcRow = typeof audioQcTable.$inferSelect;
