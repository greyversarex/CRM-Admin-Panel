/**
 * Базовый интерфейс коннектора. Все площадки (Spotify, VK, DDEX-партнёры и т.д.)
 * наследуются от него. Это позволяет добавить новую интеграцию = создать один файл.
 *
 * Жизненный цикл коннектора:
 *   1) Пользователь вводит креды в UI → POST /integrations/:code/connect → save()
 *   2) UI жмёт "Тест" → testConnection() — пробуем достучаться
 *   3) Шедулер раз в N часов → syncStats() — забираем статистику
 *   4) Когда отгружаем релиз → deliverRelease(release) — для DDEX/SFTP коннекторов
 *   5) Если OAuth — refreshToken() обновляет access_token до истечения
 */

export type ConnectorContext = {
  /** Расшифрованные значения полей формы (api_key, client_secret, host, etc.) */
  credentials: Record<string, string>;
  /** Ненастроечные данные интеграции (custom config из БД) */
  config: Record<string, unknown>;
};

export type ConnectorResult = {
  ok: boolean;
  message?: string;
  data?: Record<string, unknown>;
};

export type DeliveryPayload = {
  releaseId: number;
  upc: string;
  title: string;
  artist: string;
  releaseDate: string;
  tracks: Array<{ isrc: string; title: string; duration: number; audioUrl: string }>;
  artworkUrl: string;
};

export type StatsRow = {
  isrc: string;
  date: string;     // YYYY-MM-DD
  streams: number;
  revenue: number;  // USD
  country?: string;
};

export interface IConnector {
  /** Уникальный код, совпадает с фронтовым ID (spotify, vk_music, ddex_main) */
  readonly code: string;
  /** oauth2 | api_key | sftp | none */
  readonly authType: "oauth2" | "api_key" | "sftp" | "none";

  /** Проверка соединения с площадкой. Должна не зависеть от данных. */
  testConnection(ctx: ConnectorContext): Promise<ConnectorResult>;

  /** Забор статистики (стримы, доход) за последние N дней. Опционально. */
  syncStats?(ctx: ConnectorContext, daysBack: number): Promise<{ ok: boolean; rows: StatsRow[]; message?: string }>;

  /** Доставка релиза (для DDEX-коннекторов). Опционально. */
  deliverRelease?(ctx: ConnectorContext, payload: DeliveryPayload): Promise<ConnectorResult>;

  /** Обновление access_token (для OAuth). Опционально. */
  refreshToken?(ctx: ConnectorContext): Promise<{ ok: boolean; accessToken?: string; expiresAt?: Date; message?: string }>;
}
