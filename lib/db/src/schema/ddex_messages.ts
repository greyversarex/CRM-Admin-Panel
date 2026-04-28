import { pgTable, text, serial, integer, timestamp, jsonb, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releasesTable } from "./releases";
import { ddexBatchesTable } from "./ddex_batches";
import { deliveriesTable } from "./deliveries";

/**
 * DDEX-сообщение = один ERN XML, который описывает одно действие над одним
 * релизом для одного партнёра. Initial / Update / Takedown — три типа.
 *
 * Жизненный цикл:
 *   draft → validated → queued → sent → (acked | rejected)
 *   draft → invalid (если бизнес-валидация провалилась)
 *   queued → cancelled (оператор отменил до отправки)
 */
export const ddexMessagesTable = pgTable("ddex_messages", {
  id: serial("id").primaryKey(),
  messageRef: text("message_ref").notNull().unique(),     // MSG-vk_music-2026-04-26-0001
  messageThreadId: text("message_thread_id").notNull(),   // одинаковый для Initial→Update→Takedown по одному релизу+партнёру

  batchId: integer("batch_id").references(() => ddexBatchesTable.id, { onDelete: "set null" }),
  releaseId: integer("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
  // Связь с очередью deliveries (оба направления возможны: запись в deliveries
  // создаёт ddex_message, либо ddex_message создаётся независимо)
  deliveryId: integer("delivery_id").references(() => deliveriesTable.id, { onDelete: "set null" }),

  partnerCode: text("partner_code").notNull(),

  // DDEX MessageControlType
  // Initial / Update / Takedown — но в ERN 4.3 messageType всегда 'NewReleaseMessage',
  // а 'Initial|Update|Takedown' живут в updateIndicator. Храним оба для удобства.
  messageType: text("message_type").notNull(),         // NewReleaseMessage | PurgeReleaseMessage
  updateIndicator: text("update_indicator").notNull(), // OriginalMessage | UpdateMessage | TakedownMessage

  ernVersion: text("ern_version").notNull().default("4.3"),
  profile: text("profile").notNull(),                  // AudioSingle | AudioAlbum | Video

  xmlPayload: text("xml_payload").notNull(),
  xmlHash: text("xml_hash").notNull(),                 // sha256 hex
  xmlSizeBytes: integer("xml_size_bytes").notNull(),

  status: text("status").notNull().default("draft"),   // draft|invalid|validated|queued|sent|acked|rejected|cancelled
  validationErrors: jsonb("validation_errors").$type<Array<{ code: string; field?: string; message: string }>>(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  ackedAt: timestamp("acked_at", { withTimezone: true }),
  ackPayload: jsonb("ack_payload").$type<Record<string, unknown>>(),
  rejectionReason: text("rejection_reason"),

  // Самосылка для Update/Takedown — указывает на оригинальное сообщение по этому
  // релизу+партнёру.
  parentMessageId: integer("parent_message_id").references((): AnyPgColumn => ddexMessagesTable.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("ddex_messages_release_idx").on(t.releaseId),
  index("ddex_messages_batch_idx").on(t.batchId),
  index("ddex_messages_status_idx").on(t.status),
  index("ddex_messages_partner_idx").on(t.partnerCode),
  index("ddex_messages_thread_idx").on(t.messageThreadId),
  index("ddex_messages_type_idx").on(t.messageType, t.updateIndicator),
  index("ddex_messages_created_idx").on(t.createdAt),
]);

export const insertDdexMessageSchema = createInsertSchema(ddexMessagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type DdexMessage = typeof ddexMessagesTable.$inferSelect;
export type InsertDdexMessage = z.infer<typeof insertDdexMessageSchema>;

/**
 * Ack-журнал — каждый принятый/распарсенный ack от партнёра. Отдельная таблица,
 * потому что у одного `ddex_message` может быть несколько ack'ов (например partner
 * сначала прислал FileAccepted, потом DealAcknowledged).
 */
export const ddexAcknowledgementsTable = pgTable("ddex_acknowledgements", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => ddexMessagesTable.id, { onDelete: "cascade" }),
  batchId: integer("batch_id").references(() => ddexBatchesTable.id, { onDelete: "cascade" }),
  partnerCode: text("partner_code").notNull(),
  source: text("source").notNull(),         // webhook | sftp-poll | manual
  ackType: text("ack_type").notNull(),      // FileAccepted | FileRejected | DealAcknowledged | Custom
  status: text("status").notNull(),         // accepted | rejected | warning
  rawPayload: text("raw_payload").notNull(),
  parsed: jsonb("parsed").$type<Record<string, unknown>>(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ddex_acks_message_idx").on(t.messageId),
  index("ddex_acks_batch_idx").on(t.batchId),
  index("ddex_acks_partner_idx").on(t.partnerCode),
  index("ddex_acks_received_idx").on(t.receivedAt),
]);

export type DdexAcknowledgement = typeof ddexAcknowledgementsTable.$inferSelect;
