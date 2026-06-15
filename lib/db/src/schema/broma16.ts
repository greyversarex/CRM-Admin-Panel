import { pgTable, text, serial, integer, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releasesTable } from "./releases";
import { usersTable } from "./users";

/**
 * Кэш словарей Broma16 (ROD API). Синхронизируется при старте сервера и
 * раз в неделю по cron. Используется для маппинга наших значений в id Broma16:
 *   - genres        — жанры (object_type=music)
 *   - release_types — типы релизов (Сингл=51, Альбом=2, EP, RBT=43, …)
 *   - outlets       — витрины/площадки (spotify, apple, yandex, vk, …)
 *   - languages     — языки (id + название)
 *   - countries     — страны (id + ISO-код); нужен created_country_id (Таджикистан)
 */
export const broma16DictionariesTable = pgTable("broma16_dictionaries", {
  id: serial("id").primaryKey(),
  /** genres | release_types | outlets | languages | countries */
  type: text("type").notNull(),
  /** Идентификатор записи в Broma16 (число или код, хранится строкой). */
  externalId: text("external_id").notNull(),
  /** Машинный код, где применимо (outlet-код, ISO-код страны/языка). */
  code: text("code"),
  /** Человекочитаемое название. */
  name: text("name").notNull(),
  /** Полный сырой объект из ответа Broma16 (на случай доп. полей при маппинге). */
  raw: jsonb("raw").$type<Record<string, unknown>>(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("broma16_dict_type_extid_uniq").on(t.type, t.externalId),
  index("broma16_dict_type_idx").on(t.type),
]);

/**
 * Очередь задач пуша релиза в Broma16. Обрабатывается фоновым воркером
 * (по образцу deliveries): claim → 9-шаговый flow → success | failed (retry).
 *
 * Идемпотентность обеспечивается тем, что broma16_release_id / broma16_recording_id
 * сохраняются прямо в releases/tracks, а `step` фиксирует самый дальний пройденный
 * шаг — при повторе воркер продолжает с него, а не создаёт сущности заново.
 */
export const broma16PushJobsTable = pgTable("broma16_push_jobs", {
  id: serial("id").primaryKey(),
  releaseId: integer("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
  /** queued | processing | success | failed */
  status: text("status").notNull().default("queued"),
  /**
   * Самый дальний успешно пройденный шаг flow:
   * artist → create_release → upload_tracks → track_metadata → composition →
   * lyrics → cover → distribution → moderate → done
   */
  step: text("step").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  /** Прогресс/диагностика: { recordingIds, contributorIds, outlets, … }. */
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  /** Кто инициировал пуш (для аудита). NULL = системный/cron. */
  requestedBy: integer("requested_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("broma16_push_jobs_release_idx").on(t.releaseId),
  index("broma16_push_jobs_status_idx").on(t.status),
]);

export const insertBroma16DictionarySchema = createInsertSchema(broma16DictionariesTable).omit({ id: true, syncedAt: true });
export type InsertBroma16Dictionary = z.infer<typeof insertBroma16DictionarySchema>;
export type Broma16Dictionary = typeof broma16DictionariesTable.$inferSelect;

export const insertBroma16PushJobSchema = createInsertSchema(broma16PushJobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBroma16PushJob = z.infer<typeof insertBroma16PushJobSchema>;
export type Broma16PushJob = typeof broma16PushJobsTable.$inferSelect;
