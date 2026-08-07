/**
 * Живая статистика Broma16 (ROD Statistics API).
 *
 * Отдельно от statistics.ts: там выгрузка отчётов файлом (прослушивания по
 * трекам, ложатся в usage_reports), здесь — агрегаты, которые Broma16 считает
 * у себя и отдаёт сразу. Своей копии мы не храним: цифры производные и
 * пересчитываются на их стороне.
 *
 * Проверено на живом аккаунте: методы работают тем же токеном, что и остальное
 * API — отдельный ключ не нужен, несмотря на ApiKeyAuth в документации.
 * Все три метода — POST с телом-фильтром и датами в query; на GET отвечают 405.
 */

import { logger } from "../../lib/logger";
import { createBroma16Client, type Broma16Client } from "./client";

function base(accountId: string): string {
  return `/stat/v1/accounts/${accountId}/statistics`;
}

/** Возрастная группа: доли мужчин/женщин и объём прослушиваний. */
export type AgeBucket = {
  range: string;
  male: number;
  female: number;
  percent: number;
  streams: number;
};

export type DeviceShare = { device: string; percent: number };

export type AudienceStats = {
  age: AgeBucket[];
  /** Доля слушателей с подпиской, %. null — витрины не отдали данные. */
  subscribed: number | null;
  notSubscribed: number | null;
  devices: DeviceShare[];
};

type Filters = { artistIds?: string[]; releaseIds?: string[]; recordingIds?: string[] };

/**
 * Один запрос к живой статистике. Ошибку не бросаем: раздел аудитории —
 * дополнение к основным цифрам, и если Broma16 недоступна или по фильтру нет
 * данных, страница должна показать остальное, а не упасть целиком.
 */
async function tryPost<T>(
  c: Broma16Client,
  path: string,
  body: Filters,
  query: Record<string, string>,
): Promise<T | null> {
  try {
    return await c.request<T>("POST", path, { body, query });
  } catch (e) {
    logger.warn({ path, err: (e as Error).message }, "[broma16] живая статистика недоступна");
    return null;
  }
}

/** Приводит ответ демографии к плоскому списку возрастных групп. */
function parseAge(data: unknown): AgeBucket[] {
  // Broma16 отдаёт массив с одним объектом: { "18-24": { m, f, total_percent, total_streams }, … }
  const first = Array.isArray(data) ? data[0] : data;
  if (!first || typeof first !== "object") return [];
  const out: AgeBucket[] = [];
  for (const [range, raw] of Object.entries(first as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const streams = Number(v.total_streams ?? 0);
    // Пустые группы только захламляют график.
    if (!Number.isFinite(streams) || streams <= 0) continue;
    out.push({
      range,
      male: Number(v.m ?? 0),
      female: Number(v.f ?? 0),
      percent: Number(v.total_percent ?? 0),
      streams,
    });
  }
  // Порядок групп в объекте не гарантирован — сортируем по нижней границе.
  return out.sort((a, b) => Number.parseInt(a.range, 10) - Number.parseInt(b.range, 10));
}

function parseDevices(data: unknown): DeviceShare[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((d) => {
      const v = (d ?? {}) as Record<string, unknown>;
      return { device: String(v.device_type ?? ""), percent: Number(v.percentage ?? 0) };
    })
    .filter((d) => d.device && d.percent > 0)
    .sort((a, b) => b.percent - a.percent);
}

/** Возраст, пол, устройства и доля подписчиков за период. */
export async function getAudienceStats(
  dateFrom: string,
  dateTo: string,
  filters: Filters = {},
  client?: Broma16Client,
): Promise<AudienceStats> {
  const c = client ?? (await createBroma16Client());
  const accountId = await c.getAccountId();
  const b = base(accountId);
  const query = { dateFrom, dateTo };

  const [age, subs, devices] = await Promise.all([
    tryPost<unknown>(c, `${b}/demography/age`, filters, query),
    tryPost<{ subscribed?: number; not_subscribed?: number }>(c, `${b}/demography/subscriptions`, filters, query),
    tryPost<unknown>(c, `${b}/source/device`, filters, query),
  ]);

  return {
    age: parseAge(age),
    subscribed: typeof subs?.subscribed === "number" ? subs.subscribed : null,
    notSubscribed: typeof subs?.not_subscribed === "number" ? subs.not_subscribed : null,
    devices: parseDevices(devices),
  };
}
