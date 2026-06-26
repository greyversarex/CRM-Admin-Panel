/**
 * Словари Broma16 (жанры, языки, типы релизов, витрины, страны).
 *
 * Синхронизируются в нашу таблицу broma16_dictionaries (кэш) при старте и
 * раз в неделю по cron. Используются для маппинга наших значений в значения
 * Broma16 при пуше релиза (тип релиза → release_type_id, страна → id и т.д.).
 */

import { db } from "@workspace/db";
import { broma16DictionariesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { createBroma16Client, type Broma16Client } from "./client";
import { Broma16ValidationError } from "./errors";

export type DictionaryType = "genre" | "language" | "release_type" | "outlet" | "country";

const DICTIONARY_SOURCES: Record<DictionaryType, { path: string; query?: Record<string, string> }> = {
  genre: { path: "/dictionaries/genres", query: { object_type: "music" } },
  language: { path: "/dictionaries/languages" },
  release_type: { path: "/dictionaries/release-types", query: { category: "audio", language: "ru" } },
  outlet: { path: "/dictionaries/outlets" },
  country: { path: "/dictionaries/country-code/" },
};

type RawItem = Record<string, unknown>;

/** Достаёт массив элементов из разных возможных форм ответа. */
function extractArray(data: unknown): RawItem[] {
  if (Array.isArray(data)) return data as RawItem[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["items", "data", "list", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as RawItem[];
    }
  }
  return [];
}

function pickString(item: RawItem, keys: string[]): string | null {
  for (const k of keys) {
    const v = item[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return null;
}

function normalizeItem(item: RawItem): { externalId: string; code: string | null; name: string } | null {
  const id = pickString(item, ["id", "value", "external_id"]);
  const code = pickString(item, ["code", "slug", "alias", "key"]);
  // Broma16 отдаёт человекочитаемые названия в title_ru/title_en/title
  // (UI русскоязычный → предпочитаем title_ru). Старый разбор брал только
  // name/title и для жанров/языков/стран ронял name в числовой id.
  const name = pickString(item, ["title_ru", "title_en", "title", "name", "label", "title_native", "value"]);
  const externalId = id ?? code;
  if (!externalId) return null;
  return { externalId, code, name: name ?? code ?? externalId };
}

/** Синхронизирует один словарь. Возвращает количество записей. */
export async function syncDictionary(type: DictionaryType, client: Broma16Client): Promise<number> {
  const src = DICTIONARY_SOURCES[type];
  const data = await client.request<unknown>("GET", src.path, { query: src.query });
  const items = extractArray(data);
  let count = 0;
  const now = new Date();
  for (const item of items) {
    const norm = normalizeItem(item);
    if (!norm) continue;
    await db
      .insert(broma16DictionariesTable)
      .values({
        type,
        externalId: norm.externalId,
        code: norm.code,
        name: norm.name,
        raw: item,
        syncedAt: now,
      })
      .onConflictDoUpdate({
        target: [broma16DictionariesTable.type, broma16DictionariesTable.externalId],
        set: {
          code: norm.code,
          name: norm.name,
          raw: item,
          syncedAt: now,
        },
      });
    count++;
  }
  logger.info({ type, count }, "[broma16] словарь синхронизирован");
  return count;
}

/** Синхронизирует все словари. Ошибка в одном не валит остальные. */
export async function syncAllDictionaries(): Promise<Record<DictionaryType, number | string>> {
  const client = await createBroma16Client();
  const result = {} as Record<DictionaryType, number | string>;
  for (const type of Object.keys(DICTIONARY_SOURCES) as DictionaryType[]) {
    try {
      result[type] = await syncDictionary(type, client);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ошибка";
      logger.error({ type, err: msg }, "[broma16] не удалось синхронизировать словарь");
      result[type] = `error: ${msg}`;
    }
  }
  return result;
}

export type DictionaryEntry = {
  externalId: string;
  code: string | null;
  name: string;
};

export async function getDictionary(type: DictionaryType): Promise<DictionaryEntry[]> {
  const rows = await db
    .select({
      externalId: broma16DictionariesTable.externalId,
      code: broma16DictionariesTable.code,
      name: broma16DictionariesTable.name,
    })
    .from(broma16DictionariesTable)
    .where(eq(broma16DictionariesTable.type, type))
    .orderBy(broma16DictionariesTable.name);
  return rows;
}

export async function dictionaryCount(type: DictionaryType): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(broma16DictionariesTable)
    .where(eq(broma16DictionariesTable.type, type));
  return row?.n ?? 0;
}

// ────────────────────────────────────────────────────────────────
// Маппинги наших значений → значения Broma16
// ────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Наш releaseType → release_type_id Broma16 (фоллбэк, если нет в словаре). */
const RELEASE_TYPE_FALLBACK: Record<string, number> = {
  single: 51,
  album: 2,
  ep: 2,
  rbt: 43,
  rt: 42,
  tiktok: 70,
};

/** Подстроки для матчинга нашего типа с названием из словаря Broma16. */
const RELEASE_TYPE_NAME_HINTS: Record<string, string[]> = {
  single: ["сингл", "single"],
  album: ["альбом", "album", "lp"],
  ep: ["ep", "мини"],
  rbt: ["rbt", "рбт"],
  rt: ["rt", "рингтон", "ringtone"],
  tiktok: ["tiktok", "тикток"],
};

export async function resolveReleaseTypeId(ourType: string | null | undefined): Promise<number> {
  const key = norm(ourType ?? "single");
  const dict = await getDictionary("release_type");
  const hints = RELEASE_TYPE_NAME_HINTS[key] ?? [key];
  const match = dict.find((d) => hints.some((h) => norm(d.name).includes(h)));
  if (match) {
    const id = Number(match.externalId);
    if (Number.isFinite(id)) return id;
  }
  return RELEASE_TYPE_FALLBACK[key] ?? RELEASE_TYPE_FALLBACK.single;
}

/** Канонизирует жанры к коду Broma16 (его ожидает API в поле genres).
 *  На вход принимает код, название или id — на выходе всегда код словаря. */
export async function resolveGenres(names: string[]): Promise<string[]> {
  const input = (names ?? []).map((n) => n.trim()).filter(Boolean);
  if (input.length === 0) return [];
  const dict = await getDictionary("genre");
  if (dict.length === 0) return Array.from(new Set(input));
  const byKey = new Map<string, string>();
  for (const d of dict) {
    const canon = d.code ?? d.name;
    if (d.code) byKey.set(norm(d.code), canon);
    byKey.set(norm(d.name), canon);
    byKey.set(norm(d.externalId), canon);
  }
  const out: string[] = [];
  for (const g of input) {
    out.push(byKey.get(norm(g)) ?? g);
  }
  return Array.from(new Set(out));
}

/** Страна записи → country_id (строго из словаря Broma16, без хардкода). */
export async function resolveCountryId(nameOrCode?: string | null): Promise<number> {
  const dict = await getDictionary("country");
  if (dict.length === 0) {
    throw new Broma16ValidationError(
      "Словарь стран Broma16 пуст — синхронизируйте словари в настройках интеграции перед отправкой релиза.",
    );
  }
  const target = norm(nameOrCode ?? "tajikistan");
  const hints = nameOrCode ? [target] : ["таджик", "tajik", "tj"];
  const match =
    dict.find((d) => d.code && norm(d.code) === target) ??
    dict.find((d) => hints.some((h) => norm(d.name).includes(h) || (d.code ? norm(d.code) === h : false)));
  if (match) {
    const id = Number(match.externalId);
    if (Number.isFinite(id)) return id;
  }
  throw new Broma16ValidationError(
    `Не удалось определить страну записи «${nameOrCode ?? "Таджикистан"}» в словаре Broma16 — проверьте словарь стран или укажите корректную страну записи трека.`,
  );
}

const LANGUAGE_NAME_HINTS: Record<string, string[]> = {
  en: ["english", "англ"],
  ru: ["russian", "русск"],
  tg: ["tajik", "таджик"],
  tj: ["tajik", "таджик"],
  uz: ["uzbek", "узбек"],
  fa: ["persian", "farsi", "перс"],
};

/** Язык трека → language_id Broma16 (по умолчанию 1). */
export async function resolveLanguageId(code?: string | null): Promise<number> {
  if (code && /^\d+$/.test(code.trim())) return Number(code.trim());
  const dict = await getDictionary("language");
  if (dict.length === 0) return 1;
  const key = norm(code ?? "en");
  // Сначала — точное совпадение по названию/коду словаря (так значение, выбранное
  // в форме прямо из словаря Broma16, маппится в его id без эвристик).
  const exact = dict.find((d) => norm(d.name) === key || (d.code ? norm(d.code) === key : false));
  if (exact) {
    const id = Number(exact.externalId);
    if (Number.isFinite(id)) return id;
  }
  const hints = LANGUAGE_NAME_HINTS[key] ?? [key];
  const match = dict.find((d) => hints.some((h) => norm(d.name).includes(h)));
  if (match) {
    const id = Number(match.externalId);
    if (Number.isFinite(id)) return id;
  }
  return 1;
}

const DEFAULT_OUTLETS = ["spotify", "apple", "yandex", "vk"];

/** Коды витрин для дистрибуции, отфильтрованные по словарю. */
export async function resolveOutletCodes(requested?: string[] | null): Promise<string[]> {
  const dict = await getDictionary("outlet");
  const wanted = (requested && requested.length > 0 ? requested : DEFAULT_OUTLETS).map(norm);
  if (dict.length === 0) {
    return Array.from(new Set(wanted));
  }
  const validByCode = new Map<string, string>();
  for (const d of dict) {
    if (d.code) validByCode.set(norm(d.code), d.code);
    validByCode.set(norm(d.name), d.code ?? d.name);
    validByCode.set(norm(d.externalId), d.code ?? d.externalId);
  }
  const out: string[] = [];
  for (const w of wanted) {
    const found = validByCode.get(w);
    if (found) out.push(found);
  }
  if (out.length > 0) return Array.from(new Set(out));
  // Ничего не совпало — отдаём все доступные коды словаря (лучше, чем пусто).
  return Array.from(new Set(dict.map((d) => d.code ?? d.externalId)));
}
