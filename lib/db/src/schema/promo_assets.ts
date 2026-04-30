import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";
import { usersTable } from "./users";
import { releasesTable } from "./releases";

export const promoAssetsTable = pgTable("promo_assets", {
  id:          serial("id").primaryKey(),
  releaseId:   integer("release_id").references(() => releasesTable.id, { onDelete: "cascade" }),
  releaseTitle: text("release_title").notNull(),
  artistName:  text("artist_name").notNull(),
  assetType:   text("asset_type").notNull(),
  format:      text("format").notNull(),
  dimensions:  text("dimensions").notNull(),
  fileUrl:     text("file_url"),
  artistId:    integer("artist_id").references(() => artistsTable.id, { onDelete: "set null" }),
  labelId:     integer("label_id").references(() => labelsTable.id,  { onDelete: "set null" }),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("promo_assets_release_idx").on(t.releaseId),
  index("promo_assets_label_idx").on(t.labelId),
  index("promo_assets_artist_idx").on(t.artistId),
]);

export type PromoAsset = typeof promoAssetsTable.$inferSelect;
