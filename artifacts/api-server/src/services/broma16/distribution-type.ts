/**
 * Выбор типа публикации для метода `/repertoire/release/{id}/distribution`.
 *
 * Поле `type` у Broma16 обязательное, а мы его не отправляли вовсе — она
 * подставляла `regular`, который на нашем аккаунте требует запас в 7 дней.
 * Отсюда и брались отказы вида «Sales start date must be no earlier than 7
 * days from today's date» на релизах с завтрашней датой.
 *
 * Что говорит их документация (partner-api, метод distribution):
 *   asap     — в ближайшее время, дата от +2 дней от текущей;
 *   regular  — по порядку, от +1 или от +7 дней, в зависимости от привилегий;
 *   transfer — перенос или дата в прошлом, минимум −2 дня от текущей.
 *
 * Отсюда правило: у переноса дата обязана быть в прошлом, у нового релиза —
 * в будущем, и тип подбирается под выбранную дату, а не наоборот.
 */

export type DistributionType = "asap" | "regular" | "transfer";

/** Запас, которого Broma16 требует от обычной публикации на нашем аккаунте. */
export const REGULAR_LEAD_DAYS = 7;
/** Минимальный запас для срочной публикации. */
export const ASAP_LEAD_DAYS = 2;
/** Насколько дата переноса обязана отстоять в прошлое. */
export const TRANSFER_BACKDATE_DAYS = 2;

const DAY = 86_400_000;

/** Дата без времени, в UTC — чтобы часовой пояс сервера не сдвигал сутки. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Разница в сутках между датой релиза и сегодняшним днём. */
export function daysFromToday(releaseDate: string, today: Date): number {
  const target = new Date(`${releaseDate.slice(0, 10)}T00:00:00Z`);
  return Math.round((target.getTime() - startOfUtcDay(today).getTime()) / DAY);
}

export type TypeChoice =
  | { ok: true; type: DistributionType }
  | { ok: false; reason: string };

/**
 * Подбирает тип публикации под дату релиза.
 *
 * Перенос каталога и обычный релиз — разные истории: у первого дата в прошлом
 * обязательна, у второго запрещена.
 */
export function chooseDistributionType(
  releaseDate: string | null | undefined,
  isTransfer: boolean,
  today: Date = new Date(),
): TypeChoice {
  if (!releaseDate) {
    return { ok: false, reason: "Не указана дата релиза." };
  }
  const diff = daysFromToday(releaseDate, today);
  const raw = releaseDate.slice(0, 10);

  if (isTransfer) {
    if (diff > -TRANSFER_BACKDATE_DAYS) {
      const latest = isoDate(new Date(startOfUtcDay(today).getTime() - TRANSFER_BACKDATE_DAYS * DAY));
      return {
        ok: false,
        reason:
          `Перенос каталога требует даты в прошлом: у Broma16 это минимум ${TRANSFER_BACKDATE_DAYS} дня назад, ` +
          `то есть не позже ${latest}. Сейчас указано ${raw}. Поставьте настоящую дату выхода релиза — ` +
          `ту, с которой он вышел у прежнего дистрибьютора.`,
      };
    }
    return { ok: true, type: "transfer" };
  }

  if (diff >= REGULAR_LEAD_DAYS) return { ok: true, type: "regular" };
  if (diff >= ASAP_LEAD_DAYS) return { ok: true, type: "asap" };

  const earliest = isoDate(new Date(startOfUtcDay(today).getTime() + ASAP_LEAD_DAYS * DAY));
  return {
    ok: false,
    reason:
      `Дата ${raw} слишком близкая: Broma16 принимает новый релиз не раньше чем через ` +
      `${ASAP_LEAD_DAYS} дня, то есть с ${earliest}. Если релиз уже выходил раньше — ` +
      `включите «Перенос каталога» и поставьте его настоящую дату выхода: для переноса ` +
      `дата в прошлом как раз и нужна.`,
  };
}
