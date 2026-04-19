/**
 * Эталонная OAuth-2.0 реализация для Spotify (Client Credentials Flow).
 *
 * Что нужно от площадки:
 *   - Регистрация приложения на https://developer.spotify.com/dashboard
 *   - client_id + client_secret
 *   - Для статистики (Spotify for Artists API) — отдельный партнёрский статус,
 *     обычные приложения дают только публичные данные о треках/артистах.
 *
 * Этот файл — рабочий пример. Когда у тебя появятся ключи — просто вставляешь
 * их через UI и testConnection() их проверит.
 */

import type { IConnector, ConnectorContext, ConnectorResult } from "./base";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";

async function getAccessToken(clientId: string, clientSecret: string): Promise<{ token: string; expiresIn: number }> {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Spotify auth failed (${res.status}): ${txt}`);
  }
  const json = await res.json() as { access_token: string; expires_in: number };
  return { token: json.access_token, expiresIn: json.expires_in };
}

export const spotifyConnector: IConnector = {
  code: "spotify",
  authType: "oauth2",

  async testConnection(ctx: ConnectorContext): Promise<ConnectorResult> {
    const clientId = ctx.credentials.client_id;
    const clientSecret = ctx.credentials.client_secret;
    if (!clientId || !clientSecret) {
      return { ok: false, message: "Не заполнены client_id или client_secret" };
    }
    try {
      const { token, expiresIn } = await getAccessToken(clientId, clientSecret);
      // Делаем тестовый запрос — забираем популярного артиста (Drake)
      const verifyRes = await fetch(`${SPOTIFY_API}/artists/3TVXtAsR1Inumwj472S9r4`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!verifyRes.ok) {
        return { ok: false, message: `API недоступен (${verifyRes.status})` };
      }
      return {
        ok: true,
        message: `Соединение установлено. Токен валиден ${expiresIn} сек.`,
        data: { tokenLength: token.length, expiresIn },
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Unknown error" };
    }
  },

  async refreshToken(ctx: ConnectorContext) {
    const clientId = ctx.credentials.client_id;
    const clientSecret = ctx.credentials.client_secret;
    if (!clientId || !clientSecret) return { ok: false, message: "Нет client credentials" };
    try {
      const { token, expiresIn } = await getAccessToken(clientId, clientSecret);
      return {
        ok: true,
        accessToken: token,
        expiresAt: new Date(Date.now() + (expiresIn - 60) * 1000),
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Unknown error" };
    }
  },

  async syncStats(_ctx, _daysBack) {
    // Spotify for Artists API требует партнёрского доступа.
    // Возвращаем пустой набор — эндпоинт сработает успешно, но данных не будет.
    return {
      ok: true,
      rows: [],
      message: "Spotify Streaming API доступен только партнёрам (Spotify for Artists). Без него получаем 0 строк.",
    };
  },
};
