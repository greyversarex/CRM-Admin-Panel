import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releasesTable } from "./releases";
import { tracksTable } from "./tracks";
import { usersTable } from "./users";

export const contentIdAssetsTable = pgTable("content_id_assets", {
  id: serial("id").primaryKey(),
  assetType: text("asset_type").notNull(),
  trackId: integer("track_id").references(() => tracksTable.id, { onDelete: "cascade" }),
  releaseId: integer("release_id").references(() => releasesTable.id, { onDelete: "cascade" }),
  ytAssetId: text("yt_asset_id"),
  status: text("status").notNull().default("pending"),
  claimPolicy: text("claim_policy").notNull().default("monetize"),
  ownership: text("ownership").notNull().default("WW"),
  notes: text("notes"),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
  registeredBy: integer("registered_by").references(() => usersTable.id, { onDelete: "set null" }),
  registeredAt: timestamp("registered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("content_id_assets_track_idx").on(t.trackId),
  index("content_id_assets_release_idx").on(t.releaseId),
  index("content_id_assets_status_idx").on(t.status),
]);

export const insertContentIdAssetSchema = createInsertSchema(contentIdAssetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContentIdAsset = z.infer<typeof insertContentIdAssetSchema>;
export type ContentIdAsset = typeof contentIdAssetsTable.$inferSelect;
