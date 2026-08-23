// ─── Нарушения аккаунта ───────────────────────────────────────────────────
// Заказчик просил считать нарушением только подтверждённое: обычная внутренняя
// заметка на счётчик влиять не должна. Поэтому у записи есть статус, и в
// расчёт риска идут только строки со статусом confirmed.
//
// Три подтверждённых нарушения не блокируют аккаунт сами по себе — они лишь
// поднимают уровень риска до high, а конкретные ограничения админ выбирает
// руками (см. account_restrictions).
import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const VIOLATION_KINDS = ["copyright", "metadata", "fraud", "other"] as const;
export const VIOLATION_SEVERITIES = ["warning", "critical"] as const;
export const VIOLATION_STATUSES = ["open", "confirmed", "dismissed"] as const;

export const accountViolationsTable = pgTable("account_violations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),                 // copyright | metadata | fraud | other
  severity: text("severity").notNull().default("warning"),  // warning | critical
  status: text("status").notNull().default("open"),         // open | confirmed | dismissed
  title: text("title").notNull(),
  description: text("description"),
  caseId: text("case_id"),
  evidenceUrl: text("evidence_url"),            // ссылка на доказательство или загруженный файл
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedBy: integer("resolved_by").references(() => usersTable.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [
  index("account_violations_user_idx").on(t.userId),
  index("account_violations_status_idx").on(t.status),
]);

export type AccountViolation = typeof accountViolationsTable.$inferSelect;
