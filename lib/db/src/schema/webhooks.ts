import { pgTable, text, serial, timestamp, boolean, integer, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Webhook-подписки — URL'ы куда шлём события платформы.
 * События: release.status_changed, payment.completed, delivery.acked, kyc.approved, …
 */
export const webhooksTable = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  // Подписной секрет в открытом виде — нужен для HMAC-подписи каждого исходящего
  // запроса (X-Tajik-Signature: sha256=<hmac(secret, body)>). Получатель должен
  // знать тот же секрет для верификации. Никогда не возвращается через API,
  // только флаг `hasSecret` в DTO. Доступ к таблице — admin-only.
  secret: text("secret"),
  events: jsonb("events").$type<string[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  lastStatus: integer("last_status"),            // HTTP статус последнего вызова (200/404/500…)
  lastError: text("last_error"),
  retryCount: integer("retry_count").notNull().default(3),
  timeoutMs: integer("timeout_ms").notNull().default(5000),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("webhooks_enabled_idx").on(t.enabled),
  index("webhooks_created_idx").on(t.createdAt),
]);

export type Webhook = typeof webhooksTable.$inferSelect;
