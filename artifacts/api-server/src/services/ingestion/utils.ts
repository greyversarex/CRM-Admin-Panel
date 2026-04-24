// Общие helpers для всех парсеров — нормализация ISRC/страны/чисел.

// Hard cap: максимум строк, которые парсер обработает из одного CSV.
// 200K строк ≈ ~30МБ типичного CSV. Защита от RAM-DoS через большой файл.
// Если CSV содержит больше — парсер бросит ошибку с 413-семантикой.
export const MAX_PARSED_ROWS = 200_000;

export class TooManyRowsError extends Error {
  constructor(public readonly totalRows: number) {
    super(`CSV содержит ${totalRows} строк, лимит ${MAX_PARSED_ROWS}. Разбейте файл на части.`);
    this.name = "TooManyRowsError";
  }
}

// Либеральный ISRC: начинается с 2 букв (CountryCode), дальше alphanumeric, длина 10-20.
// Стандарт ISO 3901 — ровно 12 символов (CC2+Reg3+YR2+Des5), но реальные DSP/seed-данные
// часто используют 13-символьные внутренние идентификаторы. Матчинг всё равно идёт по
// equality в БД — мусорный ISRC просто не найдёт трек, поэтому валидация — только cleanup.
const ISRC_RX = /^[A-Z]{2}[A-Z0-9]{8,18}$/;

export function normIsrc(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = String(raw).trim().toUpperCase().replace(/[-\s]/g, "");
  if (!v) return null;
  return ISRC_RX.test(v) ? v : null;
}

export function normCountry(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = String(raw).trim().toUpperCase();
  // Спец-агрегаты разных DSP, означающие «нет страны».
  if (!v || v === "WORLD" || v === "WW" || v === "ZZ" || v === "GLOBAL" || v === "UNKNOWN") return null;
  // Нам нужен именно ISO-2. Apple иногда даёт ISO-3 — режем (берём первые 2),
  // но только если строка ровно 3 заглавных букв.
  if (/^[A-Z]{2}$/.test(v)) return v;
  if (/^[A-Z]{3}$/.test(v)) return v.slice(0, 2);
  return null;
}

/** Парсит число из CSV: убирает пробелы/запятые-разделители, разрешает скобки = отрицательное. */
export function parseNumber(raw: string | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) { neg = true; s = s.slice(1, -1); }
  // Стандартизуем: 1,234.56 → 1234.56  (англ. формат). Русские "1 234,56" тоже терпим.
  s = s.replace(/\s/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Считаем что запятая — тысячный разделитель.
    s = s.replace(/,/g, "");
  } else if (hasComma && !hasDot) {
    // Только запятая → десятичный.
    s = s.replace(/,/g, ".");
  }
  // Убираем символы валюты ($, €, и т.п.) и любые остаточные не-числа.
  s = s.replace(/[^\d.\-]/g, "");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

export function parseInteger(raw: string | undefined | null): number {
  const n = parseNumber(raw);
  return Math.max(0, Math.trunc(n));
}

/** Принимает 2026-03, 2026-3, 03/2026, Mar 2026 → возвращает "YYYY-MM" или null. */
export function normPeriod(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // 2026-03 / 2026-3 / 2026.03
  const m1 = /^(\d{4})[-./](\d{1,2})/.exec(s);
  if (m1) {
    const y = m1[1], m = m1[2].padStart(2, "0");
    if (+m >= 1 && +m <= 12) return `${y}-${m}`;
  }
  // 03/2026 или 3-2026
  const m2 = /^(\d{1,2})[/.\-](\d{4})$/.exec(s);
  if (m2) {
    const m = m2[1].padStart(2, "0"), y = m2[2];
    if (+m >= 1 && +m <= 12) return `${y}-${m}`;
  }
  // 202603 (YouTube format)
  const m3 = /^(\d{4})(\d{2})$/.exec(s);
  if (m3 && +m3[2] >= 1 && +m3[2] <= 12) return `${m3[1]}-${m3[2]}`;
  // Mar 2026 / March 2026
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const m4 = /^([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (m4) {
    const k = m4[1].slice(0, 3).toLowerCase();
    if (months[k]) return `${m4[2]}-${months[k]}`;
  }
  return null;
}

/** Сжимает массив в "доминирующий" период / валюту (mode), null если пусто. */
export function dominantValue<T>(items: T[], pick: (x: T) => string | null | undefined): string | null {
  const counts = new Map<string, number>();
  for (const it of items) {
    const v = pick(it);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return best;
}
