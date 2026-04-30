import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";
import { usersTable } from "./users";

export const presaveCampaignsTable = pgTable("presave_campaigns", {
  id:          serial("id").primaryKey(),
  title:       text("title").notNull(),
  artistName:  text("artist_name").notNull(),
  releaseDate: text("release_date").notNull(),
  platforms:   text("platforms").notNull().default("all"),
  slug:        text("slug").notNull(),
  saves:       integer("saves").notNull().default(0),
  clicks:      integer("clicks").notNull().default(0),
  status:      text("status").notNull().default("draft"),
  artistId:    integer("artist_id").references(() => artistsTable.id, { onDelete: "set null" }),
  labelId:     integer("label_id").references(() => labelsTable.id,  { onDelete: "set null" }),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("presave_campaigns_label_idx").on(t.labelId),
  index("presave_campaigns_artist_idx").on(t.artistId),
]);

export type PresaveCampaign = typeof presaveCampaignsTable.$inferSelect;
