import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";
import { usersTable } from "./users";

export type SmartLinkDsp = { name: string; url: string; active: boolean };

export const smartLinksTable = pgTable("smart_links", {
  id:          serial("id").primaryKey(),
  title:       text("title").notNull(),
  artistName:  text("artist_name").notNull(),
  slug:        text("slug").notNull().unique(),
  clicks:      integer("clicks").notNull().default(0),
  topPlatform: text("top_platform"),
  dsps:        jsonb("dsps").notNull().default([]),
  artistId:    integer("artist_id").references(() => artistsTable.id, { onDelete: "set null" }),
  labelId:     integer("label_id").references(() => labelsTable.id,  { onDelete: "set null" }),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("smart_links_label_idx").on(t.labelId),
  index("smart_links_artist_idx").on(t.artistId),
]);

export type SmartLink = typeof smartLinksTable.$inferSelect;
