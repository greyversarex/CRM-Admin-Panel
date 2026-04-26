import { pgTable, text, serial, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// support_tickets — обращения от лейблов и артистов в службу поддержки.
//
// Жизненный цикл: open → in_progress → (waiting | resolved) → closed.
// `assigneeUserId` — менеджер/админ, которому назначено обращение.
// `lastMessageAt` обновляется при добавлении любого сообщения и используется
// для сортировки списка «свежие сверху» без LEFT JOIN на support_ticket_messages.
export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  // Человеко-читаемый идентификатор для UI (TCK-2026-0048). Уникальный, генерируется
  // на стороне сервера при создании.
  ticketRef: text("ticket_ref").notNull().unique(),

  subject: text("subject").notNull(),
  // category — свободный enum-string из набора UI: general | finance | distribution | catalog | bug | other
  category: text("category").notNull().default("general"),
  // status — open | in_progress | waiting | resolved | closed
  status: text("status").notNull().default("open"),
  // priority — low | medium | high | urgent
  priority: text("priority").notNull().default("medium"),

  // Кто открыл тикет. set null: при удалении пользователя обращение остаётся
  // в системе для compliance (но имя автора пропадает — на UI «Удалённый пользователь»).
  requesterUserId: integer("requester_user_id").references(() => usersTable.id, { onDelete: "set null" }),

  // Кому назначено (admin/manager). null = не назначено.
  assigneeUserId: integer("assignee_user_id").references(() => usersTable.id, { onDelete: "set null" }),

  // Используется для сортировки и SLA-расчётов.
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // «мои тикеты» (для customer-view)
  index("support_tickets_requester_idx").on(t.requesterUserId, t.lastMessageAt),
  // «всё назначенное X» (для inbox менеджера)
  index("support_tickets_assignee_idx").on(t.assigneeUserId, t.status),
  // фильтр по статусу/приоритету в админ-инбоксе
  index("support_tickets_status_idx").on(t.status, t.lastMessageAt),
]);

// support_ticket_messages — переписка внутри тикета.
//
// `isInternal=true` — заметка для команды (видна только admin/manager). На UI
// рендерится с другим стилем и не отправляется customer'у.
export const supportTicketMessagesTable = pgTable("support_ticket_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
  // Кто написал. set null: переписка переживает удаление автора (видим как «—»).
  authorUserId: integer("author_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // основной запрос: thread сообщений тикета по порядку
  index("support_messages_ticket_idx").on(t.ticketId, t.createdAt),
]);

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
export type InsertSupportTicket = typeof supportTicketsTable.$inferInsert;
export type SupportTicketMessage = typeof supportTicketMessagesTable.$inferSelect;
export type InsertSupportTicketMessage = typeof supportTicketMessagesTable.$inferInsert;
