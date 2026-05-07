// Shared constants/types for ReleaseWizard. Source of truth — серверная схема,
// здесь только UI-удобства (метки, дефолты, лимиты валидации формы).
import type {
  TrackDisplayArtist, TrackWriter, TrackPerformer, TrackProductionMember,
  ReleaseArtistRefRole,
} from "@workspace/api-client-react";

export const RELEASE_TYPES = [
  { value: "single",      label: "Сингл" },
  { value: "album",       label: "Альбом" },
  { value: "ep",          label: "EP" },
  { value: "compilation", label: "Сборник" },
] as const;

export const GENRES = [
  "Pop", "Dance Pop", "Tajik Folk", "Hip Hop", "Rock", "Electronic",
  "R&B", "Classical", "Jazz", "World", "Folk", "Soundtrack", "Latin",
] as const;

export const SUBGENRES: Record<string, string[]> = {
  "Pop":         ["Synth-Pop", "Indie Pop", "Dance Pop", "K-Pop"],
  "Hip Hop":     ["Trap", "Boom Bap", "Drill", "Conscious"],
  "Rock":        ["Indie Rock", "Hard Rock", "Punk", "Metal"],
  "Electronic":  ["House", "Techno", "Drum & Bass", "Ambient"],
  "Tajik Folk":  ["Falak", "Shashmaqom", "Modern Folk"],
  "World":       ["Persian", "Central Asian", "Arabic"],
  "R&B":         ["Soul", "Neo-Soul", "Contemporary R&B"],
  "Jazz":        ["Smooth Jazz", "Vocal Jazz", "Fusion"],
};

export const LANGS: Array<{ value: string; label: string }> = [
  { value: "Tajik",   label: "Таджикский" },
  { value: "Russian", label: "Русский" },
  { value: "English", label: "Английский" },
  { value: "Persian", label: "Персидский" },
  { value: "Uzbek",   label: "Узбекский" },
  { value: "Arabic",  label: "Арабский" },
  { value: "Turkish", label: "Турецкий" },
];

export const ARTIST_ROLES: Array<{ value: ReleaseArtistRefRole; label: string }> = [
  { value: "primary",   label: "Primary" },
  { value: "featuring", label: "Featuring" },
  { value: "with",      label: "With" },
  { value: "remixer",   label: "Remixer" },
];

export const WRITER_ROLES: Array<{ value: TrackWriter["role"]; label: string }> = [
  { value: "composer",   label: "Composer" },
  { value: "lyricist",   label: "Lyricist" },
  { value: "songwriter", label: "Songwriter" },
  { value: "arranger",   label: "Arranger" },
];

export const DISPLAY_ARTIST_ROLES: Array<{ value: TrackDisplayArtist["role"]; label: string }> = [
  { value: "primary",   label: "Primary" },
  { value: "featuring", label: "Featuring" },
  { value: "with",      label: "With" },
  { value: "remixer",   label: "Remixer" },
];

export const PERFORMER_ROLES = [
  "vocals", "background_vocals", "guitar", "bass", "drums",
  "keyboards", "music_producer", "piano", "violin", "other",
] as const;

export const PRODUCTION_ROLES = [
  "producer", "recording_engineer", "mixing_engineer", "mastering_engineer", "other",
] as const;

export const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "TJ", name: "Таджикистан" },
  { code: "RU", name: "Россия" },
  { code: "UZ", name: "Узбекистан" },
  { code: "KZ", name: "Казахстан" },
  { code: "KG", name: "Кыргызстан" },
  { code: "TR", name: "Турция" },
  { code: "IR", name: "Иран" },
  { code: "US", name: "США" },
  { code: "GB", name: "Великобритания" },
  { code: "DE", name: "Германия" },
  { code: "FR", name: "Франция" },
];

export const DSP_CATEGORY_LABELS: Record<string, string> = {
  streaming: "Стриминг",
  download:  "Загрузки",
  social:    "Социальные / TikTok",
  video:     "Видео",
  regional:  "Региональные",
};

export const STEPS = [
  { key: "details",    label: "Информация о релизе" },
  { key: "tracks",     label: "Треки" },
  { key: "delivery",   label: "Доставка на DSP" },
  { key: "submission", label: "Отправка на модерацию" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export type ContribDA = TrackDisplayArtist;
export type ContribW = TrackWriter;
export type ContribP = TrackPerformer;
export type ContribProd = TrackProductionMember;
