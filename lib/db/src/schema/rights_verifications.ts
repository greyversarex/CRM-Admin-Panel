// ─── Проверка прав на каталог ─────────────────────────────────────────────
// Отдельный шаг после KYC: лейбл подтверждает, что владеет правами и вправе
// отдавать музыку на площадки. Одна строка на пользователя — переподача
// перезаписывает ту же запись и возвращает её в статус pending.
import { pgTable, text, serial, integer, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const RIGHTS_VERIFICATION_STATUSES = ["pending", "verified", "rejected", "info_requested"] as const;

export const rightsVerificationsTable = pgTable("rights_verifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ownsRights: boolean("owns_rights").notNull().default(false),
  authorizedToDistribute: boolean("authorized_to_distribute").notNull().default(false),
  acceptsCopyrightResponsibility: boolean("accepts_copyright_responsibility").notNull().default(false),
  territories: text("territories"),              // «весь мир» либо перечисление стран
  distributionRights: text("distribution_rights"),
  documentPath: text("document_path"),           // подтверждающий документ, если приложен
  documentFilename: text("document_filename"),
  status: text("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),               // причина отказа или запрос данных
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("rights_verifications_user_idx").on(t.userId),
  index("rights_verifications_status_idx").on(t.status),
]);

export type RightsVerification = typeof rightsVerificationsTable.$inferSelect;
