/**
 * Формы данных каталога Broma16 и чистая логика сопоставления.
 *
 * Вынесено из catalog-import.ts, чтобы сопоставление можно было покрыть тестами:
 * там модуль тянет за собой подключение к БД, и `tsx --test` падает ещё на
 * импорте. Здесь — только преобразования, без сети и базы.
 */

export type BromaArtistRef = { id?: number; title?: string };

export type BromaRelease = {
  id: number;
  title: string;
  performers?: string[];
  artists?: BromaArtistRef[];
  ean?: string;
  catalogue_number?: string;
  release_date?: string;
  release_original_date?: string;
  moderation_status?: string;
  statuses?: string[];
  release_type_id?: number;
  genres?: number[];
};

export type BromaRecording = {
  id: number;
  title: string;
  isrc?: string;
  performers?: string[];
  artists?: BromaArtistRef[];
  published_date?: string | null;
  is_instrumental?: number;
  parental_warning_type?: string;
  genres?: number[];
};

export type BromaComposition = {
  id: number;
  title: string;
  iswc?: string;
  authors?: string[];
};

/** Ключ для сравнения названий/имён: без регистра, диакритики и пунктуации. */
export function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

/** Первое имя исполнителя: Broma16 кладёт их и в performers, и в artists. */
export function primaryPerformer(item: { performers?: string[]; artists?: BromaArtistRef[] }): string | null {
  const raw = item.performers?.[0] ?? item.artists?.[0]?.title ?? null;
  if (!raw) return null;
  // «Qobiljon Zaripov; Komiljon Zaripov» — берём первого как главного.
  const first = raw.split(";")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

/** Наш статус релиза по статусам Broma16. */
export function mapStatus(rel: BromaRelease): string {
  const moderation = (rel.moderation_status ?? "").toLowerCase();
  const statuses = (rel.statuses ?? []).map((s) => s.toLowerCase());
  if (statuses.includes("shipped")) return "live";
  if (moderation === "approved") return "approved";
  if (moderation === "rejected") return "rejected";
  return "pending_review";
}

/**
 * Типы релиза Broma16 (/dictionaries/release-types):
 * 2 Альбом · 42 Рингбэктон · 43 Рингтон · 51 Сингл · 64 EP · 69 Компиляция · 70 TikTok.
 */
const RELEASE_TYPE_BY_ID: Record<number, string> = {
  2: "album",
  51: "single",
  64: "ep",
  69: "compilation",
};

/**
 * Типы, которые не заводим отдельным релизом: это дополнительные доставки уже
 * существующей песни (та же фонограмма и тот же ISRC, отличается лишь
 * штрихкод). В CRM они выглядели бы дублями каталога, а статистика всё равно
 * приходит по ISRC основного сингла.
 */
export const SECONDARY_RELEASE_TYPE_IDS = new Set([42, 43, 70]);

export function mapReleaseType(rel: BromaRelease): string {
  return RELEASE_TYPE_BY_ID[rel.release_type_id ?? 51] ?? "single";
}

export type BromaDuplicate = {
  id: number;
  title: string;
  upc: string | null;
  /** По какому признаку совпало: точный штрихкод или название с исполнителем. */
  matchedBy: "upc" | "title";
  moderationStatus: string | null;
};

/**
 * Ищет среди релизов Broma16 тот, что дублирует наш.
 *
 * Broma16 не умеет определять, что релиз уже заведён («отличий не будет, понять
 * откуда пришёл релиз — нельзя»), поэтому проверка возможна только на нашей
 * стороне.
 *
 * Совпадение по UPC однозначно: штрихкод уникален по определению.
 * Совпадение по названию с исполнителем — вероятностное, поэтому учитывается
 * только для релизов, реально ушедших на витрины: черновик с тем же названием
 * блокировать отправку не должен.
 */
export function pickBromaDuplicate(
  releases: BromaRelease[],
  target: { upc?: string | null; title: string; performer?: string | null },
): BromaDuplicate | null {
  const describe = (r: BromaRelease, matchedBy: "upc" | "title"): BromaDuplicate => ({
    id: r.id,
    title: r.title,
    upc: r.ean || null,
    matchedBy,
    moderationStatus: r.moderation_status ?? null,
  });

  const upc = target.upc?.trim();
  if (upc) {
    const byUpc = releases.find((r) => (r.ean ?? "").trim() === upc);
    if (byUpc) return describe(byUpc, "upc");
  }

  const title = normalize(target.title);
  const performer = target.performer ? normalize(target.performer) : null;
  if (!title || !performer) return null;

  const live = releases.find((r) => {
    if (normalize(r.title ?? "") !== title) return false;
    const rp = primaryPerformer(r);
    if (!rp || normalize(rp) !== performer) return false;
    const statuses = (r.statuses ?? []).map((s) => s.toLowerCase());
    return statuses.includes("shipped") || (r.moderation_status ?? "").toLowerCase() === "approved";
  });
  return live ? describe(live, "title") : null;
}
