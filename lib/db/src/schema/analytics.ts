import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usageReportsTable = pgTable("usage_reports", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id"),
  releaseId: integer("release_id"),
  trackId: integer("track_id"),
  platform: text("platform").notNull(),
  period: text("period").notNull(),
  streams: integer("streams").notNull().default(0),
  revenue: numeric("revenue", { precision: 12, scale: 4 }).notNull().default("0"),
  countryCode: text("country_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUsageReportSchema = createInsertSchema(usageReportsTable).omit({ id: true, createdAt: true });
export type InsertUsageReport = z.infer<typeof insertUsageReportSchema>;
export type UsageReport = typeof usageReportsTable.$inferSelect;
