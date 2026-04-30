import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";
import { tracksTable } from "./tracks";

export const tiktokStatsTable = pgTable("tiktok_stats", {
  id:          serial("id").primaryKey(),
  trackId:     integer("track_id").references(() => tracksTable.id, { onDelete: "cascade" }),
  trackTitle:  text("track_title").notNull(),
  artistName:  text("artist_name").notNull(),
  uses:        integer("uses").notNull().default(0),
  videoViews:  integer("video_views").notNull().default(0),
  likes:       integer("likes").notNull().default(0),
  reposts:     integer("reposts").notNull().default(0),
  artistId:    integer("artist_id").references(() => artistsTable.id, { onDelete: "set null" }),
  labelId:     integer("label_id").references(() => labelsTable.id,  { onDelete: "set null" }),
  periodStart: text("period_start").notNull(),
  periodEnd:   text("period_end").notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("tiktok_stats_label_idx").on(t.labelId),
  index("tiktok_stats_artist_idx").on(t.artistId),
  index("tiktok_stats_track_idx").on(t.trackId),
]);

export type TiktokStat = typeof tiktokStatsTable.$inferSelect;
