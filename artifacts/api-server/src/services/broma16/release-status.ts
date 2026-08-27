/**
 * Наш статус релиза по состоянию на стороне Broma16.
 *
 * Заказчик формулирует так: после отправки на дистрибуцию статусом
 * распоряжается Broma16, а мы его отражаем. Поэтому решение принимается здесь
 * из двух её сигналов и ничего не додумывает:
 *
 *   moderation_status — прошла ли проверка;
 *   statuses[]        — где материал сейчас (в том числе «отгружен»).
 *
 * Одобрение и попадание в магазины — разные события: релиз может быть одобрен
 * и ещё неделю ехать. Поэтому «live» ставим только по отгрузке.
 */
export function releaseStatusFromBroma(
  current: string,
  verdict: "approved" | "rejected" | "pending",
  shipped: boolean,
): string {
  if (verdict === "rejected") return "rejected";
  if (shipped) return "live";
  if (verdict === "approved") {
    // Одобрен, но ещё не в магазинах. Ручные состояния (draft, archived) не
    // трогаем: их выставил человек, и Broma16 про них ничего не знает.
    return current === "rejected" || current === "pending" || current === "submitted"
      ? "approved"
      : current;
  }
  // Ещё смотрят. Отказ, который человек уже видел, не отменяем сами.
  return current;
}
