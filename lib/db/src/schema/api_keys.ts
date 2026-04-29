import { pgTable, text, serial, integer, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * API-ключи для внешних интеграций и автоматизации.
 * Секретная часть хранится только как bcrypt-хеш; raw key показывается однократно при создании.
 */
export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),       // первые 8 символов (tjm_xxxx) — для отображения
  keyHash: text("key_hash").notNull(),            // sha256 hex полного ключа
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),  // ["read:releases","write:royalties",…]
  enabled: boolean("enabled").notNull().default(true),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("api_keys_prefix_idx").on(t.keyPrefix),
  index("api_keys_hash_idx").on(t.keyHash),
  index("api_keys_enabled_idx").on(t.enabled),
]);

export type ApiKey = typeof apiKeysTable.$inferSelect;
