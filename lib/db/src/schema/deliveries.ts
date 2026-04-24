import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releasesTable } from "./releases";

// Delivery jobs queue. Каждая строка = одна попытка отгрузки одного релиза на
// один таргет (Spotify / Apple / DDEX-партнёр). Воркер забирает status='queued'
// (или 'failed' с истёкшим nextRetryAt и attempts<5) и пытается доставить.
export const deliveriesTable = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  // cascade: delivery — попытка доставить конкретный релиз; без него запись бессмысленна
  releaseId: integer("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
  target: text("target").notNull(),
  // queued | processing | sent | delivered | failed | cancelled
  // queued     — в очереди, воркер заберёт на следующем тике
  // processing — воркер взял (защита от двойной обработки)
  // sent       — XML/файлы отправлены, ждём ack от партнёра
  // delivered  — партнёр подтвердил приём (DSR / webhook)
  // failed     — последняя попытка завершилась ошибкой; повторим если attempts<5
  // cancelled  — оператор отменил вручную
  status: text("status").notNull().default("queued"),
  ddexVersion: text("ddex_version").default("4.3"),
  // Доп-поля для очереди (Task #4)
  attempts: integer("attempts").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  lastError: text("last_error"),
  xmlPayload: text("xml_payload"), // сгенерированный ERN-XML для дебага и retry
  packageUrl: text("package_url"),
  // legacy alias оставляем — сейчас выставляется при ack партнёра
  errorMessage: text("error_message"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("deliveries_release_idx").on(t.releaseId),
  index("deliveries_status_idx").on(t.status),
  index("deliveries_target_idx").on(t.target),
  // Hot path воркера: WHERE status IN ('queued','failed') AND next_retry_at<=now ORDER BY next_retry_at
  index("deliveries_queue_idx").on(t.status, t.nextRetryAt),
]);

export const insertDeliverySchema = createInsertSchema(deliveriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDelivery = z.infer<typeof insertDeliverySchema>;
export type Delivery = typeof deliveriesTable.$inferSelect;
