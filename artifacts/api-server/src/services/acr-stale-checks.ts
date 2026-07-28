/**
 * Разбор «зависших» ACR-проверок.
 *
 * Проверка File Scanning живёт только в памяти процесса: POST /acr/file-scan
 * вставляет строку со статусом 'pending' и запускает runFileScan() в фоне.
 * Если процесс умирает или его перезапускает деплой, промис исчезает вместе с
 * ним, а строка навсегда остаётся 'pending'. Для оператора это тупик: модалка
 * крутит спиннер, кнопка «Проверить» заблокирована статусом «Сканируется…»,
 * и запустить проверку заново невозможно — до правки в базе руками.
 *
 * Отсюда две подстраховки:
 *   1. На старте процесса ни одна проверка выполняться не может по определению —
 *      значит все 'pending' осиротели, помечаем их ошибкой.
 *   2. Раз в 5 минут добираем те, что висят дольше максимально возможного
 *      скана (запас — на случай зависшего fetch внутри живого процесса).
 */
import { and, eq, lt } from "drizzle-orm";
import { db, acrChecksTable } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * Потолок жизни одной проверки: загрузка файла (300 с) + опрос ACRCloud
 * (60 попыток × 5 с) ≈ 10 минут. Берём 15 — чтобы не убить живой скан.
 */
const MAX_SCAN_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const ORPHANED_MESSAGE =
  "Проверка прервалась — сервер перезапустился, пока файл обрабатывался. Нажмите «Проверить заново».";
const STALE_MESSAGE =
  "Проверка не завершилась за 15 минут и была снята. Нажмите «Проверить заново».";

let timer: NodeJS.Timeout | null = null;

async function failPending(olderThan: Date | null, message: string): Promise<number> {
  const where = olderThan
    ? and(eq(acrChecksTable.status, "pending"), lt(acrChecksTable.scannedAt, olderThan))
    : eq(acrChecksTable.status, "pending");

  const rows = await db.update(acrChecksTable)
    .set({ status: "error", errorMessage: message })
    .where(where)
    .returning({ id: acrChecksTable.id });

  return rows.length;
}

/** Вызывается один раз при старте: живых сканов в этот момент не существует. */
export async function reclaimOrphanedAcrChecks(): Promise<void> {
  const count = await failPending(null, ORPHANED_MESSAGE);
  if (count > 0) logger.warn({ count }, "[acr] осиротевшие проверки помечены ошибкой после рестарта");
}

export function startAcrStaleSweeper(): void {
  if (timer) return;
  timer = setInterval(() => {
    void failPending(new Date(Date.now() - MAX_SCAN_MS), STALE_MESSAGE)
      .then((count) => {
        if (count > 0) logger.warn({ count }, "[acr] зависшие проверки сняты по таймауту");
      })
      .catch((err) => logger.error({ err }, "[acr] sweeper failed"));
  }, SWEEP_INTERVAL_MS);
  timer.unref();
}

export function stopAcrStaleSweeper(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
