// ─── Договоры на дистрибуцию ──────────────────────────────────────────────
// Договор создаётся админом на пользователя, отправляется на подпись и
// подписывается кодом из письма. Подписанный документ не переписывается:
// чтобы поменять условия, заводится новая версия, а старая остаётся в истории.
import { pgTable, text, serial, integer, timestamp, date, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const CONTRACT_STATUSES = ["draft", "sent", "signed", "expired", "terminated"] as const;

export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  contractNumber: text("contract_number").notNull(),   // человеческий номер, показываем в списке
  kind: text("kind").notNull().default("distribution"),// distribution | publishing | amendment
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  title: text("title").notNull(),
  body: text("body"),                                   // текст договора, если без файла
  objectPath: text("object_path"),                      // загруженный PDF, если есть
  originalFilename: text("original_filename"),
  effectiveDate: date("effective_date"),
  expiryDate: date("expiry_date"),
  // Подписание: одноразовый код уходит на почту, храним его хэшем не нужно —
  // код живёт минуты и обесценивается сразу после подписи.
  signOtp: text("sign_otp"),
  signOtpExpiresAt: timestamp("sign_otp_expires_at", { withTimezone: true }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signedByName: text("signed_by_name"),
  signedIp: text("signed_ip"),
  terminatedAt: timestamp("terminated_at", { withTimezone: true }),
  terminationReason: text("termination_reason"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("contracts_user_idx").on(t.userId),
  index("contracts_status_idx").on(t.status),
]);

export type Contract = typeof contractsTable.$inferSelect;
