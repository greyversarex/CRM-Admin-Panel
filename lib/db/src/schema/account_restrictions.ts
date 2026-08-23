// ─── Ограничения доступа аккаунта ─────────────────────────────────────────
// Одна строка = одно ограничение на одну функцию у одного пользователя.
// Строки не удаляются: снятие ограничения проставляет lifted_at, поэтому
// история «кто, когда и почему закрыл выплаты» остаётся в таблице.
//
// Отсутствие активной строки означает «функция разрешена» — так по умолчанию
// у всех всё включено и не нужно заводить запись при создании пользователя.
import { pgTable, text, serial, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

/** Ключи функций, доступ к которым админ закрывает по отдельности. */
export const RESTRICTION_FEATURES = [
  // площадки
  "dsp:spotify", "dsp:apple", "dsp:youtube", "dsp:tiktok", "dsp:meta",
  "dsp:amazon", "dsp:deezer", "dsp:tidal", "dsp:other",
  // права и Content ID
  "rights:youtube_cid", "rights:meta_rights", "rights:tiktok_rights",
  // дистрибуция
  "dist:upload", "dist:delivery", "dist:takedown", "dist:transfer", "dist:publishing",
  // деньги
  "fin:revenue", "fin:royalties", "fin:revenue_distribution",
  "fin:payout_requests", "fin:payouts",
  // аккаунт целиком
  "account:full_suspension",
] as const;

export type RestrictionFeature = (typeof RESTRICTION_FEATURES)[number];

export const accountRestrictionsTable = pgTable("account_restrictions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),          // один из RESTRICTION_FEATURES
  reason: text("reason").notNull(),            // обязательна: «Copyright dispute» и т.п.
  caseId: text("case_id"),                     // номер разбирательства, если есть
  note: text("note"),                          // внутренний комментарий
  expiresAt: timestamp("expires_at", { withTimezone: true }),  // срок, если ограничение временное
  appliedBy: integer("applied_by").references(() => usersTable.id, { onDelete: "set null" }),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  liftedBy: integer("lifted_by").references(() => usersTable.id, { onDelete: "set null" }),
  liftedAt: timestamp("lifted_at", { withTimezone: true }),     // null = ограничение действует
}, (t) => [
  index("account_restrictions_user_idx").on(t.userId),
  // Одновременно действовать может только одно ограничение на функцию.
  // Снятые (lifted_at не null) под уникальность не попадают — их может быть много.
  uniqueIndex("account_restrictions_active_idx").on(t.userId, t.feature).where(sql`lifted_at IS NULL`),
]);

export type AccountRestriction = typeof accountRestrictionsTable.$inferSelect;
