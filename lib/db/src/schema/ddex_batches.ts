import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Batch — один физический «пакет» сообщений на одного партнёра.
 * Партнёры обычно требуют слать пачками: складываем 1..N сообщений в одну
 * директорию, последним заливаем `BatchComplete_<batchRef>.xml` — это сигнал
 * партнёру «можешь забирать».
 *
 * Состояния:
 *   building   — собирается, можно дописывать сообщения
 *   uploading  — воркер забрал, идёт upload
 *   uploaded   — все файлы залиты, BatchComplete отправлен, ждём ack партнёра
 *   acked      — все вложенные сообщения подтверждены
 *   partial    — часть acked, часть rejected
 *   rejected   — партнёр отверг весь batch
 *   failed     — отвалился transport (превышены retry)
 */
export const ddexBatchesTable = pgTable("ddex_batches", {
  id: serial("id").primaryKey(),
  batchRef: text("batch_ref").notNull().unique(), // BATCH-2026-04-26-vk_music-001
  partnerCode: text("partner_code").notNull(),    // 'vk_music' / 'spotify' / 'ddex_main'
  partyIdSender: text("party_id_sender").notNull(),
  partyIdRecipient: text("party_id_recipient").notNull(),
  ernVersion: text("ern_version").notNull().default("4.3"),

  status: text("status").notNull().default("building"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  ackReceivedAt: timestamp("ack_received_at", { withTimezone: true }),

  transport: text("transport").notNull().default("local-fs"), // local-fs | sftp | https
  remotePath: text("remote_path"),                            // /incoming/2026-04-26/BATCH-001/
  manifestFilename: text("manifest_filename"),                // BatchComplete_xxx.xml
  totalBytes: integer("total_bytes").notNull().default(0),
  fileCount: integer("file_count").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  lastError: text("last_error"),

  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("ddex_batches_partner_status_idx").on(t.partnerCode, t.status),
  index("ddex_batches_status_idx").on(t.status),
  index("ddex_batches_created_idx").on(t.createdAt),
]);

export const insertDdexBatchSchema = createInsertSchema(ddexBatchesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type DdexBatch = typeof ddexBatchesTable.$inferSelect;
export type InsertDdexBatch = z.infer<typeof insertDdexBatchSchema>;
