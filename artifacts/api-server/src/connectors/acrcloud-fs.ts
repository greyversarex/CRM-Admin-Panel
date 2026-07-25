/**
 * ACRCloud File Scanning коннектор (`acrcloud_fs`).
 *
 * Это ДРУГОЙ продукт ACRCloud, не путать с двумя уже существующими:
 *   - `acrcloud`      — Identification API (HMAC-SHA1, сэмпл <5 МБ / <15 сек).
 *                       Узнаёт трек по короткому куску, одно совпадение за вызов.
 *   - `acrcloud_ddex` — партнёрская доставка DDEX-пакета в S3. Кладёт НАШ каталог
 *                       в базу ACRCloud. Ничего не проверяет и ответа не возвращает.
 *   - `acrcloud_fs`   — File Scanning (этот файл). Загружаем файл ЦЕЛИКОМ (до 500 МБ),
 *                       ACRCloud сканирует его по всей длине и возвращает список
 *                       совпавших сегментов с таймкодами и метаданными
 *                       (label, album, UPC, ISRC, release date, где издан).
 *
 * Именно File Scanning даёт результат вида «Scanned Segments / Matched Segment
 * 00:02–00:13 / Found On Spotify, Deezer, YouTube» — то, что нужно для модерации.
 * UPC у нашего релиза при этом НЕ требуется: матч идёт по отпечатку звука.
 *
 * Аутентификация: Bearer-токен консоли (Console API), НЕ HMAC.
 * Токен создаётся в кабинете ACRCloud: Account → API Token.
 * Контейнер (fs-container) — это «проект» File Scanning, у него числовой id.
 *
 * Документация: https://docs.acrcloud.com/reference/console-api/file-scanning
 */

import type { IConnector, ConnectorContext, ConnectorResult } from "./base";

/** Регионы Console API. Ключ — то, что оператор выбирает в UI. */
export const FS_REGION_HOSTS: Record<string, string> = {
  "eu-west-1": "api-eu-west-1.acrcloud.com",
  "us-west-2": "api-us-west-2.acrcloud.com",
  "ap-southeast-1": "api-ap-southeast-1.acrcloud.com",
};

export const FS_DEFAULT_REGION = "eu-west-1";

/**
 * Хост Console API по региону.
 *
 * Оператор может ввести и регион (`eu-west-1`), и готовый хост
 * (`api-eu-west-1.acrcloud.com`) — принимаем оба варианта, иначе на этом
 * поле стабильно спотыкаются.
 */
export function resolveFsHost(regionOrHost?: string): string {
  const raw = (regionOrHost || FS_DEFAULT_REGION).replace(/^https?:\/\//, "").trim().replace(/\/+$/, "");
  if (FS_REGION_HOSTS[raw]) return FS_REGION_HOSTS[raw];
  // Anti-SSRF: произвольный хост из кредов ходил бы во внутреннюю сеть VPS.
  if (/^[a-z0-9-]+\.acrcloud\.com$/i.test(raw)) return raw;
  return FS_REGION_HOSTS[FS_DEFAULT_REGION];
}

export type FsConfig = {
  host: string;
  token: string;
  containerId: string;
};

/**
 * Собирает конфиг File Scanning из полей интеграции.
 * Возвращает null, если чего-то не хватает — вызывающий код превращает
 * это в понятную ошибку «не настроено», а не в невнятный HTTP-сбой.
 */
export function buildFsConfig(
  credentials: Record<string, string>,
  config: Record<string, unknown>,
): FsConfig | null {
  const token = (credentials["bearer_token"] || "").trim();
  const containerId = (credentials["container_id"] || String(config["containerId"] ?? "")).trim();
  if (!token || !containerId) return null;
  const region = (credentials["region"] || String(config["region"] ?? "")).trim();
  return { host: resolveFsHost(region), token, containerId };
}

export const acrcloudFsConnector: IConnector = {
  code: "acrcloud_fs",
  authType: "api_key",

  async testConnection(ctx: ConnectorContext): Promise<ConnectorResult> {
    const cfg = buildFsConfig(ctx.credentials, ctx.config);
    if (!cfg) {
      return { ok: false, message: "Не заполнены API Token или ID контейнера (Container ID)." };
    }

    // Самая дешёвая проверка: список файлов контейнера, одна запись.
    // Она разом проверяет и токен, и существование контейнера, и права на него.
    const url = `https://${cfg.host}/api/fs-containers/${encodeURIComponent(cfg.containerId)}/files?per_page=1`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: `Неверный API Token (HTTP ${res.status}). Проверьте токен в кабинете ACRCloud → Account → API Token.` };
      }
      if (res.status === 404) {
        return { ok: false, message: `Контейнер #${cfg.containerId} не найден. Проверьте Container ID и регион (сейчас ${cfg.host}).` };
      }

      const text = await res.text();
      let body: unknown = null;
      try { body = JSON.parse(text); } catch { /* не JSON */ }

      if (!res.ok) {
        const msg = (body as { message?: string } | null)?.message;
        return { ok: false, message: `ACRCloud отказал: HTTP ${res.status}${msg ? ` — ${msg}` : ""}.` };
      }
      if (body === null) {
        // Не JSON при 200 — почти всегда это CDN/прокси вместо API.
        return { ok: false, message: `Неожиданный ответ от ${cfg.host} (HTTP ${res.status}, не JSON). Проверьте регион.` };
      }

      const data = (body as { data?: unknown }).data;
      const filesCount = Array.isArray(data) ? data.length : 0;

      return {
        ok: true,
        message: `Контейнер #${cfg.containerId} доступен на ${cfg.host}. Токен валиден${filesCount ? `, в контейнере есть файлы` : ""}.`,
        data: { host: cfg.host, containerId: cfg.containerId },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return { ok: false, message: `Ошибка подключения к ${cfg.host}: ${msg}` };
    }
  },
};
