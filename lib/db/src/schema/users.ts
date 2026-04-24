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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("users_role_idx").on(t.role),
  index("users_artist_idx").on(t.artistId),
  index("users_label_idx").on(t.labelId),
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
