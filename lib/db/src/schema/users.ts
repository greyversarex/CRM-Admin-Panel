import { pgTable, text, serial, integer, timestamp, jsonb, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";

export type DspProfiles = {
  appleMusic?: string;
  spotify?: string;
  yandex?: string;
  youtube?: string;
};

export type SocialLinks = {
  facebook?: string;
  instagram?: string;
  youtube?: string;
  tiktok?: string;
  linkedin?: string;
  x?: string;
  telegram?: string;
  vk?: string;
};

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("artist"),
  status: text("status").notNull().default("active"),
  avatarUrl: text("avatar_url"),
  artistId: integer("artist_id").references((): AnyPgColumn => artistsTable.id, { onDelete: "set null" }),
  labelId: integer("label_id").references((): AnyPgColumn => labelsTable.id, { onDelete: "set null" }),
  // Profile fields (optional, used by /profile page)
  phone: text("phone"),
  address: text("address"),
  country: text("country"),
  region: text("region"),
  city: text("city"),
  zipCode: text("zip_code"),
  about: text("about"),
  dspProfiles: jsonb("dsp_profiles").$type<DspProfiles>().default({}).notNull(),
  socialLinks: jsonb("social_links").$type<SocialLinks>().default({}).notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  // Brute-force account lockout (P0 security task #2):
  // - failed_login_attempts is incremented on each bad-password attempt and
  //   reset to 0 on a successful login or admin password reset.
  // - locked_until is set to NOW() + 15 min once the counter hits the threshold;
  //   logins are refused with 429 until that timestamp passes.
  // Both columns are server-internal and MUST NOT be returned by /users or /auth API responses.
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  // ─── KYC / compliance (Task #6, ТЗ §4.4 + §14.12) ─────────────────────────
  // kyc_status:
  //   not_started — юзер ничего не загружал
  //   pending     — загрузил доки и нажал «Submit for review»
  //   approved    — админ одобрил (разблокирует payouts)
  //   rejected    — админ отклонил (см. документы для деталей)
  kycStatus: text("kyc_status").notNull().default("not_started"),
  kycCompletedAt: timestamp("kyc_completed_at", { withTimezone: true }),
  // ─── Bank info ─── ВАЖНО: bank_account_number/iban/swift НИКОГДА НЕ ЛОГИРУЮТСЯ
  // в audit (см. ENTITY_ALLOWLIST.profile_bank). На API-ответах для не-админов
  // account_number маскируется до "****<last4>" (см. routes/users.ts).
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankSwift: text("bank_swift"),
  bankIban: text("bank_iban"),
  bankHolderName: text("bank_holder_name"),
  bankCountry: text("bank_country"),
  // ─── Tax info ───
  taxId: text("tax_id"),                 // INN / SSN / VAT / etc
  taxCountry: text("tax_country"),       // ISO-2
  taxFormType: text("tax_form_type"),    // w8 | w9 | self_employed | individual_entrepreneur | none
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("users_role_idx").on(t.role),
  index("users_artist_idx").on(t.artistId),
  index("users_label_idx").on(t.labelId),
  index("users_kyc_status_idx").on(t.kycStatus),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  failedLoginAttempts: true,
  lockedUntil: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
