import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  objectPath: text("object_path").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256"),
  durationSeconds: integer("duration_seconds"),
  releaseId: integer("release_id"),
  trackId: integer("track_id"),
  artistId: integer("artist_id"),
  labelId: integer("label_id"),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("assets_release_idx").on(t.releaseId),
  index("assets_track_idx").on(t.trackId),
  index("assets_artist_idx").on(t.artistId),
  // Non-unique sha256 index — useful for "find duplicates" but we never auto-merge
  // across scopes (would leak associations between tenants).
  index("assets_sha256_idx").on(t.sha256),
]);

export const insertAssetSchema = createInsertSchema(assetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;
