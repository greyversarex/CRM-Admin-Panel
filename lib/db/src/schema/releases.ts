import { pgTable, text, serial, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";

export const releasesTable = pgTable("releases", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  releaseType: text("release_type").notNull().default("single"),
  status: text("status").notNull().default("draft"),
  upc: text("upc"),
  // restrict: нельзя удалить артиста с релизами — это финансово/юридически связано
  artistId: integer("artist_id").notNull().references(() => artistsTable.id, { onDelete: "restrict" }),
  labelId: integer("label_id").references(() => labelsTable.id, { onDelete: "set null" }),
  coverUrl: text("cover_url"),
  genre: text("genre"),
  releaseDate: text("release_date"),
  language: text("language"),
  isExplicit: boolean("is_explicit").notNull().default(false),
  territories: text("territories").array().notNull().default(["WW"]),
  pLine: text("p_line"),
  cLine: text("c_line"),
  statusNote: text("status_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("releases_artist_idx").on(t.artistId),
  index("releases_label_idx").on(t.labelId),
  index("releases_status_idx").on(t.status),
  index("releases_release_date_idx").on(t.releaseDate),
  index("releases_upc_idx").on(t.upc),
]);

export const insertReleaseSchema = createInsertSchema(releasesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRelease = z.infer<typeof insertReleaseSchema>;
export type Release = typeof releasesTable.$inferSelect;
