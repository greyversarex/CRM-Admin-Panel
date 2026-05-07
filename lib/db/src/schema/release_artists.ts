import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releasesTable } from "./releases";
import { artistsTable } from "./artists";

/**
 * Связь релиза с его контрибьюторами-исполнителями (Display Artists на уровне
 * релиза). Один релиз может иметь несколько Primary артистов и несколько
 * Featured/With/Remixer.
 *
 * `releasesTable.artistId` остаётся для обратной совместимости как «главный»
 * (первый Primary), но реальный список — здесь.
 *
 * cascade: при удалении релиза или артиста запись удаляется.
 */
export const releaseArtistsTable = pgTable("release_artists", {
  id: serial("id").primaryKey(),
  releaseId: integer("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
  artistId: integer("artist_id").notNull().references(() => artistsTable.id, { onDelete: "cascade" }),
  /** primary | featuring | with | remixer */
  role: text("role").notNull().default("primary"),
  /** Порядок отображения (0 — первый) */
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("release_artists_release_artist_uniq").on(t.releaseId, t.artistId),
  index("release_artists_release_idx").on(t.releaseId),
  index("release_artists_artist_idx").on(t.artistId),
]);

export const insertReleaseArtistSchema = createInsertSchema(releaseArtistsTable).omit({ id: true, createdAt: true });
export type InsertReleaseArtist = z.infer<typeof insertReleaseArtistSchema>;
export type ReleaseArtist = typeof releaseArtistsTable.$inferSelect;
