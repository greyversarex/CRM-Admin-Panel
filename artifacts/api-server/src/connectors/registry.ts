/**
 * Реестр всех коннекторов. Чтобы добавить новый — импортируем и регистрируем тут.
 *
 * Площадки с реальным API получают собственный коннектор с probe-запросом.
 * DSP без прямого API подключаются через универсальный DDEX-SFTP коннектор
 * для доставки контента (отдельно от API-учётных данных в integrations-tab).
 */

import type { IConnector } from "./base";
import { spotifyConnector } from "./spotify";
import { acrcloudConnector } from "./acrcloud";
import { createDdexSftpConnector } from "./ddex-sftp";
import {
  resendConnector,
  sendgridConnector,
  wiseConnector,
  stripeConnector,
  telegramBotConnector,
  twilioWhatsappConnector,
  ascapConnector,
  bmiConnector,
  songtrustConnector,
  deezerConnector,
  appleMusicConnector,
  youtubeMusicConnector,
  tiktokMusicConnector,
  vkMusicConnector,
  yandexMusicConnector,
  zvukConnector,
  cloudflareR2Connector,
  awsS3Connector,
} from "./api-validators";

const REGISTRY: Map<string, IConnector> = new Map();

function register(c: IConnector) {
  REGISTRY.set(c.code, c);
}

// ── API-коннекторы с реальными probe-запросами ──
register(spotifyConnector);
register(acrcloudConnector);

// Email
register(resendConnector);
register(sendgridConnector);

// Payments
register(wiseConnector);
register(stripeConnector);

// Communications
register(telegramBotConnector);
register(twilioWhatsappConnector);

// Publishing (PRO)
register(ascapConnector);
register(bmiConnector);
register(songtrustConnector);

// DSP — API credentials (analytics / metadata)
register(deezerConnector);
register(appleMusicConnector);
register(youtubeMusicConnector);
register(tiktokMusicConnector);   // code = "tiktok_music" — совпадает с фронтом
register(vkMusicConnector);
register(yandexMusicConnector);
register(zvukConnector);

// Storage
register(cloudflareR2Connector);
register(awsS3Connector);

// ── DDEX-SFTP коннекторы для доставки контента ──
// Используются delivery-воркером при отгрузке релизов, НЕ из integrations-tab.
[
  "ddex_main",
  "ok_music",
  "boomplay",
  "tidal",
  "amazon_music",
  "vevo",
  // Алиасы для DDEX-delivery (отдельно от API-учётных данных выше)
  "deezer_sftp",
  "apple_music_sftp",
  "youtube_music_sftp",
  "vk_music_sftp",
  "yandex_music_sftp",
  "tiktok_sftp",
].forEach((code) => register(createDdexSftpConnector(code)));

export function getConnector(code: string): IConnector | undefined {
  return REGISTRY.get(code);
}

export function listConnectorCodes(): string[] {
  return Array.from(REGISTRY.keys());
}
