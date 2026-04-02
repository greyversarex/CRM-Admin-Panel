import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const releasesTable = pgTable("releases", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  releaseType: text("release_type").notNull().default("single"),
  status: text("status").notNull().default("draft"),
  upc: text("upc"),
  artistId: integer("artist_id").notNull(),
  labelId: integer("label_id"),
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
});

export const insertReleaseSchema = createInsertSchema(releasesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRelease = z.infer<typeof insertReleaseSchema>;
export type Release = typeof releasesTable.$inferSelect;
