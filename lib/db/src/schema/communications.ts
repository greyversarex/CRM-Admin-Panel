import { pgTable, text, serial, integer, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── Email / Push шаблоны ─────────────────────────────────────────────────────

export const emailTemplatesTable = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  // Человеко-читаемый код для ссылки из триггеров (unique)
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  // email | push
  type: text("type").notNull().default("email"),
  // Категория для группировки в UI
  category: text("category").notNull().default("general"),
  subject: text("subject").notNull().default(""),
  bodyHtml: text("body_html").notNull().default(""),
  bodyText: text("body_text").notNull().default(""),
  // Список переменных-плейсхолдеров, напр. ["{{ user_name }}", "{{ release_title }}"]
  variables: jsonb("variables").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("email_templates_type_idx").on(t.type, t.category),
]);

export type EmailTemplate = typeof emailTemplatesTable.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplatesTable.$inferInsert;

// ── Рассылки (Campaigns) ─────────────────────────────────────────────────────

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // email | push
  type: text("type").notNull().default("email"),
  // draft | scheduled | sending | sent | failed | cancelled
  status: text("status").notNull().default("draft"),
  templateId: integer("template_id").references(() => emailTemplatesTable.id, { onDelete: "set null" }),
  // Кастомный subject (если переопределяет шаблон)
  subject: text("subject"),
  // Фильтр аудитории, напр. {"roles": ["artist","label"], "labelId": 5}
  audienceFilter: jsonb("audience_filter").$type<Record<string, unknown>>().notNull().default({}),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  recipientCount: integer("recipient_count").notNull().default(0),
  openCount: integer("open_count").notNull().default(0),
  // Список ошибок отправки
  errors: jsonb("errors").$type<string[]>().notNull().default([]),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("campaigns_status_idx").on(t.status, t.createdAt),
]);

export type Campaign = typeof campaignsTable.$inferSelect;
export type InsertCampaign = typeof campaignsTable.$inferInsert;

// ── Automation Triggers ──────────────────────────────────────────────────────

// Поддерживаемые события
// signup | release_uploaded | release_approved | release_rejected |
// payout_sent | kyc_approved | kyc_rejected | delivery_sent | delivery_acked

export const automationTriggersTable = pgTable("automation_triggers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Системное событие, которое запускает триггер
  event: text("event").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  // Ссылка на шаблон письма/пуша
  templateId: integer("template_id").references(() => emailTemplatesTable.id, { onDelete: "set null" }),
  // Задержка отправки в минутах (0 = сразу)
  delayMinutes: integer("delay_minutes").notNull().default(0),
  // Кому отправлять: "requester" | "assignee" | "admins" | "all" | "specific_role"
  recipient: text("recipient").notNull().default("requester"),
  // Последнее срабатывание
  lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
  fireCount: integer("fire_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("automation_triggers_event_idx").on(t.event, t.enabled),
]);

export type AutomationTrigger = typeof automationTriggersTable.$inferSelect;
export type InsertAutomationTrigger = typeof automationTriggersTable.$inferInsert;

// ── Internal Notes ───────────────────────────────────────────────────────────

// Внутренние заметки команды, прикреплённые к любой сущности
// (release, artist, label, user, support_ticket)

export const internalNotesTable = pgTable("internal_notes", {
  id: serial("id").primaryKey(),
  // Тип сущности, к которой привязана заметка
  entityType: text("entity_type").notNull(), // "release" | "artist" | "label" | "user" | "ticket"
  entityId: integer("entity_id").notNull(),
  body: text("body").notNull(),
  // Прикреплённые теги/метки
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  pinned: boolean("pinned").notNull().default(false),
  authorUserId: integer("author_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  // Последнее редактирование (null = не редактировалась)
  editedAt: timestamp("edited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("internal_notes_entity_idx").on(t.entityType, t.entityId, t.createdAt),
  index("internal_notes_author_idx").on(t.authorUserId),
]);

export type InternalNote = typeof internalNotesTable.$inferSelect;
export type InsertInternalNote = typeof internalNotesTable.$inferInsert;
