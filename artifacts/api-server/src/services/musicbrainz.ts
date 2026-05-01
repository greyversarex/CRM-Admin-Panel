/**
 * MusicBrainz ISRC validator — второй движок защиты от выпуска чужого
 * контента под своим ISRC.
 *
 * MusicBrainz — крупнейшая открытая база метаданных звукозаписей (поддержано
 * BBC, Last.fm, MetaBrainz Foundation). API публичный, не требует авторизации,
 * но просит соблюдать rate-limit (1 запрос/сек) и присылать User-Agent с
 * контактом приложения.
 *
 * Что делаем: для каждого ISRC трека спрашиваем у MusicBrainz, какие
 * recordings зарегистрированы под этим ISRC. Если оттуда возвращается артист,
 * НЕ совпадающий с нашим — это сигнал, что либо у нас опечатка в ISRC, либо
 * кто-то пытается выпустить чужой трек под существующим кодом.
 *
 * Документация: https://musicbrainz.org/doc/MusicBrainz_API
 *   GET /ws/2/recording/?query=isrc:XXXXXXXXXXXX&fmt=json
 *
 * Этический и юридический момент: MusicBrainz просит User-Agent в формате
 * "AppName/Version (contact-url-or-email)". Без него они начнут банить.
 */

import { logger } from "../lib/logger";

const MB_BASE_URL = "https://musicbrainz.org/ws/2";
const MB_USER_AGENT =
  process.env.MUSICBRAINZ_USER_AGENT ||
  "TajikMusicCRM/1.0 (admin@tajikmusic.com)";

/** Rate-limit: MB просит максимум 1 RPS. Между запросами ставим 1100ms. */
const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  return fetch(url, {
    headers: {
      "User-Agent": MB_USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * Один recording из MusicBrainz, упрощённый до полей, которые нам нужны.
 */
export type MbRecording = {
  id: string;
  title: string;
  /** Imploded display name (artist credit). */
  artistName: string;
  /** ISO дата первого релиза (если известна). */
  firstReleaseDate?: string;
  /** Score 0-100 — насколько MB уверен, что это релевантный матч. */
  score: number;
};

export type MbIsrcLookupResult =
  | {
      kind: "found";
      isrc: string;
      recordings: MbRecording[];
    }
  | {
      kind: "not_found";
      isrc: string;
    }
  | {
      kind: "error";
      isrc: string;
      message: string;
    };

/**
 * Валидирует формат ISRC: 2 буквы страны, 3 буквы/цифры регистранта,
 * 2 цифры года, 5 цифр серийника. Дефисы ок, регистр не важен.
 * Пример: TJ-A1B-25-00001 или TJA1B2500001.
 */
export function normalizeIsrc(raw: string): string | null {
  const compact = raw.replace(/[-\s]/g, "").toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(compact)) return null;
  return compact;
}

/**
 * Запрашивает MusicBrainz: какие recordings числятся под этим ISRC?
 * Возвращает список с метаданными (артист, название, дата релиза).
 */
export async function lookupIsrc(isrc: string): Promise<MbIsrcLookupResult> {
  const normalized = normalizeIsrc(isrc);
  if (!normalized) {
    return { kind: "error", isrc, message: "invalid_isrc_format" };
  }

  const url = `${MB_BASE_URL}/recording/?query=isrc:${normalized}&fmt=json&limit=10`;
  let resp: Response;
  try {
    resp = await rateLimitedFetch(url);
  } catch (e) {
    logger.warn({ err: e, isrc: normalized }, "[musicbrainz] network error");
    return { kind: "error", isrc: normalized, message: `network: ${(e as Error).message}` };
  }

  if (resp.status === 404) {
    return { kind: "not_found", isrc: normalized };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return {
      kind: "error",
      isrc: normalized,
      message: `MusicBrainz HTTP ${resp.status}: ${body.slice(0, 200)}`,
    };
  }

  let json: {
    recordings?: Array<{
      id?: string;
      title?: string;
      score?: number;
      "first-release-date"?: string;
      "artist-credit"?: Array<{ name?: string; artist?: { name?: string } }>;
    }>;
  };
  try {
    json = (await resp.json()) as typeof json;
  } catch (e) {
    return { kind: "error", isrc: normalized, message: `bad_json: ${(e as Error).message}` };
  }

  const rawRecordings = json.recordings ?? [];
  if (rawRecordings.length === 0) {
    return { kind: "not_found", isrc: normalized };
  }

  const recordings: MbRecording[] = rawRecordings
    .filter((r) => r.id && r.title)
    .map((r) => {
      const credit = r["artist-credit"] ?? [];
      const artistName = credit
        .map((c) => c.name ?? c.artist?.name ?? "")
        .filter(Boolean)
        .join(", ");
      return {
        id: r.id!,
        title: r.title!,
        artistName: artistName || "Unknown artist",
        firstReleaseDate: r["first-release-date"],
        score: typeof r.score === "number" ? r.score : 0,
      };
    });

  return { kind: "found", isrc: normalized, recordings };
}

/**
 * Сравнивает наш артист/название с тем, что MusicBrainz знает по этому ISRC.
 * Возвращает true если есть конфликт: ISRC занят кем-то другим.
 *
 * Логика: считаем «наше совпадает с MB», если хотя бы одна запись из MB
 * имеет в названии или артисте подстроку, совпадающую с нашими (case-insensitive).
 * Если ни одна запись не совпала — считаем конфликтом.
 */
export function detectIsrcConflict(
  ourTitle: string,
  ourArtist: string,
  mbRecordings: MbRecording[],
): { conflict: boolean; conflictingArtist?: string; conflictingTitle?: string } {
  if (mbRecordings.length === 0) return { conflict: false };

  const ourTitleNorm = ourTitle.trim().toLowerCase();
  const ourArtistNorm = ourArtist.trim().toLowerCase();

  for (const rec of mbRecordings) {
    const titleMatch =
      rec.title.toLowerCase().includes(ourTitleNorm) ||
      ourTitleNorm.includes(rec.title.toLowerCase());
    const artistMatch =
      rec.artistName.toLowerCase().includes(ourArtistNorm) ||
      ourArtistNorm.includes(rec.artistName.toLowerCase());
    if (titleMatch && artistMatch) {
      return { conflict: false };
    }
  }

  // Берём самую высокоскорящую запись как «конфликтующую» для отображения
  const top = mbRecordings.slice().sort((a, b) => b.score - a.score)[0];
  return {
    conflict: true,
    conflictingArtist: top?.artistName,
    conflictingTitle: top?.title,
  };
}
