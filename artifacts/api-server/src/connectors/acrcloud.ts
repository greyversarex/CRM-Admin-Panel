/**
 * ACRCloud Audio & Video Recognition коннектор.
 *
 * Аутентификация: HMAC-SHA1 (access_key + access_secret + host).
 *
 * ВАЖНО: ACRCloud при неверных ключах отвечает HTTP 200 с JSON-ошибкой
 * вида {"status":{"code":3001,"msg":"Invalid Access Key"}}, а не 401/403.
 * Поэтому нельзя ориентироваться только на HTTP-код — нужно читать
 * status.code из тела.
 *
 * Известные коды (https://docs.acrcloud.com/docs/acrcloud/error-codes):
 *   0     — успех (трек найден)
 *   1001  — результата нет (ключи валидны, просто не нашли матч)
 *   2004  — невозможно построить отпечаток (тоже значит ключи валидны)
 *   3001  — Invalid Access Key
 *   3002  — Invalid ContentType
 *   3003  — Limit exceeded (тоже валидные ключи, просто кончилась квота)
 *   3014  — Invalid Signature (неверный access_secret)
 *   3015  — Could not generate fingerprint
 *   3016  — Other Error (часто — неверный sigVersion или формат запроса)
 */

import crypto from "crypto";
import type { IConnector, ConnectorContext, ConnectorResult } from "./base";

function buildSignature(
  method: string,
  uri: string,
  accessKey: string,
  dataType: string,
  sigVersion: string,
  timestamp: string,
  accessSecret: string,
): string {
  const stringToSign = [method, uri, accessKey, dataType, sigVersion, timestamp].join("\n");
  return crypto.createHmac("sha1", accessSecret).update(stringToSign).digest("base64");
}

export const acrcloudConnector: IConnector = {
  code: "acrcloud",
  authType: "api_key",

  async testConnection(ctx: ConnectorContext): Promise<ConnectorResult> {
    const { access_key, access_secret, host } = ctx.credentials;
    if (!access_key || !access_secret) {
      return { ok: false, message: "Не заполнены Access Key или Access Secret" };
    }

    const resolvedHost = (host || "identify-eu-west-1.acrcloud.com").replace(/^https?:\/\//, "").trim();

    // Anti-SSRF: разрешаем только официальные хосты ACRCloud. Без этого
    // host из credentials мог бы указывать на внутренний сервис.
    if (!/^[a-z0-9-]+\.acrcloud\.com$/i.test(resolvedHost)) {
      return {
        ok: false,
        message: `Host "${resolvedHost}" не похож на ACRCloud-эндпоинт. Используйте *.acrcloud.com (например, identify-eu-west-1.acrcloud.com).`,
      };
    }
    const uri = "/v1/identify";
    const dataType = "audio";
    const sigVersion = "1";
    const timestamp = String(Math.floor(Date.now() / 1000));

    const signature = buildSignature("POST", uri, access_key, dataType, sigVersion, timestamp, access_secret);

    const form = new FormData();
    form.append("access_key", access_key);
    form.append("data_type", dataType);
    form.append("signature_version", sigVersion);
    form.append("signature", signature);
    form.append("sample_bytes", "0");
    form.append("timestamp", timestamp);
    // Пустой «аудио»-файл — сервер вернёт 400 (no audio), но не 401 (bad creds)
    form.append("sample", new Blob([]), "test.wav");

    try {
      const res = await fetch(`https://${resolvedHost}${uri}`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(10_000),
      });

      // HTTP 401/403 — гарантированно неверные ключи (но ACRCloud редко так
      // отвечает, обычно 200 с JSON-ошибкой; см. блок ниже).
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: `Неверные ключи (HTTP ${res.status}). Проверьте Access Key и Access Secret.` };
      }

      // Пробуем прочитать тело — ACRCloud всегда отвечает JSON.
      let body: unknown = null;
      const text = await res.text();
      try { body = JSON.parse(text); } catch { /* не JSON */ }

      const status = (body as { status?: { code?: number; msg?: string } } | null)?.status;
      const code = status?.code;
      const msg = status?.msg ?? "";

      // Нет JSON-ответа — это нештатный кейс (часто плохой host: вместо
      // ACRCloud отвечает CDN/прокси). Тело сюда не возвращаем, чтобы не
      // сделать канал утечки внутренних ответов через UI.
      if (code === undefined) {
        return {
          ok: false,
          message: `Неожиданный ответ от ${resolvedHost} (HTTP ${res.status}, не JSON). Проверьте Host.`,
        };
      }

      // Ошибки авторизации — ACRCloud отдаёт их HTTP 200 с status.code 3001/3002/3014.
      if (code === 3001) {
        return { ok: false, message: `ACRCloud: неверный Access Key (${msg}).` };
      }
      if (code === 3014 || code === 3002) {
        return { ok: false, message: `ACRCloud: неверный Access Secret или подпись (${msg}, code=${code}).` };
      }

      // 0 — нашёл трек (с пустым сэмплом не бывает, но на всякий случай).
      // 1001 — нет результата (валидные ключи).
      // 2004 — не смог построить отпечаток (ожидаемо для пустого сэмпла, ключи валидны).
      // 3003 — лимит квоты (ключи валидны, просто кончился пакет — предупреждаем, но ok).
      if (code === 0 || code === 1001 || code === 2004) {
        return {
          ok: true,
          message: `Соединение с ${resolvedHost} установлено. Ключи валидны.`,
          data: { host: resolvedHost, acrCode: code },
        };
      }
      if (code === 3003) {
        return {
          ok: true,
          message: `Ключи валидны, но превышена квота ACRCloud (${msg}). Подключение работает.`,
          data: { host: resolvedHost, acrCode: code, warning: "quota_exceeded" },
        };
      }

      // Любой другой код — считаем подключение нерабочим, показываем как есть.
      return {
        ok: false,
        message: `ACRCloud отказал: ${msg || "unknown"} (code=${code}).`,
        data: { host: resolvedHost, acrCode: code },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return { ok: false, message: `Ошибка подключения к ${resolvedHost}: ${msg}` };
    }
  },
};
