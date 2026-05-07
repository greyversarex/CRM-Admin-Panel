import { pgTable, text, serial, integer, timestamp, boolean, index, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { artistsTable } from "./artists";
import { releasesTable } from "./releases";

/**
 * Display Artist на уровне трека: имя + роль (primary/featuring/with/remixer).
 * Хранится в `tracks.displayArtists` (jsonb).
 */
export type TrackDisplayArtist = {
  name: string;
  role: "primary" | "featuring" | "with" | "remixer";
  /** Опционально — связь с artists.id, если контрибьютор — известный артист. */
  artistId?: number | null;
};

/**
 * Writer (автор/композитор) для регистрации в PRO/MLC.
 * `share` суммируется до 100 на трек (валидируется на API).
 */
export type TrackWriter = {
  name: string;
  role: "composer" | "lyricist" | "songwriter" | "arranger";
  share: number;            // 0..100
  caeIpi?: string | null;   // CAE/IPI для PRO
};

/**
 * Performer (исполнитель / музыкант). Required для Apple Music.
 */
export type TrackPerformer = {
  name: string;
  /** vocals | background_vocals | guitar | bass | drums | keyboards | music_producer | … */
  role: string;
};

/**
 * Production & Engineering. Required для Apple Music.
 */
export type TrackProductionMember = {
  name: string;
  /** producer | recording_engineer | mixing_engineer | mastering_engineer | … */
  role: string;
};

export const tracksTable = pgTable("tracks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  /** Опциональная пометка версии: "Remix", "Acoustic", "Live", … */
  trackVersion: text("track_version"),
  isrc: text("isrc"),
  // cascade: удаление релиза удаляет его треки (это business: трек существует в релизе)
  releaseId: integer("release_id").references(() => releasesTable.id, { onDelete: "cascade" }),
  // restrict: нельзя удалить артиста с треками
  artistId: integer("artist_id").notNull().references(() => artistsTable.id, { onDelete: "restrict" }),
  trackNumber: integer("track_number"),
  durationSeconds: integer("duration_seconds"),
  genre: text("genre"),
  subgenre: text("subgenre"),
  language: text("language"),
  isExplicit: boolean("is_explicit").notNull().default(false),
  /**
   * 3-state explicit: non_explicit | explicit | censored.
   * Заменяет boolean isExplicit в DDEX-выгрузке (boolean остаётся для совместимости).
   */
  explicitStatus: text("explicit_status").notNull().default("non_explicit"),
  /** Использование AI: none | some | all. Регуляторное требование DSP с 2024. */
  aiUsage: text("ai_usage").notNull().default("none"),
  /** Превью DSP начнёт играть с этой секунды. */
  clipStartSeconds: integer("clip_start_seconds").notNull().default(0),
  /** Год записи (отдельно от даты релиза). */
  recordingYear: integer("recording_year"),
  /** ISO-3166-1 alpha-2 страны записи. */
  countryOfRecording: text("country_of_recording"),
  /** instrumental | vocal */
  audioStyle: text("audio_style").notNull().default("vocal"),
  /** ISO-639-1 язык вокала. Для Apple/Spotify lyrics matching. */
  vocalLanguage: text("vocal_language"),
  /** Полный текст песни (опционально). */
  lyrics: text("lyrics"),
  iswc: text("iswc"),
  audioUrl: text("audio_url"),

  /** Display Artists (см. TrackDisplayArtist[]). */
  displayArtists: jsonb("display_artists").$type<TrackDisplayArtist[]>().notNull().default(sql`'[]'::jsonb`),
  /** Writers с долями (см. TrackWriter[]). Заменяет composerName/lyricistName. */
  writers: jsonb("writers").$type<TrackWriter[]>().notNull().default(sql`'[]'::jsonb`),
  /** Performers (см. TrackPerformer[]). */
  performers: jsonb("performers").$type<TrackPerformer[]>().notNull().default(sql`'[]'::jsonb`),
  /** Production & Engineering (см. TrackProductionMember[]). */
  production: jsonb("production").$type<TrackProductionMember[]>().notNull().default(sql`'[]'::jsonb`),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("tracks_release_idx").on(t.releaseId),
  index("tracks_artist_idx").on(t.artistId),
  index("tracks_isrc_idx").on(t.isrc),
]);

export const insertTrackSchema = createInsertSchema(tracksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrack = z.infer<typeof insertTrackSchema>;
export type Track = typeof tracksTable.$inferSelect;
