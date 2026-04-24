import { pgTable, text, serial, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { artistsTable } from "./artists";
import { releasesTable } from "./releases";

export const tracksTable = pgTable("tracks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  isrc: text("isrc"),
  // cascade: удаление релиза удаляет его треки (это business: трек существует в релизе)
  releaseId: integer("release_id").references(() => releasesTable.id, { onDelete: "cascade" }),
  // restrict: нельзя удалить артиста с треками
  artistId: integer("artist_id").notNull().references(() => artistsTable.id, { onDelete: "restrict" }),
  trackNumber: integer("track_number"),
  durationSeconds: integer("duration_seconds"),
  genre: text("genre"),
  language: text("language"),
  isExplicit: boolean("is_explicit").notNull().default(false),
  composerName: text("composer_name"),
  lyricistName: text("lyricist_name"),
  iswc: text("iswc"),
  audioUrl: text("audio_url"),
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
