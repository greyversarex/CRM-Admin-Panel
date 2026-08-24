/**
 * Убирает из поставки витрины, закрытые клиенту в карточке пользователя.
 *
 * Ограничение вида `dsp:spotify` раньше только записывалось в базу: релиз всё
 * равно уезжал на все витрины. Здесь оно начинает работать — на отправке.
 *
 * Чего это НЕ делает: уже отгруженный релиз с площадки не снимается. Broma16
 * не даёт отозвать отдельную витрину, для этого нужен takedown. Поэтому
 * ограничение действует только на будущие поставки, и в интерфейсе так и
 * написано.
 */

/** Ключ ограничения → как витрина называется в словаре Broma16. */
const OUTLET_NAME_BY_FEATURE: Record<string, string[]> = {
  "dsp:spotify": ["spotify"],
  "dsp:apple":   ["apple", "itunes"],
  "dsp:youtube": ["youtube", "yt music"],
  "dsp:tiktok":  ["tiktok", "tik tok", "resso"],
  "dsp:meta":    ["meta", "facebook", "instagram"],
  "dsp:amazon":  ["amazon"],
  "dsp:deezer":  ["deezer"],
  "dsp:tidal":   ["tidal"],
};

const norm = (s: string) => String(s).trim().toLowerCase();

/**
 * Совпадает ли витрина с закрытой площадкой.
 *
 * Сравниваем по вхождению подстроки: в словаре Broma16 названия развёрнутые —
 * «Apple Music / iTunes», «YouTube Music (Art Track)», — и точное равенство
 * не сработало бы.
 */
export function outletMatchesFeature(outletName: string, feature: string): boolean {
  const needles = OUTLET_NAME_BY_FEATURE[feature];
  if (!needles) return false;
  const name = norm(outletName);
  return needles.some((n) => name.includes(n));
}

/**
 * Отфильтровывает закрытые витрины.
 *
 * `dsp:other` закрывает всё, что не опознано ни одной из известных площадок:
 * так переключатель «Остальные площадки» из ТЗ получает смысл.
 */
export function filterRestrictedOutlets(
  outletIds: string[],
  dict: { externalId: string; name: string }[],
  restrictions: string[],
): { kept: string[]; removed: { id: string; name: string }[] } {
  const dspRestrictions = restrictions.filter((r) => r.startsWith("dsp:"));
  if (dspRestrictions.length === 0) return { kept: outletIds, removed: [] };

  const nameById = new Map(dict.map((d) => [String(d.externalId), d.name]));
  const known = Object.keys(OUTLET_NAME_BY_FEATURE);
  const blocksOther = dspRestrictions.includes("dsp:other");

  const kept: string[] = [];
  const removed: { id: string; name: string }[] = [];

  for (const id of outletIds) {
    const name = nameById.get(String(id)) ?? "";
    const hitFeature = dspRestrictions.find((f) => outletMatchesFeature(name, f));
    const isKnownPlatform = known.some((f) => outletMatchesFeature(name, f));
    if (hitFeature || (blocksOther && !isKnownPlatform)) {
      removed.push({ id: String(id), name: name || String(id) });
    } else {
      kept.push(id);
    }
  }
  return { kept, removed };
}
