import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { releasesTable } from "./releases";

export const deliveriesTable = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  // cascade: delivery — попытка доставить конкретный релиз; без него запись бессмысленна
  releaseId: integer("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
  target: text("target").notNull(),
  status: text("status").notNull().default("pending"),
  ddexVersion: text("ddex_version").default("4.0"),
  packageUrl: text("package_url"),
  errorMessage: text("error_message"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("deliveries_release_idx").on(t.releaseId),
  index("deliveries_status_idx").on(t.status),
  index("deliveries_target_idx").on(t.target),
]);

export const insertDeliverySchema = createInsertSchema(deliveriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDelivery = z.infer<typeof insertDeliverySchema>;
export type Delivery = typeof deliveriesTable.$inferSelect;
