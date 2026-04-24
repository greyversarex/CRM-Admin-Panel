import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// audit_log — полноценный compliance-журнал изменений: ЧТО, КЕМ, КОГДА, ОТКУДА.
// Намеренно отдельная таблица от activity_log: activity_log хранит «человеко-
// читаемые события» для дашборда (release_created, status_changed) без diff'а;
// audit_log хранит структурированный before/after для расследований и
// финансовой/правовой ответственности (§14 #1, §4.12 ТЗ).
//
// before/after — sanitized snapshot строки (без секретов, см. lib/audit.ts).
// diff       — массив { field, old, new } только для изменённых полей (для
//              быстрого визуального просмотра в UI без сравнения двух JSON'ов).
export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  // set null: записи переживают удаление пользователя — иначе теряется аудит.
  // user_email/user_role хранятся отдельно для исторической точности (роль
  // в момент действия, даже если потом её сменили).
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  userEmail: text("user_email"),
  userRole: text("user_role"),
  action: text("action").notNull(), // create | update | delete | login | approve | reject | deliver
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"), // nullable: action='login' не привязан к сущности
  before: jsonb("before"),
  after: jsonb("after"),
  diff: jsonb("diff"), // [{ field, old, new }, ...]
  ip: text("ip"),
  userAgent: text("user_agent"),
  requestId: text("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Доминантный паттерн запроса: «история изменений сущности X»
  index("audit_log_entity_idx").on(t.entityType, t.entityId, t.createdAt),
  // «что делал юзер N» (per-user audit trail)
  index("audit_log_user_idx").on(t.userId, t.createdAt),
  // «что произошло за последний час» (без фильтров)
  index("audit_log_created_idx").on(t.createdAt),
  // фильтр по типу действия в UI
  index("audit_log_action_idx").on(t.action),
]);

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
