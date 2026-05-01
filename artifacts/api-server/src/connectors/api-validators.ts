/**
 * API-коннекторы. Принцип:
 *
 *   1) Если у площадки есть реальный публичный API, который требует
 *      аутентификации (Resend, SendGrid, Stripe, Wise, Songtrust, VK, Apple
 *      Music, Cloudflare R2 со SigV4) — мы делаем РЕАЛЬНЫЙ probe и честно
 *      сообщаем результат.
 *
 *   2) Если API нет (ASCAP, BMI, Yandex Music, Zvuk) или OAuth требует
 *      browser-redirect и server-side тест НЕВОЗМОЖЕН (YouTube Music,
 *      TikTok Music, Deezer) — мы НЕ возвращаем ложное "ok=true".
 *      Вместо этого ставим флаг `unverified: true`, который маппится в
 *      статус "unverified" (жёлтая плашка) на UI. Пользователь видит,
 *      что креды сохранены, но реальной проверки не было.
 *
 * Это критично для legal/контрактной точности: система не должна врать
 * заказчику, что коннект работает, если мы его не подтвердили.
 */

import crypto from "crypto";
import type { IConnector, ConnectorContext, ConnectorResult } from "./base";

type FieldDef = { key: string; label: string };

/**
 * Честный коннектор:
 *   - probe указан → пробуем достучаться, возвращаем реальный результат
 *   - probe не указан → ok=true с unverified=true (НЕ ложный успех)
 */
function createApiConnector(opts: {
  code: string;
  authType: IConnector["authType"];
  requiredFields: FieldDef[];
  probe?: (credentials: Record<string, string>) => Promise<{ ok: boolean; message: string; unverified?: boolean }>;
  /** Сообщение, объясняющее ПОЧЕМУ нет автоматического теста (для unverified). */
  noProbeReason?: string;
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
          return { ok: result.ok, message: result.message, unverified: result.unverified };
        } catch (e) {
          return { ok: false, message: e instanceof Error ? e.message : "Ошибка запроса" };
        }
      }

      // Тест недоступен — честно говорим об этом, ставим unverified.
      return {
        ok: true,
        unverified: true,
        message: opts.noProbeReason
          ?? `Учётные данные сохранены. Автоматический тест соединения для этого провайдера недоступен — реальная проверка произойдёт при первом использовании.`,
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

// ASCAP/BMI не имеют публичного API — реальный тест невозможен.
// Поэтому отмечаем unverified, не врём про "Подключено".
export const ascapConnector = createApiConnector({
  code: "ascap",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
  noProbeReason: "ASCAP не предоставляет публичного API для проверки ключа. Сохранено, но автоматически не протестировано.",
});

export const bmiConnector = createApiConnector({
  code: "bmi",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
  noProbeReason: "BMI не предоставляет публичного API для проверки ключа. Сохранено, но автоматически не протестировано.",
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
// DSP — API-коннекторы
// ──────────────────────────────────────────────

// Deezer Connect использует authorization-code OAuth flow, который
// требует браузерного редиректа. Server-side нельзя проверить app_id и
// secret_key без user-токена. Ранее код стучал в публичный /chart endpoint,
// который НЕ ИСПОЛЬЗУЕТ ключи — это было ложное "ok=true". Чиним.
export const deezerConnector = createApiConnector({
  code: "deezer",
  authType: "oauth2",
  requiredFields: [
    { key: "app_id", label: "App ID" },
    { key: "secret_key", label: "Secret Key" },
  ],
  noProbeReason: "Deezer Connect использует OAuth с браузерным редиректом. App ID и Secret Key нельзя проверить server-side — реальная авторизация произойдёт при первом OAuth flow от пользователя.",
});

// Apple Music использует подписанный JWT (ES256, ключ .p8 от Apple Developer).
// Мы можем РЕАЛЬНО подписать тестовый JWT и стукнуть в API — если ключи
// неверные, Apple вернёт 401.
export const appleMusicConnector = createApiConnector({
  code: "apple_music",
  authType: "api_key", // ES256 JWT — формально не oauth2
  requiredFields: [
    { key: "team_id", label: "Team ID" },
    { key: "key_id", label: "Key ID" },
    { key: "private_key", label: "Private Key (.p8)" },
  ],
  async probe(creds) {
    if (!creds.private_key.includes("BEGIN PRIVATE KEY") && !creds.private_key.includes("BEGIN EC PRIVATE KEY")) {
      return { ok: false, message: "Private Key должен быть в PEM-формате (содержимое .p8 файла от Apple Developer)" };
    }
    // Подписываем JWT ES256.
    let jwt: string;
    try {
      const header = { alg: "ES256", kid: creds.key_id, typ: "JWT" };
      const now = Math.floor(Date.now() / 1000);
      const payload = { iss: creds.team_id, iat: now, exp: now + 600 };
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const signingInput = `${b64(header)}.${b64(payload)}`;
      const sig = crypto.sign("SHA256", Buffer.from(signingInput), {
        key: creds.private_key,
        dsaEncoding: "ieee-p1363", // важно для ES256, иначе Apple не примет
      });
      jwt = `${signingInput}.${sig.toString("base64url")}`;
    } catch (e) {
      return { ok: false, message: `Не удалось подписать JWT: ${(e as Error).message}. Проверьте, что Private Key — это валидный .p8 от Apple.` };
    }
    // Probe: /v1/storefronts — стабильный публичный list-эндпоинт, который
    // ВСЕГДА возвращает 200 при валидном Developer JWT. НЕ используем
    // /catalog/songs/{id}, потому что Apple может удалить любой конкретный
    // трек, и тогда 404 для битого ключа дал бы ложное "подключено".
    const res = await fetch("https://api.music.apple.com/v1/storefronts?limit=1", {
      headers: { Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) {
      return { ok: false, message: "Apple Music отклонил JWT (401). Проверьте Team ID, Key ID и .p8 ключ — все три должны быть от одного аккаунта Apple Developer." };
    }
    if (res.status === 200) {
      return { ok: true, message: `Apple MusicKit JWT валиден (Team ID ${creds.team_id}, Key ID ${creds.key_id}).` };
    }
    return { ok: false, message: `Apple Music вернул неожиданный HTTP ${res.status} (ожидался 200 или 401).` };
  },
});

// YouTube Music API на самом деле — YouTube Data v3 с пользовательским OAuth.
// Server-side client_credentials Google не выдаёт для пользовательских данных.
export const youtubeMusicConnector = createApiConnector({
  code: "youtube_music",
  authType: "oauth2",
  requiredFields: [
    { key: "client_id", label: "Client ID" },
    { key: "client_secret", label: "Client Secret" },
  ],
  noProbeReason: "Google OAuth требует браузерного flow для получения user consent. Client ID/Secret нельзя проверить server-side — реальная авторизация при первом подключении пользователя.",
});

// TikTok for Developers — авторизация требует user consent через redirect.
export const tiktokMusicConnector = createApiConnector({
  code: "tiktok_music",
  authType: "oauth2",
  requiredFields: [
    { key: "client_key", label: "Client Key" },
    { key: "client_secret", label: "Client Secret" },
  ],
  noProbeReason: "TikTok OAuth требует браузерного flow с user consent. Client Key/Secret нельзя проверить server-side — реальная проверка при первом OAuth-цикле.",
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
    if (!res.ok) return { ok: false, message: `VK API вернул HTTP ${res.status}` };
    const json = await res.json() as { error?: { error_code: number; error_msg?: string }; response?: unknown[] };
    if (json.error) {
      // VK error_code 5 = user authorization failed (bad token); 28 = app blocked; 17 = validation required.
      // Любая VK-ошибка означает, что токен НЕ работает.
      const code = json.error.error_code;
      const msg = json.error.error_msg ?? "unknown";
      return { ok: false, message: `VK отклонил ключ (error_code=${code}): ${msg}` };
    }
    if (Array.isArray(json.response) && json.response.length > 0) {
      return { ok: true, message: "VK API доступен, токен валиден." };
    }
    // Нет ни response, ни error — нештатная ситуация, не считаем успехом.
    return { ok: false, message: "VK API вернул неожиданный ответ (ни response, ни error)." };
  },
});

// Yandex Music и Zvuk — нет официальных публичных API с проверкой ключа.
export const yandexMusicConnector = createApiConnector({
  code: "yandex_music",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
  noProbeReason: "Яндекс Музыка не предоставляет публичного API для проверки ключа партнёра. Сохранено, реальная проверка — через ЛК партнёра Яндекс.",
});

export const zvukConnector = createApiConnector({
  code: "zvuk",
  authType: "api_key",
  requiredFields: [{ key: "api_key", label: "API Key" }],
  noProbeReason: "Звук (СберЗвук) не предоставляет публичного API для проверки ключа партнёра. Реальная проверка — при доставке релиза.",
});

// ──────────────────────────────────────────────
// STORAGE (S3-совместимое — Cloudflare R2, AWS S3)
// ──────────────────────────────────────────────

/** SigV4 signing для S3-совместимых HEAD-запросов. */
async function s3HeadBucket(opts: {
  endpoint: string;       // e.g. https://abcdef.r2.cloudflarestorage.com
  region: string;         // "auto" для R2, реальный регион для AWS
  service: string;        // "s3"
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  timeoutMs?: number;
}): Promise<{ status: number; body: string }> {
  const url = new URL(`${opts.endpoint}/${encodeURIComponent(opts.bucket)}?list-type=2&max-keys=1`);
  const host = url.host;
  const method = "GET";
  const path = url.pathname;
  const query = url.search.slice(1);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash("sha256").update("").digest("hex");

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const kDate = crypto.createHmac("sha256", `AWS4${opts.secretAccessKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(opts.region).digest();
  const kService = crypto.createHmac("sha256", kRegion).update(opts.service).digest();
  const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: authHeader,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
    },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
  });
  const body = await res.text();
  return { status: res.status, body };
}

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
    // Anti-SSRF: account_id попадает в URL — должен быть hex-строкой Cloudflare.
    if (!/^[a-f0-9]{32}$/i.test(creds.account_id.trim())) {
      return { ok: false, message: `Account ID должен быть 32-символьной hex-строкой Cloudflare (вы ввели "${creds.account_id}").` };
    }
    if (!/^[a-z0-9.-]{3,63}$/.test(creds.bucket.trim())) {
      return { ok: false, message: `Bucket name содержит недопустимые символы.` };
    }
    try {
      const { status, body } = await s3HeadBucket({
        endpoint: `https://${creds.account_id}.r2.cloudflarestorage.com`,
        region: "auto",
        service: "s3",
        accessKeyId: creds.access_key_id,
        secretAccessKey: creds.secret_access_key,
        bucket: creds.bucket,
      });
      if (status === 200) return { ok: true, message: `Cloudflare R2: bucket "${creds.bucket}" доступен, ключи валидны.` };
      if (status === 403) return { ok: false, message: `R2 вернул 403 — Access Key ID или Secret неверны (или нет прав на bucket).` };
      if (status === 404) return { ok: false, message: `R2 вернул 404 — bucket "${creds.bucket}" не существует в этом аккаунте.` };
      // Любой другой код — НЕ считаем успехом, показываем как есть.
      return { ok: false, message: `R2 вернул HTTP ${status}: ${body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, message: `Ошибка подключения к Cloudflare R2: ${(e as Error).message}` };
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
  async probe(creds) {
    if (!/^[a-z]{2}-[a-z]+-\d$/.test(creds.region.trim())) {
      return { ok: false, message: `Region должен быть в формате AWS, например us-east-1 (вы ввели "${creds.region}").` };
    }
    if (!/^[a-z0-9.-]{3,63}$/.test(creds.bucket.trim())) {
      return { ok: false, message: `Bucket name содержит недопустимые символы.` };
    }
    try {
      const { status, body } = await s3HeadBucket({
        endpoint: `https://s3.${creds.region}.amazonaws.com`,
        region: creds.region,
        service: "s3",
        accessKeyId: creds.access_key_id,
        secretAccessKey: creds.secret_access_key,
        bucket: creds.bucket,
      });
      if (status === 200) return { ok: true, message: `AWS S3: bucket "${creds.bucket}" доступен, ключи валидны.` };
      if (status === 403) return { ok: false, message: `AWS S3 вернул 403 — Access Key ID или Secret неверны (или нет прав).` };
      if (status === 404) return { ok: false, message: `AWS S3 вернул 404 — bucket "${creds.bucket}" не существует в регионе ${creds.region}.` };
      if (status === 301) return { ok: false, message: `AWS S3 вернул 301 — bucket "${creds.bucket}" находится в другом регионе.` };
      return { ok: false, message: `AWS S3 вернул HTTP ${status}: ${body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, message: `Ошибка подключения к AWS S3: ${(e as Error).message}` };
    }
  },
});
