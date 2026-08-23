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

  // ─ анкета лейбла (ТЗ заказчика, лист «Label Registration & Onboarding») ─
  website: text("website"),
  socialMedia: text("social_media"),
  contactPerson: text("contact_person"),
  contactPosition: text("contact_position"),
  whatsapp: text("whatsapp"),
  artistCount: integer("artist_count"),
  releaseCount: integer("release_count"),
  trackCount: integer("track_count"),
  genres: text("genres"),
  currentDistributor: text("current_distributor"),
  reasonForMoving: text("reason_for_moving"),
  mainDsps: text("main_dsps"),
  territories: text("territories"),
  monthlyReleases: text("monthly_releases"),
  catalogSize: text("catalog_size"),
  hearAbout: text("hear_about"),

  // ─ служебное: чем помочь админу при разборе заявки ─
  sourceIp: text("source_ip"),
  userAgent: text("user_agent"),
  internalNote: text("internal_note"),
  infoRequest: text("info_request"),             // что админ попросил дослать
  infoRequestedAt: timestamp("info_requested_at", { withTimezone: true }),
  infoResponse: text("info_response"),           // что ответил заявитель
  infoRespondedAt: timestamp("info_responded_at", { withTimezone: true }),
  accessToken: text("access_token"),             // ссылка «дослать данные» без пароля

  // pending = новая. Дальше: under_review | info_requested | approved | rejected
  status: text("status").notNull().default("pending"),
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
  rejectionReason: true, createdUserId: true, sourceIp: true, userAgent: true,
  internalNote: true, infoRequest: true, infoRequestedAt: true,
  infoResponse: true, infoRespondedAt: true, accessToken: true,
});
export type InsertSignupRequest = z.infer<typeof insertSignupRequestSchema>;
export type SignupRequest = typeof signupRequestsTable.$inferSelect;
