/**
 * Статусы материала в Broma16 — их два разных набора, и их легко перепутать.
 *
 * `moderation_status` — вердикт модерации, и только он решает судьбу релиза:
 * approved / pending / rejected.
 *
 * `statuses` — массив стадий жизненного цикла сразу по нескольким осям:
 * готовность материала, вердикт модерации и факт отгрузки. У живого релиза он
 * выглядит как ["shipped", "approved", "ready"]. Значения этого массива
 * перечислены в документации Broma16 (DocGetPatrnerApi, 18.08.2026) и
 * используются ещё и как фильтр `?status=` в запросе списка материалов.
 *
 * Практическая польза от массива в том, что «одобрен» и «доехал до магазинов» —
 * разные вещи: модерация может быть пройдена, а отгрузки ещё нет.
 */

export type ModerationVerdict = "approved" | "rejected" | "pending";

export type Broma16StatusInfo = {
  /** Расшифровка из документации Broma16 — показываем оператору как есть. */
  label: string;
  verdict: ModerationVerdict;
};

/** Значения поля `moderation_status` — вердикт модерации. */
export const BROMA16_MODERATION_STATUSES: Record<string, Broma16StatusInfo> = {
  approved: { label: "одобрено",   verdict: "approved" },
  pending:  { label: "на проверке", verdict: "pending" },
  rejected: { label: "отклонено",  verdict: "rejected" },
};

/**
 * Значения массива `statuses` и фильтра `?status=`.
 * Вердикт указан для тех, что попадают и в moderation_status; для чисто
 * жизненных стадий (ready, shipped, expired) он справочный.
 */
export const BROMA16_LIFECYCLE_STATUSES: Record<string, Broma16StatusInfo> = {
  draft_processing: { label: "ожидает обработки", verdict: "pending" },
  draft_verify:     { label: "в обработке",       verdict: "pending" },
  not_ready:        { label: "не готово",         verdict: "pending" },
  ready:            { label: "готово",            verdict: "pending" },
  disputed:         { label: "в диспуте",         verdict: "pending" },
  active:           { label: "активен",           verdict: "approved" },
  expiring:         { label: "заканчивается",     verdict: "approved" },
  expired:          { label: "закончился",        verdict: "rejected" },
  verify:           { label: "в обработке",       verdict: "pending" },
  draft:            { label: "на проверке",       verdict: "pending" },
  shipped:          { label: "отгружено",         verdict: "approved" },
  takendown:        { label: "снято",             verdict: "rejected" },
  // В документации «takendown», но в ответах встречается и «takedown».
  takedown:         { label: "снято",             verdict: "rejected" },
};

/**
 * Вердикт по значению `moderation_status`. Только этот набор влияет на статус
 * релиза у нас: значения из `statuses` сюда подставлять нельзя — там рядом с
 * вердиктом лежат «ready» и «shipped», и релиз на модерации выглядел бы
 * одобренным просто потому, что уже отгружен на площадки.
 */
export function lookupBroma16Status(raw: string | null | undefined): Broma16StatusInfo | null {
  const key = normalizeCode(raw);
  return BROMA16_MODERATION_STATUSES[key] ?? null;
}

/** Описание кода из массива `statuses` (или из фильтра `?status=`). */
export function lookupLifecycleStatus(raw: string | null | undefined): Broma16StatusInfo | null {
  const key = normalizeCode(raw);
  return BROMA16_LIFECYCLE_STATUSES[key] ?? BROMA16_MODERATION_STATUSES[key] ?? null;
}

/** Доехал ли релиз до площадок: в `statuses` есть «shipped». */
export function isShipped(statuses: unknown): boolean {
  if (!Array.isArray(statuses)) return false;
  return statuses.some((s) => normalizeCode(String(s)) === "shipped");
}

/** Человеческая расшифровка; неизвестный код отдаём как есть. */
export function describeBroma16Status(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const info = lookupLifecycleStatus(value);
  return info ? `${value} — ${info.label}` : value;
}

function normalizeCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}
