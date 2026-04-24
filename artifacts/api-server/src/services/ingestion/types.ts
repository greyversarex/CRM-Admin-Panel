// Унифицированная "плоская" строка после парсинга — общая для всех DSP.
// Один CSV-файл → массив ParsedRow → дальше service.ts матчит по ISRC и
// раскладывает в transactions / usage_reports / ingestion_unmatched.
export interface ParsedRow {
  /** ISRC трека из колонки CSV (нормализован к UPPERCASE без дефисов). null если пусто/мусор. */
  isrc: string | null;
  /** Название трека, как пришло в CSV — для человекочитаемой колонки в unmatched. */
  title: string | null;
  /** Имя артиста — аналогично, только для unmatched-листинга. */
  artist: string | null;
  /** ISO 3166-1 alpha-2 (UPPERCASE) или null если не указано (агрегат «World»). */
  countryCode: string | null;
  /** Стримы/прослушивания/views — приводим к integer ≥ 0. */
  streams: number;
  /** Чистый доход для правообладателя в `currency` (после комиссии DSP). Может быть отрицательным (refund). */
  revenue: number;
  /** ISO 4217 (UPPERCASE). По умолчанию USD если в CSV не указано (свойственно YouTube/TikTok). */
  currency: string;
  /** Период в формате YYYY-MM. Берётся из CSV или из аргумента commit'а как fallback. */
  period: string;
  /** Сырая строка CSV для дебага (попадает в unmatched.raw* и в логи). */
  raw: Record<string, string>;
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Сколько строк CSV полностью невалидны (нет ни одной нужной колонки или сумма не парсится). */
  invalidRows: number;
  /** Не-фатальные предупреждения для UI: «period не найден», «strange currency», и т.п. */
  warnings: string[];
  /** Период по умолчанию (если parser смог извлечь из имени файла или из строк). */
  detectedPeriod: string | null;
  /** Денежная валюта, доминирующая в файле. */
  detectedCurrency: string | null;
}

/** Тип DSP — должен совпадать с enum в integrations + БД (см. integrations-seed.ts). */
export type SupportedDsp = "spotify" | "apple_music" | "youtube_music" | "tiktok";
