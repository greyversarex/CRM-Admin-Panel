import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";
import { usersTable } from "./users";

export const takedownRequestsTable = pgTable("takedown_requests", {
  id: serial("id").primaryKey(),
  releaseTitle: text("release_title").notNull(),
  artistName:   text("artist_name").notNull(),
  upc:          text("upc"),
  reason:       text("reason").notNull(),
  note:         text("note"),
  dsps:         text("dsps").array().notNull().default([]),
  status:       text("status").notNull().default("pending"),
  artistId:     integer("artist_id").references(() => artistsTable.id, { onDelete: "set null" }),
  labelId:      integer("label_id").references(() => labelsTable.id,  { onDelete: "set null" }),
  createdById:  integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  submittedAt:  timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt:  timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("takedown_requests_label_idx").on(t.labelId),
  index("takedown_requests_artist_idx").on(t.artistId),
  index("takedown_requests_status_idx").on(t.status),
]);

export type TakedownRequest = typeof takedownRequestsTable.$inferSelect;
