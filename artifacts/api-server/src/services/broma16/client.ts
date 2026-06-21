/**
 * HTTP-клиент Broma16 (ROD API).
 *
 *  - Базовый URL: BROMA16_API_URL (по умолчанию https://api-rod.broma16.ru/api)
 *  - Авторизация: JWT в заголовке X-Access-Token
 *  - При 401 — автоматический refresh (или повторный login) и один ретрай
 *  - Успешный ответ: { status: "ok", data: ... } → возвращаем data
 *  - 422 → Broma16ValidationError с читаемым текстом и полями
 *
 * Токены кэшируются в памяти на время жизни экземпляра и персистятся в БД
 * (см. credentials.ts). Создавайте клиент через createBroma16Client().
 */

import { logger } from "../../lib/logger";
import {
  Broma16ApiError,
  Broma16AuthError,
  Broma16ConfigError,
  Broma16ValidationError,
} from "./errors";
import {
  getBroma16Credentials,
  getStoredAccountId,
  getStoredTokens,
  saveTokens,
  setStoredAccountId,
} from "./credentials";

const DEFAULT_BASE_URL = "https://api-rod.broma16.ru/api";
const REQUEST_TIMEOUT_MS = 30_000;
/** За сколько до истечения токена считаем его "пора обновить". */
const TOKEN_REFRESH_SKEW_MS = 60_000;

function baseUrl(): string {
  return (process.env.BROMA16_API_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

type RequestOptions = {
  /** JSON-тело (взаимоисключимо с form). */
  body?: unknown;
  /** multipart/form-data тело. */
  form?: FormData;
  /** Query-параметры. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Не пытаться авторизоваться (для самого login/refresh). */
  skipAuth?: boolean;
  /** Внутренний флаг — это уже повторная попытка после 401. */
  _retry?: boolean;
};

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(baseUrl() + (path.startsWith("/") ? path : `/${path}`));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/** Превращает 422-тело Broma16 в читаемое сообщение + карту полей. */
function parseValidationErrors(payload: unknown): { message: string; fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};
  const body = (payload ?? {}) as Record<string, unknown>;
  // Broma16 обычно отдаёт { status:"error", errors:{ field:[msg,...] } } или { message }
  const rawErrors = (body.errors ?? body.data ?? {}) as Record<string, unknown>;
  if (rawErrors && typeof rawErrors === "object" && !Array.isArray(rawErrors)) {
    for (const [field, msgs] of Object.entries(rawErrors)) {
      if (Array.isArray(msgs)) fields[field] = msgs.map((m) => String(m));
      else if (msgs != null) fields[field] = [String(msgs)];
    }
  }
  const parts = Object.entries(fields).map(([f, msgs]) => `${f}: ${msgs.join("; ")}`);
  const message =
    parts.length > 0
      ? parts.join(" | ")
      : typeof body.message === "string"
        ? body.message
        : "Broma16: ошибка валидации (422)";
  return { message, fields };
}

export class Broma16Client {
  private accessToken: string | null = null;
  private refreshTokenValue: string | null = null;
  private expiresAt: Date | null = null;
  private accountId: string | null = null;
  private initialized = false;

  /** Подгружает токены/account_id из БД. Вызывается автоматически. */
  async init(): Promise<void> {
    if (this.initialized) return;
    const tokens = await getStoredTokens();
    this.accessToken = tokens.accessToken;
    this.refreshTokenValue = tokens.refreshToken;
    this.expiresAt = tokens.expiresAt;
    this.accountId = await getStoredAccountId();
    this.initialized = true;
  }

  private tokenIsFresh(): boolean {
    if (!this.accessToken) return false;
    if (!this.expiresAt) return true; // срок неизвестен — используем, обновим по 401
    return this.expiresAt.getTime() > Date.now() + TOKEN_REFRESH_SKEW_MS;
  }

  private async ensureToken(): Promise<void> {
    await this.init();
    if (this.tokenIsFresh()) return;
    if (this.refreshTokenValue) {
      try {
        await this.refresh();
        return;
      } catch (e) {
        logger.warn({ err: (e as Error).message }, "[broma16] refresh не удался, пробую login");
      }
    }
    await this.login();
  }

  /** Авторизация по email/password. */
  async login(): Promise<void> {
    const creds = await getBroma16Credentials();
    if (!creds) throw new Broma16ConfigError();
    const res = await fetch(buildUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await this.applyTokenResponse(res, "login");
    logger.info("[broma16] успешная авторизация (login)");
  }

  /** Обновление access_token по refresh_token. */
  async refresh(): Promise<void> {
    await this.init();
    if (!this.refreshTokenValue) throw new Broma16AuthError("Broma16: нет refresh_token для обновления");
    const res = await fetch(buildUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh_token: this.refreshTokenValue }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await this.applyTokenResponse(res, "refresh");
  }

  private async applyTokenResponse(res: Response, op: "login" | "refresh"): Promise<void> {
    const text = await res.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      if (res.status === 422) {
        const { message, fields } = parseValidationErrors(payload);
        throw new Broma16ValidationError(message, fields);
      }
      const msg = typeof payload.message === "string" ? payload.message : `HTTP ${res.status}`;
      throw new Broma16AuthError(`Broma16 ${op}: ${msg}`);
    }
    const data = (payload.data ?? payload) as Record<string, unknown>;
    const accessToken = (data.access_token ?? data.token) as string | undefined;
    const refreshToken = (data.refresh_token ?? this.refreshTokenValue) as string | undefined;
    const expiresIn = data.expires_in;
    if (!accessToken) throw new Broma16AuthError(`Broma16 ${op}: в ответе нет access_token`);
    this.accessToken = accessToken;
    this.refreshTokenValue = refreshToken ?? null;
    this.expiresAt =
      typeof expiresIn === "number" && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;
    await saveTokens({
      accessToken: this.accessToken,
      refreshToken: this.refreshTokenValue,
      expiresAt: this.expiresAt,
    });
  }

  private async doFetch(method: string, path: string, opts: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (!opts.skipAuth && this.accessToken) headers["X-Access-Token"] = this.accessToken;

    let body: string | FormData | undefined;
    if (opts.form) {
      body = opts.form; // fetch сам проставит multipart boundary
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    return fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  /** Базовый запрос с авто-refresh и одним ретраем по 401. */
  async request<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    if (!opts.skipAuth) await this.ensureToken();

    let res = await this.doFetch(method, path, opts);

    if (res.status === 401 && !opts.skipAuth && !opts._retry) {
      logger.info("[broma16] 401 — обновляю токен и повторяю запрос");
      try {
        await this.refresh();
      } catch {
        await this.login();
      }
      res = await this.doFetch(method, path, { ...opts, _retry: true });
    }

    return this.parseResponse<T>(res);
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    const text = await res.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      if (!res.ok) throw new Broma16ApiError(res.status, `Broma16: HTTP ${res.status}`);
      return text as unknown as T;
    }

    if (res.status === 422) {
      const { message, fields } = parseValidationErrors(payload);
      throw new Broma16ValidationError(message, fields);
    }
    if (res.status === 401) {
      throw new Broma16AuthError("Broma16: не авторизован (401) даже после обновления токена");
    }
    if (!res.ok) {
      const msg = typeof payload.message === "string" ? payload.message : `HTTP ${res.status}`;
      throw new Broma16ApiError(res.status, `Broma16: ${msg}`);
    }
    if (payload.status && String(payload.status).toLowerCase() !== "ok") {
      const msg = typeof payload.message === "string" ? payload.message : "Broma16 вернул статус != ok";
      throw new Broma16ApiError(res.status, msg);
    }
    return (payload.data ?? payload) as T;
  }

  /** Возвращает account_id, при необходимости запрашивая /user/. */
  async getAccountId(): Promise<string> {
    await this.init();
    if (this.accountId) return this.accountId;
    return this.fetchAccountId();
  }

  private async fetchAccountId(): Promise<string> {
    const data = await this.request<Record<string, unknown>>("GET", "/user/");
    const accounts = data.accounts as Array<Record<string, unknown>> | undefined;
    const accountId = data.account_id ?? data.accountId ?? (accounts && accounts[0]?.id);
    if (accountId == null) throw new Broma16ApiError(0, "Broma16: не удалось получить account_id из /user/");
    this.accountId = String(accountId);
    await setStoredAccountId(this.accountId);
    return this.accountId;
  }
}

/** Создаёт и инициализирует клиент Broma16. */
export async function createBroma16Client(): Promise<Broma16Client> {
  const client = new Broma16Client();
  await client.init();
  return client;
}
