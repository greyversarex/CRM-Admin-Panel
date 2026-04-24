import { pgTable, text, serial, integer, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { artistsTable } from "./artists";
import { releasesTable } from "./releases";
import { tracksTable } from "./tracks";

export const usageReportsTable = pgTable("usage_reports", {
  id: serial("id").primaryKey(),
  // set null: отчёты переживают удаление родителей (история не теряется)
  artistId: integer("artist_id").references(() => artistsTable.id, { onDelete: "set null" }),
  releaseId: integer("release_id").references(() => releasesTable.id, { onDelete: "set null" }),
  trackId: integer("track_id").references(() => tracksTable.id, { onDelete: "set null" }),
  platform: text("platform").notNull(),
  period: text("period").notNull(),
  streams: integer("streams").notNull().default(0),
  revenue: numeric("revenue", { precision: 12, scale: 4 }).notNull().default("0"),
  countryCode: text("country_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("usage_reports_period_idx").on(t.period),
  index("usage_reports_track_idx").on(t.trackId),
  index("usage_reports_release_idx").on(t.releaseId),
  index("usage_reports_artist_idx").on(t.artistId),
  index("usage_reports_platform_idx").on(t.platform),
  index("usage_reports_period_track_idx").on(t.period, t.trackId),
]);

export const insertUsageReportSchema = createInsertSchema(usageReportsTable).omit({ id: true, createdAt: true });
export type InsertUsageReport = z.infer<typeof insertUsageReportSchema>;
export type UsageReport = typeof usageReportsTable.$inferSelect;
