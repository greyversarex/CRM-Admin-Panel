import { pgTable, text, serial, integer, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Реестр интеграций со внешними площадками (DSP / Video / Social / DDEX / Analytics).
 * Запись = одна площадка (Spotify, VK Music, и т.д.).
 */
export const integrationsTable = pgTable("integrations", {
  id: serial("id").primaryKey(),
  // Уникальный код интеграции, совпадает с id во фронтовом списке (spotify, vk_music, ...)
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(), // dsp | video | social | delivery | analytics
  authType: text("auth_type").notNull(), // oauth2 | api_key | sftp | none
  enabled: boolean("enabled").notNull().default(false),
  status: text("status").notNull().default("disconnected"), // disconnected|connected|pending|error
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  // Произвольный JSON с настройками (sync interval, флаги и т.д.) — НЕ для секретов
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  codeIdx: index("integrations_code_idx").on(t.code),
}));

/**
 * Зашифрованные учётные данные (API ключи, OAuth токены, SFTP пароли).
 * Шифрование AES-256-GCM, ключ из env INTEGRATIONS_ENCRYPTION_KEY.
 * Поле `cipher_text` содержит base64(iv||authTag||ciphertext).
 */
export const integrationCredentialsTable = pgTable("integration_credentials", {
  id: serial("id").primaryKey(),
  integrationId: integer("integration_id").notNull().references(() => integrationsTable.id, { onDelete: "cascade" }),
  // Какое поле — например "client_secret", "api_key", "access_token", "refresh_token", "password"
  fieldKey: text("field_key").notNull(),
  cipherText: text("cipher_text").notNull(),
  // Для OAuth токенов — когда истекает access_token
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  integrationIdx: index("creds_integration_idx").on(t.integrationId),
}));

/**
 * Журнал синхронизаций — каждый раз когда коннектор отрабатывает,
 * создаётся запись с результатом.
 */
export const integrationSyncJobsTable = pgTable("integration_sync_jobs", {
  id: serial("id").primaryKey(),
  integrationId: integer("integration_id").notNull().references(() => integrationsTable.id, { onDelete: "cascade" }),
  jobType: text("job_type").notNull(), // test | sync_stats | deliver_release | refresh_token
  status: text("status").notNull(), // running | success | error
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  // Краткий результат (например количество синхронизированных строк, ID отправленного релиза)
  result: jsonb("result").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
}, (t) => ({
  integrationIdx: index("sync_jobs_integration_idx").on(t.integrationId),
  startedIdx: index("sync_jobs_started_idx").on(t.startedAt),
}));

export const insertIntegrationSchema = createInsertSchema(integrationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type Integration = typeof integrationsTable.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;

export type IntegrationCredential = typeof integrationCredentialsTable.$inferSelect;
export type IntegrationSyncJob = typeof integrationSyncJobsTable.$inferSelect;
