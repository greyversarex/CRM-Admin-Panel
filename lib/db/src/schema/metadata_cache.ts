import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export type MetadataCacheTrack = {
  title: string;
  trackNumber: number;
  isrc: string | null;
  explicit: boolean;
};

/**
 * Кэш метаданных по UPC из внешних каталогов (Spotify, Deezer, MusicBrainz, iTunes).
 *
 * Цель: не ходить повторно в интернет при повторном просмотре/импорте того же
 * релиза. TTL — 30 дней (проверяется на прикладном уровне).
 *
 * raw_itunes / raw_source — сохраняем полный ответ каждого API, чтобы в будущем
 * извлечь новые поля без повторных запросов к внешним сервисам.
 */
export const metadataCacheTable = pgTable("metadata_cache", {
  upc: text("upc").primaryKey(),

  // Внешние идентификаторы
  spotifyAlbumId: text("spotify_album_id"),
  spotifyArtistId: text("spotify_artist_id"),
  deezerAlbumId: text("deezer_album_id"),
  musicbrainzMbid: text("musicbrainz_mbid"),
  itunesCollectionId: text("itunes_collection_id"),

  // Основные поля
  artistName: text("artist_name"),
  albumName: text("album_name"),
  labelName: text("label_name"),

  /** ℗ — фонографический копирайт (исполнитель / лейбл). Из iTunes Search API. */
  pLine: text("p_line"),
  /** © — авторский копирайт (текст/мелодия). Из iTunes Search API. */
  cLine: text("c_line"),

  coverUrl: text("cover_url"),
  genre: text("genre"),
  subgenre: text("subgenre"),
  releaseDate: text("release_date"),
  releaseType: text("release_type"),

  /** Треки с ISRC — основная ценность кэша для трансфера. */
  tracks: jsonb("tracks").$type<MetadataCacheTrack[]>(),

  /** Какой источник дал основные данные (spotify | deezer | musicbrainz). */
  sourceUsed: text("source_used"),

  /** Полный ответ iTunes Search API (для будущего переиспользования полей). */
  rawItunes: jsonb("raw_itunes").$type<unknown>(),
  /** Полный ответ первичного источника (Spotify/Deezer/MusicBrainz). */
  rawSource: jsonb("raw_source").$type<unknown>(),

  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("metadata_cache_fetched_at_idx").on(t.fetchedAt),
]);

export type MetadataCacheRow = typeof metadataCacheTable.$inferSelect;
export type MetadataCacheInsert = typeof metadataCacheTable.$inferInsert;
