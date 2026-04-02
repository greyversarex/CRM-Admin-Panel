import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tracksTable = pgTable("tracks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  isrc: text("isrc"),
  releaseId: integer("release_id"),
  artistId: integer("artist_id").notNull(),
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
});

export const insertTrackSchema = createInsertSchema(tracksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrack = z.infer<typeof insertTrackSchema>;
export type Track = typeof tracksTable.$inferSelect;
