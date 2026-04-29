import { pgTable, text, serial, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Хранилище настроек платформы в виде key→value (JSONB).
 * Ключи: "general", "security", "storage", "notifications", "currency"
 */
export const platformSettingsTable = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull().$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("platform_settings_key_idx").on(t.key),
]);

export type PlatformSetting = typeof platformSettingsTable.$inferSelect;
