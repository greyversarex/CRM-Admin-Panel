import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { labelsTable } from "./labels";

/** id артиста на конкретной витрине Broma16 (соответствует outlets[].id_outlet_user). */
export type Broma16OutletRef = {
  outletId: number;
  outletName: string;
  idOutletUser: string;
};

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
  // ── Broma16 (ROD API) идентификаторы ─────────────────────────────
  /** UUID артиста в Broma16 (используется в performers/main_performer). */
  broma16ArtistId: text("broma16_artist_id"),
  /** Числовой H11-идентификатор артиста в Broma16 (если выдан). */
  artistH11: integer("artist_h11"),
  /** IPI Name Number (для PRO-регистрации в Broma16). */
  ipiNameNumber: text("ipi_name_number"),
  /** IPN (Interested Party Number). */
  ipn: text("ipn"),
  /** ISNI артиста. */
  isni: text("isni"),
  /** id артиста на витринах (Spotify/Apple/…): передаётся в Broma16 как массив outlets. */
  broma16Outlets: jsonb("broma16_outlets").$type<Broma16OutletRef[]>(),
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
