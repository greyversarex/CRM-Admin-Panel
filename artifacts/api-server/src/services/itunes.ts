/**
 * Apple iTunes Search API — бесплатный, без ключей, без авторизации.
 *
 * Используем только для обогащения метаданных при импорте по UPC:
 *   - copyright (→ pLine / cLine в CRM)
 *   - обложка высокого разрешения (600×600)
 *   - жанр
 *   - дата релиза (резервный вариант)
 *
 * Документация: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
 * Эндпоинт: GET https://itunes.apple.com/lookup?upc=<UPC>&entity=album&limit=1
 *
 * Важно: iTunes Search API не возвращает composer/writer — это уровень
 * Apple Music API (MusicKit), который требует платного Developer Program.
 * Для composer/writer используем MusicBrainz Works API (отдельная задача).
 */

import { logger } from "../lib/logger";

const ITUNES_BASE_URL = "https://itunes.apple.com";

/** Поля из iTunes Search API, которые нас интересуют. */
export type ItunesAlbumResult = {
  wrapperType?: string;
  collectionType?: string;
  collectionId?: number;
  artistId?: number;
  artistName?: string;
  collectionName?: string;
  collectionCensoredName?: string;
  artworkUrl60?: string;
  artworkUrl100?: string;
  collectionPrice?: number;
  trackCount?: number;
  copyright?: string;
  country?: string;
  currency?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  collectionExplicitness?: string;
};

export type ItunesLookupResult =
  | { kind: "found"; data: ItunesAlbumResult; raw: unknown }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

/**
 * Ищет релиз по UPC в iTunes Search API.
 * Никогда не бросает — возвращает { kind: "error" } при сетевых проблемах.
 */
export async function itunesLookupByUpc(upc: string): Promise<ItunesLookupResult> {
  const url = `${ITUNES_BASE_URL}/lookup?upc=${encodeURIComponent(upc)}&entity=album&limit=5`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        "User-Agent": "TajikMusicCRM/1.0 (admin@tajikmusic.com)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e: any) {
    logger.debug({ err: e, upc }, "[itunes] network error");
    return { kind: "error", message: `network: ${e?.message ?? "timeout"}` };
  }

  if (!resp.ok) {
    logger.debug({ status: resp.status, upc }, "[itunes] non-200 response");
    return { kind: "error", message: `iTunes HTTP ${resp.status}` };
  }

  let json: { resultCount?: number; results?: ItunesAlbumResult[] };
  try {
    json = await resp.json() as { resultCount?: number; results?: ItunesAlbumResult[] };
  } catch {
    return { kind: "error", message: "JSON parse error" };
  }

  if (!json.resultCount || !json.results?.length) {
    return { kind: "not_found" };
  }

  // iTunes может вернуть несколько записей (artist + album). Берём первый
  // album-тип (collectionType === "Album"), или просто первый результат.
  const album =
    json.results.find((r) => r.wrapperType === "collection" || r.collectionId != null) ??
    json.results[0];

  if (!album) return { kind: "not_found" };

  return { kind: "found", data: album, raw: json };
}

/**
 * Конвертирует artworkUrl100 из iTunes в максимальное доступное разрешение.
 * iTunes CDN принимает произвольный размер в URL (100x100bb → 600x600bb).
 * 600px — разумный максимум для обложек в нашем CRM.
 */
export function itunesHighResCover(artworkUrl100: string | undefined | null): string | null {
  if (!artworkUrl100) return null;
  // Заменяем NxNbb (где N — любые цифры) на 600x600bb
  return artworkUrl100.replace(/\d+x\d+bb\./, "600x600bb.");
}

/**
 * Извлекает pLine/cLine из поля copyright iTunes.
 *
 * iTunes возвращает единое поле `copyright`, например:
 *   "℗ 2024 Tajik Sounds Records"
 *   "© & ℗ 2024 Tajik Sounds Records"
 *
 * Мы используем его и как pLine, и как cLine — разделить невозможно без
 * дополнительного источника, но для CRM и Broma16 это приемлемо.
 */
export function parseItunesCopyright(copyright: string | undefined | null): {
  pLine: string | null;
  cLine: string | null;
} {
  if (!copyright?.trim()) return { pLine: null, cLine: null };
  const cleaned = copyright.trim();
  // Если строка содержит ℗ — это phonographic copyright (pLine)
  const hasP = cleaned.includes("℗") || cleaned.toLowerCase().startsWith("p ");
  // Если содержит © — это copyright (cLine)
  const hasC = cleaned.includes("©") || cleaned.toLowerCase().startsWith("c ");
  if (!hasP && !hasC) {
    // Маркеров нет — считаем pLine (для музыкальных релизов ℗ вероятнее),
    // cLine берём ту же строку (один источник, разделить невозможно).
    return { pLine: cleaned, cLine: cleaned };
  }
  if (hasP && !hasC) {
    // Только ℗ — используем одну строку для обоих полей.
    return { pLine: cleaned, cLine: cleaned };
  }
  return {
    pLine: hasP ? cleaned : null,
    cLine: hasC ? cleaned : null,
  };
}
