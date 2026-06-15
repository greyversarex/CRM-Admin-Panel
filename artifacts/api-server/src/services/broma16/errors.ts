/**
 * Типы ошибок Broma16 (ROD API). Разделены на отдельные классы, чтобы
 * вызывающий код мог по-разному реагировать:
 *   - Broma16ConfigError    — нет email/password (интеграция не настроена)
 *   - Broma16AuthError      — не удалось авторизоваться даже после refresh/login
 *   - Broma16ValidationError — 422 (читаемый текст + поля)
 *   - Broma16ApiError       — любой другой не-2xx ответ
 */

export class Broma16ConfigError extends Error {
  constructor(message = "Broma16 не настроен: укажите email и пароль в настройках интеграции или в переменных окружения BROMA16_EMAIL / BROMA16_PASSWORD.") {
    super(message);
    this.name = "Broma16ConfigError";
  }
}

export class Broma16AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Broma16AuthError";
  }
}

export class Broma16ValidationError extends Error {
  /** Поля с ошибками (как вернул Broma16), для отображения пользователю. */
  readonly fields: Record<string, string[]>;
  readonly status = 422;
  constructor(message: string, fields: Record<string, string[]> = {}) {
    super(message);
    this.name = "Broma16ValidationError";
    this.fields = fields;
  }
}

export class Broma16ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "Broma16ApiError";
    this.status = status;
  }
}
