import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Публичные заявки на регистрацию. Юзер заполняет форму без auth, админ
// одобряет вручную → создаётся User + (Artist|Label). До одобрения — никаких
// привилегированных операций (нет аккаунта).
//
// email НЕ unique — после rejection пользователь может подать ещё раз.
// Идемпотентность по email+status='pending' проверяется в route-handler-е.
export const signupRequestsTable = pgTable("signup_requests", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),     // 'artist' | 'label'
  name: text("name").notNull(),                  // отображаемое имя артиста/лейбла
  email: text("email").notNull(),
  phone: text("phone"),
  country: text("country"),                      // ISO-2
  legalName: text("legal_name"),                 // для лейблов / ИП
  inn: text("inn"),                              // налоговый номер (TJ/RU/UZ форматы)
  message: text("message"),                      // свободное «о себе»
  status: text("status").notNull().default("pending"),  // pending | approved | rejected
  // set null: ревьюера могут удалить, но история заявок сохраняется
  reviewedBy: integer("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  // ID созданного пользователя после approve (set null если юзера удалят)
  createdUserId: integer("created_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("signup_requests_status_idx").on(t.status),
  index("signup_requests_email_idx").on(t.email),
  index("signup_requests_created_idx").on(t.createdAt),
]);

export const insertSignupRequestSchema = createInsertSchema(signupRequestsTable).omit({
  id: true, createdAt: true, status: true, reviewedBy: true, reviewedAt: true,
  rejectionReason: true, createdUserId: true,
});
export type InsertSignupRequest = z.infer<typeof insertSignupRequestSchema>;
export type SignupRequest = typeof signupRequestsTable.$inferSelect;
