import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export type TransferImportItem = {
  upc: string;
  title: string;
  artist: string;
  label: string | null;
  tracks: number;
  coverUrl: string | null;
  success: boolean;
  releaseId?: number | null;
  errorReason?: string | null;
};

export const transferImportsTable = pgTable("transfer_imports", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("complete"),
  spotifyArtistId: text("spotify_artist_id"),
  spotifyArtistName: text("spotify_artist_name"),
  importedCount: integer("imported_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  items: jsonb("items").$type<TransferImportItem[]>().notNull().default([]),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("transfer_imports_created_at_idx").on(t.createdAt),
  index("transfer_imports_created_by_idx").on(t.createdById),
]);

export type TransferImportRow = typeof transferImportsTable.$inferSelect;
