/**
 * Сидер реестра интеграций — при старте сервера убеждаемся, что в БД
 * есть запись для каждой поддерживаемой площадки. Если записи нет — создаём
 * со статусом "disconnected", если есть — оставляем как было.
 */

import { upsertIntegration } from "./integrations-service";

export const INTEGRATION_CATALOG: Array<{
  code: string;
  name: string;
  category: "dsp" | "video" | "social" | "delivery" | "analytics";
  authType: "oauth2" | "api_key" | "sftp" | "none";
}> = [
  // ── DSP (стриминг) ──
  { code: "spotify",       name: "Spotify",                    category: "dsp", authType: "oauth2" },
  { code: "apple_music",   name: "Apple Music",                category: "dsp", authType: "api_key" },
  { code: "youtube_music", name: "YouTube Music",              category: "dsp", authType: "oauth2" },
  { code: "deezer",        name: "Deezer",                     category: "dsp", authType: "sftp" },
  { code: "tidal",         name: "Tidal",                      category: "dsp", authType: "sftp" },
  { code: "amazon_music",  name: "Amazon Music",               category: "dsp", authType: "sftp" },
  { code: "vk_music",      name: "VK Музыка / BOOM",           category: "dsp", authType: "sftp" },
  { code: "yandex_music",  name: "Яндекс Музыка",              category: "dsp", authType: "sftp" },
  { code: "ok_music",      name: "Одноклассники Музыка",       category: "dsp", authType: "oauth2" },
  { code: "pandora",       name: "Pandora",                    category: "dsp", authType: "api_key" },
  { code: "boomplay",      name: "Boomplay",                   category: "dsp", authType: "sftp" },
  { code: "soundcloud",    name: "SoundCloud",                 category: "dsp", authType: "oauth2" },
  { code: "zvuk",          name: "Звук (СберЗвук)",            category: "dsp", authType: "sftp" },

  // ── Video ──
  { code: "youtube_cms",   name: "YouTube CMS / Content ID",   category: "video", authType: "oauth2" },
  { code: "vk_video",      name: "VK Video / VK Клипы",        category: "video", authType: "oauth2" },
  { code: "rutube",        name: "Rutube",                     category: "video", authType: "oauth2" },
  { code: "yandex_zen",    name: "Дзен (Видео)",               category: "video", authType: "oauth2" },
  { code: "ok_video",      name: "Одноклассники Видео",        category: "video", authType: "oauth2" },
  { code: "likee",         name: "Likee",                      category: "video", authType: "api_key" },
  { code: "vevo",          name: "Vevo",                       category: "video", authType: "sftp" },

  // ── Social ──
  { code: "tiktok",         name: "TikTok",                    category: "social", authType: "oauth2" },
  { code: "instagram",      name: "Instagram / Reels",         category: "social", authType: "oauth2" },
  { code: "youtube_shorts", name: "YouTube Shorts",            category: "social", authType: "oauth2" },
  { code: "facebook",       name: "Facebook (Meta)",           category: "social", authType: "oauth2" },
  { code: "snapchat",       name: "Snapchat Sounds",           category: "social", authType: "api_key" },

  // ── DDEX delivery ──
  { code: "ddex_main",  name: "DDEX SFTP (универсальный)",     category: "delivery", authType: "sftp" },
  { code: "ddex_party", name: "DDEX Party ID",                 category: "delivery", authType: "none" },

  // ── Analytics ──
  { code: "chartmetric", name: "Chartmetric",                  category: "analytics", authType: "api_key" },
  { code: "soundcharts", name: "Soundcharts",                  category: "analytics", authType: "api_key" },
];

export async function seedIntegrations(): Promise<void> {
  let created = 0;
  for (const item of INTEGRATION_CATALOG) {
    try {
      await upsertIntegration(item);
      created++;
    } catch (e) {
      console.error(`[seed] Не удалось зарегистрировать ${item.code}:`, e);
    }
  }
  console.log(`[seed] Реестр интеграций: ${created}/${INTEGRATION_CATALOG.length} записей готово`);
}
