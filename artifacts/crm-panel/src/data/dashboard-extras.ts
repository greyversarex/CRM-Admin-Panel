/**
 * Источники данных для расширенного дашборда и Publishing.
 *
 * ВАЖНО: эти функции возвращают мок-данные для демо. Когда API будет готов,
 * замените тело функций на вызов соответствующего хука из @workspace/api-client-react —
 * сигнатура (return type) останется прежней, компоненты ничего не заметят.
 *
 * Пример замены:
 *   export function useGeoStreams(role) {
 *     const { data } = useGetDashboardGeo({ scope: role });
 *     return data ?? [];
 *   }
 */

import type { Role } from "@/lib/auth";

// ───────────── Типы ─────────────

export type GeoCountry = {
  code: string;        // ISO-3166 alpha-2, нижний регистр для эмодзи-флагов
  name: string;
  streams: number;
  percent: number;     // 0..100 относительно лидера
};

export type UgcMonth = {
  month: string;
  views: number;
  watchTime: number;   // часы
  videos: number;
};

export type SocialBar = {
  label: string;
  value: number;
};

export type SocialBlock = {
  platform: "tiktok" | "instagram" | "youtube_shorts";
  totalViews: number;
  data: SocialBar[];
};

export type PublishingKpis = {
  totalWorks: number;
  registeredWorks: number;
  pendingRegistrations: number;
  conflicts: number;
  publishingRoyalties: number;
};

export type WorkStatus = "accepted" | "pending" | "conflict" | "rejected";

export type PublishingWork = {
  id: string;
  title: string;
  artist: string;
  composer: string;
  lyricist: string;
  isrc: string;
  iswc?: string;
  pros: ("ASCAP" | "BMI" | "TheMLC" | "Sentric" | "RAO" | "PRS")[];
  share: number;       // % правообладателя
  status: WorkStatus;
};

// ───────────── Гео ─────────────

const GEO_ADMIN: GeoCountry[] = [
  { code: "tj", name: "Таджикистан",  streams: 4_052_000, percent: 100 },
  { code: "ru", name: "Россия",        streams: 2_051_000, percent: 51 },
  { code: "uz", name: "Узбекистан",    streams: 1_240_000, percent: 31 },
  { code: "kz", name: "Казахстан",     streams:   980_000, percent: 24 },
  { code: "kg", name: "Кыргызстан",    streams:   620_000, percent: 15 },
  { code: "us", name: "США",           streams:   480_000, percent: 12 },
  { code: "de", name: "Германия",      streams:   340_000, percent:  8 },
  { code: "tr", name: "Турция",        streams:   236_000, percent:  6 },
];

const GEO_LABEL: GeoCountry[] = [
  { code: "tj", name: "Таджикистан", streams: 1_400_000, percent: 100 },
  { code: "ru", name: "Россия",       streams:   720_000, percent: 51 },
  { code: "uz", name: "Узбекистан",   streams:   320_000, percent: 23 },
  { code: "kz", name: "Казахстан",    streams:   210_000, percent: 15 },
  { code: "kg", name: "Кыргызстан",   streams:   142_000, percent: 10 },
];

const GEO_ARTIST: GeoCountry[] = [
  { code: "tj", name: "Таджикистан", streams: 482_000, percent: 100 },
  { code: "ru", name: "Россия",       streams: 364_000, percent: 75 },
  { code: "uz", name: "Узбекистан",   streams: 198_000, percent: 41 },
  { code: "kz", name: "Казахстан",    streams: 124_000, percent: 26 },
  { code: "kg", name: "Кыргызстан",   streams:  72_000, percent: 15 },
];

export function getGeoStreams(role: Role): GeoCountry[] {
  if (role === "artist") return GEO_ARTIST;
  if (role === "label")  return GEO_LABEL;
  return GEO_ADMIN;
}

// ───────────── UGC ─────────────

const UGC_ADMIN: UgcMonth[] = [
  { month: "Окт", views:  82_000, watchTime: 24_500, videos: 142 },
  { month: "Ноя", views: 121_000, watchTime: 33_800, videos: 198 },
  { month: "Дек", views: 168_000, watchTime: 51_200, videos: 246 },
  { month: "Янв", views: 142_000, watchTime: 47_900, videos: 211 },
  { month: "Фев", views: 198_000, watchTime: 62_400, videos: 287 },
  { month: "Мар", views: 246_000, watchTime: 78_100, videos: 332 },
];

const UGC_LABEL: UgcMonth[] = UGC_ADMIN.map(m => ({ ...m, views: Math.round(m.views * 0.32), watchTime: Math.round(m.watchTime * 0.32), videos: Math.round(m.videos * 0.32) }));
const UGC_ARTIST: UgcMonth[] = UGC_ADMIN.map(m => ({ ...m, views: Math.round(m.views * 0.08), watchTime: Math.round(m.watchTime * 0.08), videos: Math.round(m.videos * 0.08) }));

export function getUgcOverview(role: Role): UgcMonth[] {
  if (role === "artist") return UGC_ARTIST;
  if (role === "label")  return UGC_LABEL;
  return UGC_ADMIN;
}

// ───────────── Соцсети (TikTok / Instagram) ─────────────

const SOCIAL_ADMIN: SocialBlock[] = [
  {
    platform: "tiktok",
    totalViews: 13_204_000,
    data: [
      { label: "Дек", value: 1_240_000 },
      { label: "Янв", value: 1_980_000 },
      { label: "Фев", value: 2_410_000 },
      { label: "Мар", value: 3_820_000 },
      { label: "Апр", value: 3_754_000 },
    ],
  },
  {
    platform: "instagram",
    totalViews: 13_204_000,
    data: [
      { label: "Дек",  value: 1_120_000 },
      { label: "Янв",  value: 1_640_000 },
      { label: "Фев",  value: 2_080_000 },
      { label: "Мар",  value: 3_410_000 },
      { label: "Апр",  value: 4_954_000 },
    ],
  },
];

const SOCIAL_LABEL: SocialBlock[] = SOCIAL_ADMIN.map(b => ({
  ...b,
  totalViews: Math.round(b.totalViews * 0.32),
  data: b.data.map(d => ({ ...d, value: Math.round(d.value * 0.32) })),
}));

const SOCIAL_ARTIST: SocialBlock[] = SOCIAL_ADMIN.map(b => ({
  ...b,
  totalViews: Math.round(b.totalViews * 0.08),
  data: b.data.map(d => ({ ...d, value: Math.round(d.value * 0.08) })),
}));

export function getSocialBlocks(role: Role): SocialBlock[] {
  if (role === "artist") return SOCIAL_ARTIST;
  if (role === "label")  return SOCIAL_LABEL;
  return SOCIAL_ADMIN;
}

// ───────────── Publishing ─────────────

const PUB_KPI_ADMIN: PublishingKpis = {
  totalWorks: 2_546,
  registeredWorks: 2_146,
  pendingRegistrations: 287,
  conflicts: 32,
  publishingRoyalties: 18_525,
};

const PUB_KPI_LABEL: PublishingKpis = {
  totalWorks: 412,
  registeredWorks: 348,
  pendingRegistrations: 48,
  conflicts: 6,
  publishingRoyalties: 3_140,
};

const PUB_KPI_ARTIST: PublishingKpis = {
  totalWorks: 12,
  registeredWorks: 9,
  pendingRegistrations: 2,
  conflicts: 1,
  publishingRoyalties: 920,
};

export function getPublishingKpis(role: Role): PublishingKpis {
  if (role === "artist") return PUB_KPI_ARTIST;
  if (role === "label")  return PUB_KPI_LABEL;
  return PUB_KPI_ADMIN;
}

const WORKS_BASE: PublishingWork[] = [
  { id: "w1",  title: "Bacha Amyon",         artist: "Yosamin Davlatova", composer: "Mir Maftoon",       lyricist: "Mir Maftoon",        isrc: "TJA012500599", pros: ["ASCAP","TheMLC","Sentric"], share: 100, status: "accepted" },
  { id: "w2",  title: "Man mani kardanat",   artist: "Umedjon Burhon",    composer: "Sangali Sherifzod", lyricist: "Orzu Iseev",         isrc: "TJA012500599", pros: ["ASCAP","TheMLC","Sentric"], share: 100, status: "conflict" },
  { id: "w3",  title: "Arusi",               artist: "Aazod jonez@gmail.com", composer: "Sarvinoz Yusufi", lyricist: "Sarvinoz Yusufi", isrc: "TJA012500599", pros: ["ASCAP","TheMLC","Sentric"], share: 100, status: "pending" },
  { id: "w4",  title: "Dilbarak",            artist: "Yasmina Davlatova", composer: "Ihom Murodov",      lyricist: "Yosamin Davlatova",  isrc: "TJA012500599", pros: ["ASCAP","TheMLC","Sentric"], share: 100, status: "accepted" },
  { id: "w5",  title: "Bachai Zur",          artist: "Zaynura Pulodova",  composer: "Zain Shamsiddin",   lyricist: "Zain Shamsiddin",    isrc: "TJA012500599", pros: ["ASCAP","TheMLC","Sentric"], share: 100, status: "accepted" },
  { id: "w6",  title: "Wada",                artist: "Yasmina",           composer: "Yasmina Habibi",    lyricist: "Yasmina Habibi",     isrc: "TJA012500599", pros: ["ASCAP","TheMLC","Sentric"], share: 100, status: "pending" },
  { id: "w7",  title: "Nozanin",             artist: "Yasmina",           composer: "Yasmina Habibi",    lyricist: "Yasmina Habibi",     isrc: "TJA012500599", pros: ["ASCAP","TheMLC","Sentric"], share: 100, status: "pending" },
  { id: "w8",  title: "Chasmoi Noz",         artist: "Mino",              composer: "Davroni Rahmazod",  lyricist: "Orzu Iseev",         isrc: "TJA012500599", pros: ["ASCAP","TheMLC","Sentric"], share: 100, status: "conflict" },
  { id: "w9",  title: "Ma'lum Nest",         artist: "Zakiya",            composer: "Robert Mirzoyan",   lyricist: "Orzu Iseev",         isrc: "TJA012500599", pros: ["ASCAP","TheMLC","Sentric"], share: 100, status: "accepted" },
  { id: "w10", title: "Kosh Kabutar Mebudam", artist: "Yasmina",          composer: "Yasmina Habibi",    lyricist: "Yasmina Habibi",     isrc: "TJA012500599", pros: ["ASCAP","TheMLC","Sentric"], share: 100, status: "pending" },
  { id: "w11", title: "Дилам мехохад",       artist: "Ансамбли Бахор",    composer: "Камол Хасанов",     lyricist: "Зарина Саидова",     isrc: "TJA012500700", pros: ["RAO","TheMLC"], share:  85, status: "accepted" },
  { id: "w12", title: "Бахор омад",          artist: "Ансамбли Бахор",    composer: "Камол Хасанов",     lyricist: "Камол Хасанов",      isrc: "TJA012500701", pros: ["RAO","TheMLC"], share: 100, status: "accepted" },
];

export function getPublishingWorks(role: Role): PublishingWork[] {
  if (role === "artist") return WORKS_BASE.slice(10, 12);
  if (role === "label")  return WORKS_BASE.slice(0, 8);
  return WORKS_BASE;
}
