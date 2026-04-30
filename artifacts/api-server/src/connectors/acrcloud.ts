/**
 * ACRCloud Audio & Video Recognition коннектор.
 *
 * Аутентификация: HMAC-SHA1 (access_key + access_secret + host).
 * Для теста соединения шлём пустой identify-запрос:
 *   - 400 → ключи валидны (сервер принял запрос, но нет аудио) ✓
 *   - 401 / 403 → неверные ключи ✗
 *   - network error → неверный host ✗
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

    const resolvedHost = (host || "identify-eu-west-1.acrcloud.com").replace(/^https?:\/\//, "");
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

      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: `Неверные ключи (HTTP ${res.status}). Проверьте Access Key и Access Secret.` };
      }

      // 400 (no audio) или 200 означает, что ключи приняты сервером
      if (res.status === 400 || res.ok) {
        return {
          ok: true,
          message: `Соединение с ${resolvedHost} установлено. Ключи валидны.`,
          data: { host: resolvedHost, httpStatus: res.status },
        };
      }

      return { ok: false, message: `Неожиданный ответ от ACRCloud (HTTP ${res.status})` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return { ok: false, message: `Ошибка подключения к ${resolvedHost}: ${msg}` };
    }
  },
};
