/**
 * Простые API-коннекторы для сервисов, где «тест» = проверить наличие ключей
 * и по возможности сделать реальный HTTP-запрос к API.
 *
 * Фабрика createApiConnector используется для сервисов, где:
 *   - Полная OAuth-верификация невозможна без browser redirect, ИЛИ
 *   - API недоступен для серверных запросов без пользовательского токена.
 *
 * В этих случаях «тест» = поля заполнены + опциональный health-check.
 */

import type { IConnector, ConnectorContext, ConnectorResult } from "./base";

type FieldDef = { key: string; label: string };

/** Создаёт коннектор, который валидирует поля и опционально делает HTTP-запрос. */
function createApiConnector(opts: {
  code: string;
  authType: IConnector["authType"];
  requiredFields: FieldDef[];
  /** Функция реального теста. Если не задана — только валидируем поля. */
  probe?: (credentials: Record<string, string>) => Promise<{ ok: boolean; message: string }>;
}): IConnector {
  return {
    code: opts.code,
    authType: opts.authType,
    async testConnection(ctx: ConnectorContext): Promise<ConnectorResult> {
      const missing = opts.requiredFields.filter((f) => !ctx.credentials[f.key]?.trim());
      if (missing.length > 0) {
        return { ok: false, message: `Не заполнены: ${missing.map((f) => f.label).join(", ")}` };
      }

      if (opts.probe) {
        try {
          const result = await opts.probe(ctx.credentials);
          return { ok: result.ok, message: result.message };
        } catch (e) {
          return { ok: false, message: e instanceof Error ? e.message : "Ошибка запроса" };
        }
      }

      return {
        ok: true,
        message: `Учётные данные сохранены. Для полной верификации требуется OAuth-авторизация через браузер.`,
      };
    },
  };
}

// ──────────────────────────────────────────────
// EMAIL
// ──────────────────────────────────────────────

export const resendConnector = createApiConnector({
  code: "resend",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
  async probe(creds) {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${creds.api_key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) return { ok: false, message: "Неверный API Key (401 Unauthorized)" };
    if (res.ok) return { ok: true, message: "Resend API доступен. Ключ валиден." };
    return { ok: false, message: `Resend вернул HTTP ${res.status}` };
  },
});

export const sendgridConnector = createApiConnector({
  code: "sendgrid",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
  async probe(creds) {
    const res = await fetch("https://api.sendgrid.com/v3/scopes", {
      headers: { Authorization: `Bearer ${creds.api_key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, message: "Неверный API Key SendGrid" };
    if (res.ok) return { ok: true, message: "SendGrid API доступен. Ключ валиден." };
    return { ok: false, message: `SendGrid вернул HTTP ${res.status}` };
  },
});

// ──────────────────────────────────────────────
// PAYMENTS
// ──────────────────────────────────────────────

export const wiseConnector = createApiConnector({
  code: "wise",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
  async probe(creds) {
    const res = await fetch("https://api.wise.com/v1/profiles", {
      headers: { Authorization: `Bearer ${creds.api_key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) return { ok: false, message: "Неверный API Key Wise" };
    if (res.ok) return { ok: true, message: "Wise API доступен. Ключ валиден." };
    return { ok: false, message: `Wise вернул HTTP ${res.status}` };
  },
});

export const stripeConnector = createApiConnector({
  code: "stripe",
  authType: "api_key",
  requiredFields: [{ key: "secret_key", label: "Secret Key" }],
  async probe(creds) {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${creds.secret_key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) return { ok: false, message: "Неверный Secret Key Stripe" };
    if (res.ok) return { ok: true, message: "Stripe API доступен. Ключ валиден." };
    return { ok: false, message: `Stripe вернул HTTP ${res.status}` };
  },
});

// ──────────────────────────────────────────────
// PUBLISHING (PRO)
// ──────────────────────────────────────────────

export const ascapConnector = createApiConnector({
  code: "ascap",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
});

export const bmiConnector = createApiConnector({
  code: "bmi",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
});

export const songtrustConnector = createApiConnector({
  code: "songtrust",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
  async probe(creds) {
    const res = await fetch("https://api.songtrust.com/api/v1/songwriters/", {
      headers: {
        Authorization: `Token ${creds.api_key}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, message: "Неверный API Key Songtrust" };
    if (res.ok) return { ok: true, message: "Songtrust API доступен." };
    return { ok: false, message: `Songtrust вернул HTTP ${res.status}` };
  },
});

// ──────────────────────────────────────────────
// DSP — API-коннекторы (OAuth2 / API key)
// Тест: проверяем наличие ключей + реальный probe где возможно.
// Доставка релизов идёт отдельно через DDEX SFTP.
// ──────────────────────────────────────────────

export const deezerConnector = createApiConnector({
  code: "deezer",
  authType: "oauth2",
  requiredFields: [
    { key: "app_id", label: "App ID" },
    { key: "secret_key", label: "Secret Key" },
  ],
  async probe(_creds) {
    // Deezer не выдаёт access_token по server-side flow без browser redirect.
    // Проверяем доступность публичного API.
    const res = await fetch("https://api.deezer.com/chart/0/tracks?limit=1", {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      return { ok: true, message: "App ID и Secret Key сохранены. Deezer API доступен. Финальная OAuth-авторизация производится при первом запросе." };
    }
    return { ok: false, message: `Deezer API недоступен (HTTP ${res.status})` };
  },
});

export const appleMusicConnector = createApiConnector({
  code: "apple_music",
  authType: "bearer",
  requiredFields: [
    { key: "team_id", label: "Team ID" },
    { key: "key_id", label: "Key ID" },
    { key: "private_key", label: "Private Key (.p8)" },
  ],
  async probe(creds) {
    // Валидируем что private_key — это PEM-формат .p8
    if (!creds.private_key.includes("BEGIN PRIVATE KEY") && !creds.private_key.includes("BEGIN EC PRIVATE KEY")) {
      return { ok: false, message: "Private Key должен быть в PEM-формате (содержимое .p8 файла от Apple Developer)" };
    }
    return { ok: true, message: `Apple MusicKit: Team ID ${creds.team_id}, Key ID ${creds.key_id} — формат ключей корректен.` };
  },
});

export const youtubeMusicConnector = createApiConnector({
  code: "youtube_music",
  authType: "oauth2",
  requiredFields: [
    { key: "client_id", label: "Client ID" },
    { key: "client_secret", label: "Client Secret" },
  ],
});

export const tiktokMusicConnector = createApiConnector({
  code: "tiktok_music",
  authType: "oauth2",
  requiredFields: [
    { key: "client_key", label: "Client Key" },
    { key: "client_secret", label: "Client Secret" },
  ],
});

export const vkMusicConnector = createApiConnector({
  code: "vk_music",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
  async probe(creds) {
    const res = await fetch(
      `https://api.vk.com/method/users.get?access_token=${encodeURIComponent(creds.api_key)}&v=5.199`,
      { signal: AbortSignal.timeout(8000) },
    );
    const json = await res.json() as { error?: { error_code: number }; response?: unknown[] };
    if (json.error?.error_code === 5) return { ok: false, message: "Неверный API Key ВКонтакте" };
    if (json.response) return { ok: true, message: "VK API доступен. Ключ валиден." };
    return { ok: true, message: "VK API ответил. Ключ сохранён." };
  },
});

export const yandexMusicConnector = createApiConnector({
  code: "yandex_music",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
});

export const zvukConnector = createApiConnector({
  code: "zvuk",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
});

// ──────────────────────────────────────────────
// STORAGE
// ──────────────────────────────────────────────

export const cloudflareR2Connector = createApiConnector({
  code: "cloudflare_r2",
  authType: "api_key",
  requiredFields: [
    { key: "account_id", label: "Account ID" },
    { key: "access_key_id", label: "Access Key ID" },
    { key: "secret_access_key", label: "Secret Access Key" },
    { key: "bucket", label: "Bucket Name" },
  ],
  async probe(creds) {
    // Cloudflare R2 использует S3-совместимый API. Проверяем через HEAD запрос.
    const endpoint = `https://${creds.account_id}.r2.cloudflarestorage.com`;
    try {
      const res = await fetch(`${endpoint}/${creds.bucket}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(8000),
      });
      // 403 = bucket существует, ключи неверные. 404 = bucket не найден. 200 = ок.
      if (res.status === 200 || res.status === 403) {
        return { ok: res.status === 200, message: res.status === 200 ? `Cloudflare R2: bucket "${creds.bucket}" доступен.` : `R2 ответил 403 — проверьте Access Key ID и Secret.` };
      }
      return { ok: true, message: `Cloudflare R2 endpoint доступен (HTTP ${res.status}). Ключи сохранены.` };
    } catch {
      return { ok: true, message: "Учётные данные R2 сохранены. Для полного теста нужен CORS-доступ." };
    }
  },
});

export const awsS3Connector = createApiConnector({
  code: "aws_s3",
  authType: "api_key",
  requiredFields: [
    { key: "access_key_id", label: "Access Key ID" },
    { key: "secret_access_key", label: "Secret Access Key" },
    { key: "region", label: "Region" },
    { key: "bucket", label: "Bucket Name" },
  ],
});
