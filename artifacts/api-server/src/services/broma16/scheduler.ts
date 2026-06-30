/**
 * Планировщик фоновых задач Broma16:
 *   - первичная синхронизация словарей при старте (если интеграция настроена)
 *   - еженедельная синхронизация словарей (вс, 03:00)
 *   - ежедневный сбор статистики за вчера (00:30)
 *
 * Все задачи устойчивы к отсутствию кред: если Broma16 не настроен — задача
 * тихо пропускается (без падений и без шквала ошибок).
 */

import cron, { type ScheduledTask } from "node-cron";
import { logger } from "../../lib/logger";
import { getBroma16Credentials } from "./credentials";
import { syncAllDictionaries } from "./dictionaries";
import { pullDailyStatistics } from "./statistics";
import { pollPendingModeration } from "./moderation";

const tasks: ScheduledTask[] = [];

async function isConfigured(): Promise<boolean> {
  const creds = await getBroma16Credentials();
  return Boolean(creds);
}

async function runDictionarySync(reason: string): Promise<void> {
  if (!(await isConfigured())) {
    logger.info(`[broma16] словари: пропуск (${reason}) — интеграция не настроена`);
    return;
  }
  try {
    const result = await syncAllDictionaries();
    logger.info({ result }, `[broma16] словари синхронизированы (${reason})`);
  } catch (e) {
    logger.error({ err: (e as Error).message }, `[broma16] сбой синхронизации словарей (${reason})`);
  }
}

async function runDailyStatistics(): Promise<void> {
  if (!(await isConfigured())) {
    logger.info("[broma16] статистика: пропуск — интеграция не настроена");
    return;
  }
  try {
    await pullDailyStatistics();
  } catch (e) {
    logger.error({ err: (e as Error).message }, "[broma16] сбой ежедневного сбора статистики");
  }
}

async function runModerationPoll(): Promise<void> {
  if (!(await isConfigured())) {
    logger.info("[broma16] модерация: пропуск — интеграция не настроена");
    return;
  }
  try {
    const result = await pollPendingModeration();
    logger.info({ result }, "[broma16] проверка статусов модерации завершена");
  } catch (e) {
    logger.error({ err: (e as Error).message }, "[broma16] сбой проверки статусов модерации");
  }
}

export function startBroma16Schedulers(): void {
  // Первичная синхронизация словарей — отложенно, не блокируя старт сервера.
  setTimeout(() => void runDictionarySync("boot"), 15_000).unref();

  // Еженедельно: воскресенье 03:00.
  tasks.push(cron.schedule("0 3 * * 0", () => void runDictionarySync("weekly cron")));

  // Ежедневно: 00:30 — статистика за вчера.
  tasks.push(cron.schedule("30 0 * * *", () => void runDailyStatistics()));

  // Ежечасно: проверка статусов модерации релизов, ожидающих вердикта Broma16.
  tasks.push(cron.schedule("0 * * * *", () => void runModerationPoll()));

  logger.info("[broma16] планировщик запущен (словари: weekly, статистика: daily, модерация: hourly)");
}

export async function stopBroma16Schedulers(): Promise<void> {
  for (const t of tasks) {
    try {
      await t.stop();
    } catch {
      /* ignore */
    }
  }
  tasks.length = 0;
}
