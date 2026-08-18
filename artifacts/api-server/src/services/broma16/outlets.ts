/**
 * Витрины дистрибуции Broma16 — чистая часть, без обращений к базе.
 *
 * Вынесено отдельно от dictionaries.ts, потому что тот тянет подключение к БД
 * и модуль нельзя проверить тестами.
 */

const norm = (s: string) => String(s).trim().toLowerCase();

export type OutletDictEntry = { externalId: string; code: string | null; name: string };

/**
 * Витрины, которым нужен отдельный тип релиза (RBT / RT / TikTok), а не обычный
 * сингл или альбом. Broma16 отвечает на них «an incorrect release distribution
 * identifier», и релиз целиком остаётся черновиком.
 *
 * Проверено на релизе #48 «Ochai Khushruyum»: из 39 выбранных витрин Broma16
 * отвергла ровно эти шесть. Поэтому в её каталоге каждый релиз задвоен —
 * основная поставка и отдельная для рингтонов.
 */
export const OUTLETS_REQUIRING_OWN_RELEASE_TYPE: Record<string, string> = {
  "1216":   "Beeline Privet, Kiyvstar D-Jingle, Tele2 Gudok",
  "49856":  "Goodok MTS",
  "2588":   "Megafon Gudok",
  "510125": "TikTok",
  "-2":     "Kyivstar Music Club",
  "-1":     "TCell Streaming Tajikistan",
};

/** Требует ли витрина отдельного типа релиза. */
export function outletNeedsOwnReleaseType(id: string): boolean {
  return id in OUTLETS_REQUIRING_OWN_RELEASE_TYPE;
}

/** Название витрины, требующей отдельного типа релиза. */
export function restrictedOutletName(id: string): string | null {
  return OUTLETS_REQUIRING_OWN_RELEASE_TYPE[id] ?? null;
}

/**
 * Сопоставляет выбранные витрины со словарём.
 *
 * Ключом может быть название, код или id; наружу всегда уходит externalId.
 * У витрин Broma16 поле `code` пустое, и прежняя реализация на совпадении по
 * названию отдавала само название — то есть в запрос уходило «Spotify»
 * вместо 6140.
 */
export function pickOutletIds(
  dict: OutletDictEntry[],
  wanted: string[],
  opts: { keepRestricted?: boolean } = {},
): string[] {
  const idByKey = new Map<string, string>();
  for (const d of dict) {
    const id = String(d.externalId);
    if (d.code) idByKey.set(norm(d.code), id);
    idByKey.set(norm(d.name), id);
    idByKey.set(norm(d.externalId), id);
  }
  const out: string[] = [];
  for (const w of wanted.map(norm)) {
    const found = idByKey.get(w);
    if (found) out.push(found);
  }
  const unique = Array.from(new Set(out));
  return opts.keepRestricted ? unique : unique.filter((id) => !outletNeedsOwnReleaseType(id));
}
