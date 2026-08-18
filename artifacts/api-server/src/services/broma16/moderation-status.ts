/**
 * Официальный справочник статусов материала Broma16.
 *
 * До этого статус угадывался регулярками по подстрокам («approv», «reject» и
 * т.п.). На присланном разработчиком Broma16 списке видно, что так два статуса
 * разбираются неверно: `shipped` (отгружено на площадки) и `active` (активен)
 * не содержат ни одного «одобрительного» корня и молча считались ожиданием.
 * То есть релиз уже играл в магазинах, а у нас висел «на модерации».
 *
 * Источник: DocGetPatrnerApi (Вероника Бунина, Broma16, 18.08.2026).
 */

export type ModerationVerdict = "approved" | "rejected" | "pending";

/** Что означает код статуса и как он ложится на наш вердикт. */
export type Broma16StatusInfo = {
  /** Расшифровка из документации Broma16 — показываем оператору как есть. */
  label: string;
  verdict: ModerationVerdict;
};

export const BROMA16_STATUSES: Record<string, Broma16StatusInfo> = {
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
  rejected:         { label: "отклонено",         verdict: "rejected" },
  shipped:          { label: "отгружено",         verdict: "approved" },
  takendown:        { label: "снято",             verdict: "rejected" },
  // В документации статус записан как «takendown», но в ответах встречается и
  // «takedown» — принимаем оба, чтобы снятый релиз не считался ожидающим.
  takedown:         { label: "снято",             verdict: "rejected" },
};

/** Возвращает описание статуса, если код известен справочнику. */
export function lookupBroma16Status(raw: string | null | undefined): Broma16StatusInfo | null {
  const key = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return BROMA16_STATUSES[key] ?? null;
}

/** Человеческая расшифровка статуса для интерфейса; неизвестный код — как есть. */
export function describeBroma16Status(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const info = lookupBroma16Status(value);
  return info ? `${value} — ${info.label}` : value;
}
