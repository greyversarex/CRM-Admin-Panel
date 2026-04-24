import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Документы KYC, загруженные пользователем. Файл лежит в object-storage
// (storageKey + objectPath), метаданные — здесь. Админ ревьюит каждый документ
// отдельно; глобальный kyc_status юзера обновляется отдельным action'ом.
//
// CASCADE на user_id: если юзера удалили — документы тоже не нужны.
// SET NULL на reviewed_by: ревьюера могут удалить, но история сохраняется.
export const kycDocumentsTable = pgTable("kyc_documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),  // passport | id_card | company_reg | tax_certificate | bank_statement | other
  storageKey: text("storage_key").notNull(),       // ключ в object storage (без префикса /objects/)
  objectPath: text("object_path").notNull(),       // полный путь /objects/uploads/xxx — отдаём в API
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  status: text("status").notNull().default("pending"),  // pending | approved | rejected
  reviewedBy: integer("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("kyc_documents_user_idx").on(t.userId),
  index("kyc_documents_status_idx").on(t.status),
  index("kyc_documents_uploaded_idx").on(t.uploadedAt),
]);

export const insertKycDocumentSchema = createInsertSchema(kycDocumentsTable).omit({
  id: true, uploadedAt: true, status: true, reviewedBy: true, reviewedAt: true, rejectionReason: true,
});
export type InsertKycDocument = z.infer<typeof insertKycDocumentSchema>;
export type KycDocument = typeof kycDocumentsTable.$inferSelect;
