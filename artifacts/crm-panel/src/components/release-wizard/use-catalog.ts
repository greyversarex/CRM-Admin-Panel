/**
 * Хук загрузки справочников Broma16 для форм мастера релиза.
 *
 * Данные подтягиваются интеграцией Broma16 автоматически (при подключении и по
 * расписанию) и кэшируются на бэке. Здесь мы их только читаем через
 * /api/catalog/dictionary/:type и превращаем в опции для выпадающих списков.
 *
 * Если словарь ещё пуст (Broma16 не подключён / не синхронизирован) — компонент
 * сам подставит запасной курируемый список, чтобы создание релиза не блокировалось.
 */
import { useQuery } from "@tanstack/react-query";

export type DictType = "genre" | "language" | "country" | "release_type" | "outlet";

export interface DictItem {
  externalId: string;
  code: string | null;
  name: string;
}

export interface Option {
  value: string;
  label: string;
}

async function fetchDictionary(type: DictType): Promise<DictItem[]> {
  const res = await fetch(`/api/catalog/dictionary/${type}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { type: string; items: DictItem[] };
  return json.items ?? [];
}

/**
 * Возвращает опции справочника из Broma16. `valueKey` определяет, что хранить:
 *   - "name" (по умолчанию) — для жанров/языков (схема хранит строку-название);
 *   - "code" — для стран (схема хранит ISO-код, например "TJ").
 * `fallback` используется, пока справочник Broma16 пуст.
 */
const normLabel = (s: string) => s.trim().toLowerCase();

/**
 * Объединяет базовый список с дополнительными опциями (кастомные жанры/сабжанры),
 * убирая дубликаты по названию. Приоритет у базового списка (запись Broma16),
 * чтобы при отправке использовался её код, а не строка-название.
 */
function mergeOptions(base: Option[], extra: Option[]): Option[] {
  if (extra.length === 0) return base;
  const seen = new Set(base.map((o) => normLabel(o.label)));
  const out = [...base];
  for (const e of extra) {
    const key = normLabel(e.label);
    if (!e.label || seen.has(key)) continue;
    out.push(e);
    seen.add(key);
  }
  return out;
}

export function useCatalogOptions(
  type: DictType,
  opts?: { valueKey?: "name" | "code"; fallback?: Option[]; extra?: Option[] },
): { options: Option[]; fromBroma16: boolean; isLoading: boolean } {
  const valueKey = opts?.valueKey ?? "name";
  const fallback = opts?.fallback ?? [];
  const extra = opts?.extra ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["catalog-dict", type],
    queryFn: () => fetchDictionary(type),
    staleTime: 5 * 60_000,
  });

  const items = data ?? [];
  const fromBroma16 = items.length > 0;

  const base: Option[] = fromBroma16
    ? items.map((it) => ({
        value: valueKey === "code" ? (it.code ?? it.externalId) : it.name,
        label: it.name,
      }))
    : fallback;

  // Кастомные жанры/сабжанры показываем всегда — и поверх словаря Broma16,
  // и в запасном списке. Отправку в Broma16 они не ломают: resolveGenres на
  // бэке приводит любой жанр к валидному коду словаря (или к общему «World»).
  const options = mergeOptions(base, extra);

  return { options, fromBroma16, isLoading };
}
