import { pgTable, text, serial, integer, timestamp, bigint, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releasesTable } from "./releases";
import { tracksTable } from "./tracks";

export const ugcMetricsTable = pgTable("ugc_metrics", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(), // 'youtube_cms' | 'tiktok' | 'meta' | 'instagram'
  externalContentId: text("external_content_id"),
  releaseId: integer("release_id").references(() => releasesTable.id, { onDelete: "set null" }),
  trackId: integer("track_id").references(() => tracksTable.id, { onDelete: "set null" }),
  views: bigint("views", { mode: "number" }).notNull().default(0),
  likes: bigint("likes", { mode: "number" }).notNull().default(0),
  shares: bigint("shares", { mode: "number" }).notNull().default(0),
  videosCount: integer("videos_count").notNull().default(0),
  revenueCents: bigint("revenue_cents", { mode: "number" }).notNull().default(0),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ugc_metrics_platform_idx").on(t.platform),
  index("ugc_metrics_release_idx").on(t.releaseId),
  index("ugc_metrics_recorded_idx").on(t.recordedAt),
]);

export const insertUgcMetricSchema = createInsertSchema(ugcMetricsTable).omit({ id: true, createdAt: true });
export type UgcMetric = typeof ugcMetricsTable.$inferSelect;
export type InsertUgcMetric = z.infer<typeof insertUgcMetricSchema>;
