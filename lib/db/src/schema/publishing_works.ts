import { pgTable, text, serial, integer, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tracksTable } from "./tracks";

export const publishingWorksTable = pgTable("publishing_works", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  iswc: text("iswc"),
  isrc: text("isrc"),
  // set null: издательское "произведение" — отдельная сущность, может пережить трек
  trackId: integer("track_id").references(() => tracksTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"),
  writers: jsonb("writers").notNull().default([]),
  publisher: text("publisher"),
  territory: text("territory").array().notNull().default(["WW"]),
  registeredWith: text("registered_with").array().notNull().default([]),
  mlcSongCode: text("mlc_song_code"),
  songtrust: boolean("songtrust").notNull().default(false),
  ascap: boolean("ascap").notNull().default(false),
  bmi: boolean("bmi").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("publishing_works_track_idx").on(t.trackId),
  index("publishing_works_status_idx").on(t.status),
  index("publishing_works_iswc_idx").on(t.iswc),
]);

export const insertPublishingWorkSchema = createInsertSchema(publishingWorksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPublishingWork = z.infer<typeof insertPublishingWorkSchema>;
export type PublishingWork = typeof publishingWorksTable.$inferSelect;
