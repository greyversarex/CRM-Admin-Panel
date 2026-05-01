import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { labelsTable } from "./labels";

export const artistsTable = pgTable("artists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  imageUrl: text("image_url"),
  genre: text("genre"),
  bio: text("bio"),
  country: text("country"),
  phone: text("phone"),
  labelId: integer("label_id").references(() => labelsTable.id, { onDelete: "set null" }),
  spotifyId: text("spotify_id"),
  appleId: text("apple_id"),
  socialLinks: jsonb("social_links"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("artists_label_idx").on(t.labelId),
  index("artists_slug_idx").on(t.slug),
  index("artists_status_idx").on(t.status),
]);

export const insertArtistSchema = createInsertSchema(artistsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertArtist = z.infer<typeof insertArtistSchema>;
export type Artist = typeof artistsTable.$inferSelect;
