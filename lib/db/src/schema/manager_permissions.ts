import { pgTable, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Гранулярные права для роли `manager` — админ из Settings включает/выключает
 * доступ менеджера к каждому крупному функционалу платформы.
 *
 * Ключи (фиксированный enum, синхронизирован с frontend permissions.ts):
 *   catalog            — Каталог (релизы, артисты, лейблы, видео, дубликаты, коды, bulk)
 *   distribution       — Дистрибуция (модерация, deliveries, конфликты, ACR, DSP-конфиги)
 *   finance            — Финансы (импорты, роялти, splits, выплаты — кроме L2 approve)
 *   analytics          — Аналитика музыки + UGC
 *   crm                — CRM-аналитика (Overview, ARPU, Funnel и т.п.)
 *   users_kyc          — Юзеры, регистрации, KYC-очередь
 *   rights             — Права и издательство (declarations, конфликты, CWR)
 *   support_comms      — Поддержка и коммуникации (тикеты, каналы, шаблоны, кампании)
 *   automation_audit   — Автоматизация и аудит-лог (fraud rules, payment automation, webhooks)
 *
 * НЕ управляется (всегда у менеджера):
 *   dashboard, profile, settings (личные)
 * НИКОГДА не доступно менеджеру (только админу):
 *   settings_system, payouts L2 approve, manager_permissions editor
 */
export const managerPermissionsTable = pgTable("manager_permissions", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  updatedBy: integer("updated_by").references(() => usersTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("manager_permissions_enabled_idx").on(t.enabled),
]);

export type ManagerPermission = typeof managerPermissionsTable.$inferSelect;

/** Канонический список ключей. Используется и сидером, и UI. */
export const MANAGER_PERMISSION_KEYS = [
  "catalog",
  "distribution",
  "finance",
  "analytics",
  "crm",
  "users_kyc",
  "rights",
  "support_comms",
  "automation_audit",
] as const;

export type ManagerPermissionKey = typeof MANAGER_PERMISSION_KEYS[number];
