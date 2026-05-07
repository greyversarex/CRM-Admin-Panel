/**
 * Типы для DDEX-пайплайна. Сюда смотрят все модули внутри `ddex/`.
 */

export type ErnVersion = "4.3";
export type Profile = "AudioSingle" | "AudioAlbum" | "Video";
export type MessageType = "NewReleaseMessage" | "PurgeReleaseMessage";
export type UpdateIndicator = "OriginalMessage" | "UpdateMessage" | "TakedownMessage";
export type CommercialModel = "SubscriptionModel" | "AdvertisementSupportedModel" | "PayAsYouGoModel" | "FreeOfChargeModel";
export type UseType = "OnDemandStream" | "NonInteractiveStream" | "PermanentDownload" | "ConditionalDownload" | "Stream";

/** Один участник split'а — любой из артистов / лейблов / пользователей. */
export type SplitParticipant = {
  entityType: "artist" | "label" | "user";
  entityId: number;
  entityName: string;
  percentage: number;
};

/** Источник аудио или картинки для приложения к ERN. */
export type ResourceFile = {
  /** локальный путь или storageKey */
  source: string;
  /** имя как лежит в SFTP пакете */
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha1?: string;
};

/** Артист с ролью в контексте релиза. */
export type ContributingArtist = {
  partyRef: string;        // "P_ARTIST_1"
  fullName: string;
  role: "MainArtist" | "FeaturedArtist" | "Composer" | "Lyricist" | "Producer";
};

export type TrackContext = {
  trackId: number;
  resourceRef: string;     // "A1", "A2", …
  isrc: string;
  title: string;
  durationSeconds: number;
  language: string;        // ISO-639-1: "tg" | "ru" | "en"
  isExplicit: boolean;
  trackNumber: number;
  /** Структурированный список авторов/композиторов (writers jsonb на треке). */
  writers: Array<{ name: string; role: "composer" | "lyricist" | "songwriter" | "arranger"; share: number }>;
  /** Performers (для DDEX <Contributor> и Apple Music). */
  performers: Array<{ name: string; role: string }>;
  /** Production & Engineering. */
  production: Array<{ name: string; role: string }>;
  contributors: ContributingArtist[];
  audioFile: ResourceFile | null;
};

export type ReleaseContext = {
  releaseId: number;
  upc: string;
  title: string;
  releaseType: "single" | "ep" | "album" | "compilation";
  /** AudioSingle/AudioAlbum/Video — берётся из releaseType + assets */
  profile: Profile;
  releaseDate: string;     // YYYY-MM-DD
  genre: string | null;
  language: string;
  isExplicit: boolean;
  /** ISO-3166 alpha-2 codes ("WW" → Worldwide) */
  territories: string[];
  pLine: string | null;
  cLine: string | null;
  mainArtist: ContributingArtist;
  featuredArtists: ContributingArtist[];
  label: { partyRef: string; name: string; partyId: string | null } | null;
  cover: ResourceFile | null;
  tracks: TrackContext[];
};

export type DealConfig = {
  commercialModel: CommercialModel;
  useTypes: UseType[];
  /** ISO-3166 список или ["Worldwide"] */
  territories: string[];
  startDate: string;       // YYYY-MM-DD
  endDate?: string | null; // null = бессрочно
  isTakedown?: boolean;    // для Takedown-сообщений ставим true
};

export type PartnerContext = {
  code: string;
  partyIdSender: string;     // наш PADPIDA
  partyIdRecipient: string;  // PADPIDA партнёра
  partyNameSender: string;
  partyNameRecipient: string;
};

export type BuildErnInput = {
  release: ReleaseContext;
  partner: PartnerContext;
  ernVersion: ErnVersion;
  messageType: MessageType;
  updateIndicator: UpdateIndicator;
  messageId: string;
  messageThreadId: string;
  createdAt: Date;
  deal: DealConfig;
};

export type BuildErnResult = {
  xml: string;
  resources: ResourceFile[]; // все файлы, на которые ссылается XML (audio + cover)
};
