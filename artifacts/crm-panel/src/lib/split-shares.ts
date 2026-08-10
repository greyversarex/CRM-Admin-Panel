/**
 * Автораспределение долей между участниками SplitShare.
 *
 * Правило одно: доли, выставленные руками, неприкосновенны, а остаток до 100%
 * поровну делится между теми, кого не трогали. Поэтому у каждой строки есть
 * признак «задана вручную»: без него любая правка сбивала бы уже согласованные
 * цифры.
 *
 * Как это выглядит в работе:
 *   один участник               → 100
 *   добавили второго            → 50 / 50
 *   первому поставили 70        → 70 / 30
 *   добавили третьего           → 70 / 15 / 15
 *   второму поставили 40        → 70 / 40 / -10 → остаток отрицательный,
 *                                 автоматические уходят в 0, сумма покажет
 *                                 перебор, и это видно на экране
 *
 * Считаем в сотых долях процента (целых числах), чтобы сумма всегда получалась
 * ровно 100, а не 99.99 из-за дробей вроде 100/3.
 */

export type ShareRow = { percentage: number; locked: boolean };

const TOTAL_CENTS = 10_000; // 100.00% в сотых

const toCents = (percentage: number) =>
  Number.isFinite(percentage) ? Math.round(percentage * 100) : 0;

/**
 * Пересчитывает доли строк, не заданных вручную.
 * Строки с `locked: true` не меняются никогда.
 */
export function redistribute<T extends ShareRow>(rows: T[]): T[] {
  const autoCount = rows.filter((r) => !r.locked).length;
  if (autoCount === 0) return rows;

  const lockedCents = rows.reduce((sum, r) => (r.locked ? sum + toCents(r.percentage) : sum), 0);
  const remainder = Math.max(0, TOTAL_CENTS - lockedCents);

  // Делим поровну, а неделимый остаток отдаём первым строкам — так сумма
  // сходится в 100 ровно: 100/3 превращается в 33.34 + 33.33 + 33.33.
  const base = Math.floor(remainder / autoCount);
  let extra = remainder - base * autoCount;

  return rows.map((row) => {
    if (row.locked) return row;
    const cents = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    return { ...row, percentage: cents / 100 };
  });
}

/** Ручная правка доли: строка фиксируется, остальные автоматические — пересчитываются. */
export function setShare<T extends ShareRow>(rows: T[], index: number, value: number): T[] {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const next = rows.map((row, i) => (i === index ? { ...row, percentage: clamped, locked: true } : row));
  return redistribute(next);
}

/** Новый участник добавляется как автоматический и получает свою часть остатка. */
export function addShareRow<T extends ShareRow>(rows: T[], row: T): T[] {
  return redistribute([...rows, { ...row, locked: false }]);
}

/** После удаления освободившаяся доля расходится по автоматическим строкам. */
export function removeShareRow<T extends ShareRow>(rows: T[], index: number): T[] {
  const next = rows.filter((_, i) => i !== index);
  // Если руками задали всё, что осталось, распределять нечего — снимаем
  // фиксацию, иначе сумма навсегда застрянет меньше 100 и сохранить нельзя.
  if (next.length > 0 && next.every((r) => r.locked)) {
    const sum = next.reduce((acc, r) => acc + toCents(r.percentage), 0);
    if (sum !== TOTAL_CENTS) return redistribute(next.map((r) => ({ ...r, locked: false })));
  }
  return redistribute(next);
}

/** Сбрасывает все ручные значения и делит поровну. */
export function splitEvenly<T extends ShareRow>(rows: T[]): T[] {
  return redistribute(rows.map((r) => ({ ...r, locked: false })));
}

/** Сумма долей в процентах — для индикатора и проверки перед сохранением. */
export function sumShares(rows: ShareRow[]): number {
  return rows.reduce((acc, r) => acc + toCents(r.percentage), 0) / 100;
}
