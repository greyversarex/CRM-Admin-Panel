/**
 * Сопоставление наших жанров со справочником Broma16 (283 записи).
 *
 * Вынесено из dictionaries.ts отдельной чистой функцией: подбор жанра — та
 * часть, где легче всего незаметно ошибиться, а проверить её на живом
 * справочнике иначе нельзя.
 *
 * Что ломалось раньше: поиск брал первую запись, чьё название *содержит*
 * подсказку. Для «Tajik Pop» подсказкой было «pop», и первым по алфавиту
 * находился «Acoustic Pop»; «Tajik Folk» превращался в «Electric Folk».
 * А «Synth Pop» не находил «SynthPop» из-за одного пробела и уезжал как
 * «World» — вместе с «Hip-Hop / Rap» и «Electronic».
 */

export type GenreDictEntry = { externalId: string; code: string | null; name: string };

const lower = (s: string) => s.trim().toLowerCase();

/** Ключ без пробелов, дефисов и прочих разделителей: «Synth Pop» → «synthpop». */
const compact = (s: string) => lower(s).replace(/[^\p{Letter}\p{Number}]+/gu, "");

const canonOf = (d: GenreDictEntry) => d.code ?? d.name;

/**
 * Приставки, которые описывают происхождение, а не сам жанр. В справочнике
 * Broma16 их нет, но остаток названия обычно есть: «Tajik Pop» → «Pop».
 */
const ORIGIN_PREFIXES = [
  "tajik", "таджикская", "таджикский",
  "uzbek", "узбекская",
  "persian", "персидская",
  "iranian", "иранская",
  "afghan", "афганская",
  "central asian", "центральноазиатская",
  "russian", "русская",
  "traditional", "традиционная",
  "world",
];

/**
 * Локальные жанры Центральной Азии и Персии, которых в справочнике Broma16
 * нет вовсе. Значение — упорядоченный список названий из справочника: берём
 * первое, которое там действительно есть. Без этой таблицы шашмаком и фалак
 * уехали бы просто в «World», потеряв смысл.
 */
const REGIONAL_EQUIVALENTS: Record<string, string[]> = {
  falak: ["Folk", "World"],
  фалак: ["Folk", "World"],
  shashmaqom: ["Classical", "World", "Folk"],
  shashmakom: ["Classical", "World", "Folk"],
  shashmaqam: ["Classical", "World", "Folk"],
  шашмаком: ["Classical", "World", "Folk"],
  maqom: ["Classical", "World", "Folk"],
  maqam: ["Classical", "World", "Folk"],
  маком: ["Classical", "World", "Folk"],
  dutar: ["Folk", "World"],
  дутар: ["Folk", "World"],
  tanbur: ["Folk", "World"],
  танбур: ["Folk", "World"],
  ghazal: ["World", "Folk"],
  газель: ["World", "Folk"],
  ruboi: ["World", "Folk"],
  рубаи: ["World", "Folk"],
  national: ["National Folk", "Folk", "World"],
  народная: ["Folk", "World"],
  этно: ["Ethnic", "World"],
  ethnic: ["Ethnic", "World"],
};

/** Подстроки для поиска общего жанра «World» — последний рубеж. */
const WORLD_HINTS = ["world", "этно", "этническ", "мировая"];

/**
 * Подбирает код жанра Broma16 для нашего названия.
 * `null` — ничего не нашлось даже среди общих (словарь без «World»).
 */
export function pickGenreCanon(dict: GenreDictEntry[], rawName: string): string | null {
  const name = (rawName ?? "").trim();
  if (!name || dict.length === 0) return null;

  // Индексы: точный и без разделителей.
  const byExact = new Map<string, string>();
  const byCompact = new Map<string, string>();
  for (const d of dict) {
    const canon = canonOf(d);
    for (const key of [d.name, d.code, d.externalId]) {
      if (!key) continue;
      if (!byExact.has(lower(key))) byExact.set(lower(key), canon);
      if (!byCompact.has(compact(key))) byCompact.set(compact(key), canon);
    }
  }

  const direct = (value: string): string | null =>
    byExact.get(lower(value)) ?? byCompact.get(compact(value)) ?? null;

  // 1) Прямое совпадение, в том числе через пробел/дефис: «Synth Pop» → SynthPop.
  const exact = direct(name);
  if (exact) return exact;

  // 2) Составное название через слэш: «Hip-Hop / Rap» → Hip-Hop.
  if (name.includes("/")) {
    for (const part of name.split("/")) {
      const hit = direct(part);
      if (hit) return hit;
    }
  }

  // 3) Приставка происхождения: «Tajik Pop» → Pop, «Tajik Folk» → Folk.
  const low = lower(name);
  for (const prefix of ORIGIN_PREFIXES) {
    if (low.startsWith(`${prefix} `)) {
      const rest = name.slice(prefix.length).trim();
      const hit = rest ? direct(rest) : null;
      if (hit) return hit;
    }
  }

  // 4) Наше название — начало жанра из словаря: «Electronic» → Electronica.
  //    Берём самое длинное совпадение, чтобы не хватать случайное короткое.
  const ours = compact(name);
  const startsWithOurs = dict
    .filter((d) => compact(d.name).startsWith(ours) || (d.code ? compact(d.code).startsWith(ours) : false))
    .sort((a, b) => compact(b.name).length - compact(a.name).length);
  if (startsWithOurs.length > 0) return canonOf(startsWithOurs[0]);

  // 5) Жанр из словаря — начало нашего названия: «Dance Pop» → Dance.
  //    Здесь наоборот берём самое длинное из подходящих: «Progressive House»
  //    предпочтительнее «Progressive».
  const dictPrefix = dict
    .filter((d) => {
      const c = compact(d.name);
      return c.length >= 3 && ours.startsWith(c);
    })
    .sort((a, b) => compact(b.name).length - compact(a.name).length);
  if (dictPrefix.length > 0) return canonOf(dictPrefix[0]);

  // 6) Локальный жанр — на заранее подобранный эквивалент.
  const regional = REGIONAL_EQUIVALENTS[low] ?? REGIONAL_EQUIVALENTS[compact(name)];
  if (regional) {
    for (const candidate of regional) {
      const hit = direct(candidate);
      if (hit) return hit;
    }
  }

  // 7) Общий «World».
  for (const hint of WORLD_HINTS) {
    const hc = compact(hint);
    const exactWorld = dict.find((d) => compact(d.name) === hc);
    if (exactWorld) return canonOf(exactWorld);
  }
  for (const hint of WORLD_HINTS) {
    const hc = compact(hint);
    const partial = dict.find((d) => compact(d.name).includes(hc));
    if (partial) return canonOf(partial);
  }

  return null;
}
