import { pgTable, text, serial, integer, timestamp, real, index } from "drizzle-orm/pg-core";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";

export const playlistStatsTable = pgTable("playlist_stats", {
  id:           serial("id").primaryKey(),
  playlistName: text("playlist_name").notNull(),
  dsp:          text("dsp").notNull(),
  followers:    integer("followers").notNull().default(0),
  streams:      integer("streams").notNull().default(0),
  trendPct:     real("trend_pct").notNull().default(0),
  artistId:     integer("artist_id").references(() => artistsTable.id, { onDelete: "set null" }),
  labelId:      integer("label_id").references(() => labelsTable.id,  { onDelete: "set null" }),
  lastUpdated:  timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("playlist_stats_label_idx").on(t.labelId),
  index("playlist_stats_artist_idx").on(t.artistId),
]);

export type PlaylistStat = typeof playlistStatsTable.$inferSelect;
