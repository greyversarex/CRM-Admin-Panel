import { pgTable, text, serial, integer, timestamp, numeric, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releasesTable } from "./releases";
import { tracksTable } from "./tracks";
import { usersTable } from "./users";

export const acrChecksTable = pgTable("acr_checks", {
  id: serial("id").primaryKey(),
  releaseId: integer("release_id").references(() => releasesTable.id, { onDelete: "cascade" }),
  trackId: integer("track_id").references(() => tracksTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending|matched|clean|error
  confidence: numeric("confidence", { precision: 5, scale: 2 }), // 0..100
  matchedTitle: text("matched_title"),
  matchedArtist: text("matched_artist"),
  matchedIsrc: text("matched_isrc"),
  matchedLabel: text("matched_label"),
  resultJson: jsonb("result_json").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
  scannedBy: integer("scanned_by").references(() => usersTable.id, { onDelete: "set null" }),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("acr_checks_release_idx").on(t.releaseId),
  index("acr_checks_track_idx").on(t.trackId),
  index("acr_checks_status_idx").on(t.status),
]);

export const insertAcrCheckSchema = createInsertSchema(acrChecksTable).omit({ id: true, scannedAt: true });
export type AcrCheck = typeof acrChecksTable.$inferSelect;
export type InsertAcrCheck = z.infer<typeof insertAcrCheckSchema>;
