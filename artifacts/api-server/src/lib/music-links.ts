/**
 * Разбор ссылок на музыкальные площадки.
 *
 * Поле переноса каталога называется «ссылка», но до сих пор понимало только
 * чистый UPC: вставленная ссылка уходила в поиск по имени артиста и не
 * находила ничего. Здесь из ссылки достаётся площадка и идентификатор, по
 * которым релиз потом ищется в каталоге этой площадки.
 *
 * Почему это важно именно для переноса: искать по названию нельзя. «Kurmanci
 * Here Gule» — народная курдская песня, и Deezer отдаёт на неё под сотню
 * альбомов разных исполнителей. Нужный релиз опознаётся только по коду.
 */

export type MusicPlatform = "deezer" | "spotify" | "apple";
export type MusicLinkKind = "album" | "track" | "artist";

export type ParsedMusicLink = {
  platform: MusicPlatform;
  kind: MusicLinkKind;
  /** Идентификатор внутри площадки. */
  id: string;
};

/** Похоже ли на ссылку вообще (а не на UPC или имя артиста). */
export function looksLikeUrl(value: string): boolean {
  const v = value.trim();
  return /^(https?:\/\/|spotify:)/i.test(v) || /^[\w.-]+\.(com|link|page)\//i.test(v);
}

/**
 * Разбирает ссылку. `null` — площадка незнакома или это короткая ссылка,
 * которую без перехода не раскрыть.
 */
export function parseMusicLink(raw: string | null | undefined): ParsedMusicLink | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  // Формат spotify:album:ID — им делится десктопное приложение.
  const uri = /^spotify:(album|track|artist):([A-Za-z0-9]+)$/i.exec(value);
  if (uri) {
    return { platform: "spotify", kind: uri[1].toLowerCase() as MusicLinkKind, id: uri[2] };
  }

  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  // Сегменты без языковых префиксов: deezer.com/en/album/… и
  // open.spotify.com/intl-de/album/… встречаются постоянно.
  const parts = url.pathname.split("/").filter(Boolean).filter((p) => !/^(intl-)?[a-z]{2}(-[a-z]{2})?$/i.test(p));

  if (host.endsWith("deezer.com")) {
    const [kind, id] = parts;
    if (id && /^\d+$/.test(id) && (kind === "album" || kind === "track" || kind === "artist")) {
      return { platform: "deezer", kind, id };
    }
    return null;
  }

  if (host === "open.spotify.com" || host.endsWith("spotify.com")) {
    const [kind, id] = parts;
    if (id && (kind === "album" || kind === "track" || kind === "artist")) {
      return { platform: "spotify", kind: kind as MusicLinkKind, id: id.split("?")[0] };
    }
    return null;
  }

  if (host === "music.apple.com" || host === "itunes.apple.com") {
    // .../album/название/1234567890  и  ?i=1234567891 для отдельного трека.
    const trackId = url.searchParams.get("i");
    const last = parts[parts.length - 1];
    if (trackId && /^\d+$/.test(trackId)) return { platform: "apple", kind: "track", id: trackId };
    if (last && /^\d+$/.test(last)) {
      const kind: MusicLinkKind = parts.includes("artist") ? "artist" : "album";
      return { platform: "apple", kind, id: last };
    }
    return null;
  }

  return null;
}
