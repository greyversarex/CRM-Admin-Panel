/**
 * Реестр всех коннекторов. Чтобы добавить новый — импортируем и регистрируем тут.
 *
 * Большинство DSP без публичного API подключаются через универсальный DDEX-SFTP
 * коннектор (createDdexSftpConnector(code)). Площадки с реальным API
 * (Spotify, Apple Music API, YouTube CMS) получают собственный файл-коннектор.
 */

import type { IConnector } from "./base";
import { spotifyConnector } from "./spotify";
import { acrcloudConnector } from "./acrcloud";
import { createDdexSftpConnector } from "./ddex-sftp";

const REGISTRY: Map<string, IConnector> = new Map();

function register(c: IConnector) {
  REGISTRY.set(c.code, c);
}

// ── Реальные API-коннекторы ──
register(spotifyConnector);
register(acrcloudConnector);

// ── Универсальные DDEX-SFTP коннекторы (для площадок без публичного API) ──
[
  "vk_music",
  "yandex_music",
  "zvuk",
  "ok_music",
  "boomplay",
  "ddex_main",
  // DSP с DDEX-доставкой (даже если у них есть API — большинство дистрибуций идёт через DDEX)
  "deezer",
  "tidal",
  "amazon_music",
  "apple_music",
  "youtube_music",
  "tiktok",
  "vevo",
].forEach((code) => register(createDdexSftpConnector(code)));

export function getConnector(code: string): IConnector | undefined {
  return REGISTRY.get(code);
}

export function listConnectorCodes(): string[] {
  return Array.from(REGISTRY.keys());
}
