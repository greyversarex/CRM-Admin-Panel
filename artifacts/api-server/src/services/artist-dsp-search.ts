/**
 * Поиск профилей артиста на витринах (DSP) по имени — для мастера создания
 * релиза (identity mapping, как у Broma16): пользователь вбивает имя и выбирает
 * конкретный профиль на Spotify / Apple Music, чтобы релиз лёг на нужную
 * страницу артиста, а не к тёзке и не в дубликат.
 *
 * Функции никогда не бросают — возвращают typed-результат со статусом,
 * чтобы фронт мог показать «Spotify не настроен» вместо падения всего поиска.
 */

export type DspArtistCandidate = {
  id: string;
  name: string;
  imageUrl: string | null;
  followers: number | null;
  url: string | null;
  genre: string | null;
};

export type DspSearchResult = {
  status: "ok" | "not_configured" | "error";
  results: DspArtistCandidate[];
};

/** Поиск артистов в Spotify (client credentials token обязателен). */
export async function searchSpotifyArtists(token: string, name: string): Promise<DspSearchResult> {
  try {
    const r = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=6`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) return { status: "error", results: [] };
    const j = await r.json() as {
      artists?: { items?: {
        id: string; name: string;
        images?: { url: string; width?: number }[];
        followers?: { total?: number };
        genres?: string[];
        external_urls?: { spotify?: string };
      }[] };
    };
    const results = (j.artists?.items ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      // Берём самую маленькую картинку (для карточки в списке достаточно).
      imageUrl: a.images?.length ? a.images[a.images.length - 1].url : null,
      followers: a.followers?.total ?? null,
      url: a.external_urls?.spotify ?? `https://open.spotify.com/artist/${a.id}`,
      genre: a.genres?.[0] ?? null,
    }));
    return { status: "ok", results };
  } catch {
    return { status: "error", results: [] };
  }
}

/**
 * Поиск артистов в Deezer через бесплатный публичный API (без ключей).
 * Отдаёт аватар и число фанатов — полноценные карточки.
 */
export async function searchDeezerArtists(name: string): Promise<DspSearchResult> {
  try {
    const r = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=6`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return { status: "error", results: [] };
    const j = await r.json() as {
      data?: { id?: number; name?: string; picture_medium?: string; picture?: string; nb_fan?: number; link?: string }[];
      error?: unknown;
    };
    if (j.error) return { status: "error", results: [] };
    const results = (j.data ?? [])
      .filter((a) => a.id && a.name)
      .map((a) => ({
        id: String(a.id),
        name: a.name!,
        imageUrl: a.picture_medium ?? a.picture ?? null,
        followers: a.nb_fan ?? null,
        url: a.link ?? `https://www.deezer.com/artist/${a.id}`,
        genre: null,
      }));
    return { status: "ok", results };
  } catch {
    return { status: "error", results: [] };
  }
}

/**
 * Поиск артистов в Apple Music через бесплатный iTunes Search API (без ключей).
 * iTunes не отдаёт аватар для musicArtist — карточка будет без фото, зато со
 * ссылкой на профиль и жанром.
 */
export async function searchAppleArtists(name: string): Promise<DspSearchResult> {
  try {
    const r = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=musicArtist&limit=6`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return { status: "error", results: [] };
    const j = await r.json() as {
      results?: { artistId?: number; artistName?: string; artistLinkUrl?: string; primaryGenreName?: string }[];
    };
    const results = (j.results ?? [])
      .filter((a) => a.artistId && a.artistName)
      .map((a) => ({
        id: String(a.artistId),
        name: a.artistName!,
        imageUrl: null,
        followers: null,
        url: a.artistLinkUrl ?? null,
        genre: a.primaryGenreName ?? null,
      }));
    return { status: "ok", results };
  } catch {
    return { status: "error", results: [] };
  }
}
