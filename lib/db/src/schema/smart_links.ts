import { pgTable, text, serial, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { artistsTable } from "./artists";
import { labelsTable } from "./labels";
import { releasesTable } from "./releases";
import { usersTable } from "./users";

/**
 * Площадка на странице смартлинка.
 *
 * `name` — ключ витрины (`spotify`, `apple_music`, …) либо произвольная строка
 * для площадки, которой нет в справочнике. `action` решает подпись кнопки:
 * стриминг слушают, магазин — покупают. Порядок в массиве = порядок на странице.
 */
export type SmartLinkDsp = {
  name: string;
  url: string;
  active: boolean;
  /** `listen` (по умолчанию) | `buy` — для iTunes и прочих магазинов. */
  action?: "listen" | "buy";
};

/** Ссылка на соцсеть артиста — показывается отдельным блоком, если включено. */
export type SmartLinkSocial = { name: string; url: string };

export const smartLinksTable = pgTable("smart_links", {
  id:          serial("id").primaryKey(),
  title:       text("title").notNull(),
  artistName:  text("artist_name").notNull(),
  slug:        text("slug").notNull().unique(),
  clicks:      integer("clicks").notNull().default(0),
  topPlatform: text("top_platform"),
  dsps:        jsonb("dsps").notNull().default([]).$type<SmartLinkDsp[]>(),

  /**
   * Релиз, из которого собран смартлинк. Ссылка живёт и после удаления релиза
   * (`set null`) — она уже разошлась по соцсетям, ломать её нельзя.
   */
  releaseId:   integer("release_id").references(() => releasesTable.id, { onDelete: "set null" }),
  /** Обложка на момент создания — копия, чтобы страница не зависела от правок релиза. */
  coverUrl:    text("cover_url"),
  /** Дата релиза для списка смартлинков (в справочном виде, как её показывает CRM). */
  releaseDate: text("release_date"),

  /** Оформление публичной страницы: `light` | `dark`. */
  theme:       text("theme").notNull().default("light"),
  socialsEnabled: boolean("socials_enabled").notNull().default(false),
  socials:     jsonb("socials").notNull().default([]).$type<SmartLinkSocial[]>(),

  /** Выключенная ссылка отдаёт 404 — быстрый способ снять страницу с публикации. */
  isActive:    boolean("is_active").notNull().default(true),
  /** Открытий страницы — вместе с `clicks` даёт конверсию в переход на витрину. */
  views:       integer("views").notNull().default(0),
  /** Переходы в разрезе площадок: `{ spotify: 12, deezer: 3 }`. */
  clicksByDsp: jsonb("clicks_by_dsp").notNull().default({}).$type<Record<string, number>>(),

  artistId:    integer("artist_id").references(() => artistsTable.id, { onDelete: "set null" }),
  labelId:     integer("label_id").references(() => labelsTable.id,  { onDelete: "set null" }),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("smart_links_label_idx").on(t.labelId),
  index("smart_links_artist_idx").on(t.artistId),
  index("smart_links_release_idx").on(t.releaseId),
]);

export type SmartLink = typeof smartLinksTable.$inferSelect;
