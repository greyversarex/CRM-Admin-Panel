/**
 * Risk engine — единая точка расчёта оценки риска для релиза.
 *
 * Вызывается на ключевых переходах:
 *   - submit (артист → pending_review): первичный расчёт без скана
 *   - approve (модератор): пересчёт с учётом всех сделанных проверок
 *   - после ACR-скана / MusicBrainz-чека: пересчёт + сохранение в releases
 *   - перед deliver (admin): финальная проверка label-блокировки
 *
 * Никаких порогов/блокировок здесь нет — мы только СЧИТАЕМ. Решение
 * принимает caller (releases route, delivery worker).
 */

import { db } from "@workspace/db";
import {
  releasesTable, labelsTable, tracksTable, acrChecksTable, deliveriesTable,
  type Release, type Label, type ReleaseRiskFactor,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

// ── Регионы / жанры с тонким покрытием ACR ─────────────────────────────
// Эти жанры/языки слабо представлены в базе ACRCloud (~75M треков, основной
// каталог — Spotify/Apple/UMG/Sony западного рынка). Региональная музыка
// часто отдаёт false-clean: ACR её не знает, но Spotify Audible Magic — может.
// Принимаем как ISO-639 коды, так и человеческие названия — UI у нас сохраняет
// language как полное слово ("Tajik", "Uzbek", "русский"). Сравнение
// case-insensitive по точному совпадению или префиксу 2-3 символа.
const REGIONAL_LANGUAGES = new Set<string>([
  // ISO-639 коды
  "tg", "tgk",          // таджикский
  "uz", "uzb",          // узбекский
  "kk", "kaz",          // казахский
  "ky", "kir",          // киргизский
  "fa", "fas", "per",   // фарси
  "ps", "pus",          // пушту
  "tk", "tuk",          // туркменский
  // Английские названия
  "tajik", "tadjik",
  "uzbek",
  "kazakh",
  "kyrgyz", "kirghiz",
  "persian", "farsi", "dari",
  "pashto",
  "turkmen",
  // Русские названия (как пишут в UI лейбла)
  "таджикский", "узбекский", "казахский", "киргизский",
  "персидский", "фарси", "дари", "пушту", "туркменский",
]);

const REGIONAL_GENRE_KEYWORDS = [
  "tajik", "tadjik", "persian", "farsi", "uzbek", "kazakh",
  "central asian", "world music", "world / folk", "folk", "ethnic",
  "регион", "таджик", "персид", "узбек", "казах", "фолк", "народн",
];

export function isRegionalGenre(
  genre: string | null | undefined,
  language: string | null | undefined,
): boolean {
  const lang = (language || "").trim().toLowerCase();
  if (lang && REGIONAL_LANGUAGES.has(lang)) return true;
  const g = (genre || "").toLowerCase();
  return REGIONAL_GENRE_KEYWORDS.some((kw) => g.includes(kw));
}

// ── Расчёт риска ────────────────────────────────────────────────────────

export type RiskAssessment = {
  /** 0..100. 0 = чисто, 100 = максимальный риск отказа DSP. */
  score: number;
  factors: ReleaseRiskFactor[];
};

type AssessmentInput = {
  release: Release;
  label?: Label | null;
  /** Все ACR-проверки релиза (sample + full + musicbrainz_isrc). */
  acrChecks?: Array<typeof acrChecksTable.$inferSelect>;
  /** Кол-во неудавшихся доставок этого релиза в DSP. */
  failedDeliveries?: number;
};

/**
 * Считает оценку риска как сумму вкладов разных факторов.
 * Каждый фактор имеет вес. Сумма clamps до 0..100.
 */
export function computeRisk({
  release, label, acrChecks = [], failedDeliveries = 0,
}: AssessmentInput): RiskAssessment {
  const factors: ReleaseRiskFactor[] = [];
  let score = 0;

  // ── Регион / жанр ────────────────────────────────────────────────────
  if (isRegionalGenre(release.genre, release.language)) {
    factors.push({
      code: "regional_catalog_weak_acr_coverage",
      message:
        "Региональный жанр / язык: база ACRCloud слабо покрывает таджикскую/" +
        "центральноазиатскую сцену. «Чисто» от ACR не гарантирует, что Spotify" +
        " Audible Magic не найдёт совпадение. Рекомендуется multi-segment скан.",
      severity: "medium",
    });
    score += 25;
  }

  // ── ACR результаты ───────────────────────────────────────────────────
  // ВАЖНО: фильтруем СТРОГО по engine='acrcloud' — иначе MB-rows
  // (engine='musicbrainz_isrc', status='matched') попадут сюда и засчитаются
  // повторно, поверх блока «musicBrainzMatches». acr_checks как таблица
  // действует как общий лог проверок разных движков.
  const acrMatches = acrChecks.filter(
    (c) => c.status === "matched" && (c.engine === "acrcloud" || c.engine === null),
  );
  if (acrMatches.length > 0) {
    const top = acrMatches[0];
    factors.push({
      code: "acr_match_found",
      message: `ACR нашёл совпадение: «${top.matchedTitle ?? "?"}» — ${top.matchedArtist ?? "?"}` +
        (top.confidence ? ` (score ${top.confidence})` : ""),
      severity: "high",
    });
    score += 60;
  }

  const fullScans = acrChecks.filter(
    (c) => c.engine === "acrcloud" && c.mode === "full" && c.status !== "pending",
  );
  if (fullScans.length === 0 && isRegionalGenre(release.genre, release.language)) {
    factors.push({
      code: "no_full_scan_for_regional",
      message:
        "Региональный релиз не прошёл multi-segment ACR scan — стоит запустить " +
        "перед approve, чтобы найти возможные сэмплы/инструменталки внутри трека.",
      severity: "medium",
    });
    score += 10;
  }

  const musicBrainzMatches = acrChecks.filter(
    (c) => c.engine === "musicbrainz_isrc" && c.status === "matched",
  );
  if (musicBrainzMatches.length > 0) {
    const top = musicBrainzMatches[0];
    factors.push({
      code: "isrc_conflict_musicbrainz",
      message:
        `ISRC уже зарегистрирован в MusicBrainz за: «${top.matchedTitle ?? "?"}» — ` +
        `${top.matchedArtist ?? "?"}. Использовать чужой ISRC нельзя — DSP отклонит.`,
      severity: "high",
    });
    score += 70;
  }

  // ── Лейбл (страйки от DSP за прошлые рейские отгрузки) ───────────────
  if (label && label.copyrightStrikes >= 1) {
    const sev: ReleaseRiskFactor["severity"] =
      label.copyrightStrikes >= 3 ? "high" : "medium";
    factors.push({
      code: "label_copyright_strikes",
      message:
        `У лейбла «${label.name}» накоплено ${label.copyrightStrikes} копирайт-страйков ` +
        `от DSP. ${label.copyrightStrikes >= 3 ? "Доставка требует ручного подтверждения." : ""}`,
      severity: sev,
    });
    score += Math.min(40, label.copyrightStrikes * 12);
  }

  // ── Прошлые failed-delivery этого же релиза ──────────────────────────
  if (failedDeliveries > 0) {
    factors.push({
      code: "previous_delivery_failures",
      message: `Прошлые попытки доставки этого релиза проваливались (${failedDeliveries}). ` +
        `Проверьте причину в карточке доставки.`,
      severity: failedDeliveries >= 2 ? "high" : "medium",
    });
    score += Math.min(30, failedDeliveries * 15);
  }

  // ── Метаданные: explicit без явного флага в pLine/cLine ──────────────
  if (release.isExplicit && (!release.pLine || !release.cLine)) {
    factors.push({
      code: "missing_pline_cline_for_explicit",
      message:
        "Explicit релиз должен иметь оба поля P-Line и C-Line — DSP требуют " +
        "корректные copyright-формулы для контента 18+.",
      severity: "low",
    });
    score += 5;
  }

  // ── ISRC отсутствует у треков (даже до загрузки в MB) ────────────────
  // (Этот фактор поднимается уже в момент submit — без обращения к MB.)
  // Caller сам подгрузит tracks и решит, добавлять ли его.

  return { score: Math.min(100, score), factors };
}

/**
 * Удобная обёртка: берёт релиз/лейбл/проверки из БД и возвращает оценку.
 * НЕ записывает в БД — это делает persistRisk.
 */
export async function assessReleaseFromDb(releaseId: number): Promise<RiskAssessment> {
  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, releaseId));
  if (!release) return { score: 0, factors: [] };

  const label = release.labelId
    ? (await db.select().from(labelsTable).where(eq(labelsTable.id, release.labelId)))[0] ?? null
    : null;

  const acrChecks = await db.select().from(acrChecksTable)
    .where(eq(acrChecksTable.releaseId, releaseId))
    .orderBy(desc(acrChecksTable.scannedAt))
    .limit(50);

  const failedDeliveries = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(deliveriesTable)
    .where(and(eq(deliveriesTable.releaseId, releaseId), eq(deliveriesTable.status, "failed")));
  const failedCount = failedDeliveries[0]?.c ?? 0;

  // Дополнительные факторы, не покрытые computeRisk: missing ISRC у треков.
  const tracks = await db.select().from(tracksTable).where(eq(tracksTable.releaseId, releaseId));
  const tracksWithoutIsrc = tracks.filter((t) => !t.isrc || t.isrc.trim() === "").length;

  const base = computeRisk({ release, label, acrChecks, failedDeliveries: failedCount });
  if (tracksWithoutIsrc > 0) {
    base.factors.push({
      code: "tracks_missing_isrc",
      message: `${tracksWithoutIsrc} из ${tracks.length} треков без ISRC. ` +
        "DSP сгенерируют свой, но проверка через MusicBrainz станет невозможной.",
      severity: "low",
    });
    base.score = Math.min(100, base.score + 5);
  }
  return base;
}

/**
 * Считает + сохраняет оценку в releases.risk_score / risk_factors.
 * Возвращает оценку. Не блокирует на ошибке записи — только логирует.
 */
export async function assessAndPersist(releaseId: number): Promise<RiskAssessment> {
  const assessment = await assessReleaseFromDb(releaseId);
  try {
    await db.update(releasesTable)
      .set({ riskScore: assessment.score, riskFactors: assessment.factors })
      .where(eq(releasesTable.id, releaseId));
  } catch (e) {
    logger.error({ err: e, releaseId }, "[risk] persist failed");
  }
  return assessment;
}

// ── Страйки лейбла ─────────────────────────────────────────────────────

/**
 * Инкрементирует счётчик страйков лейбла. Вызывается delivery-воркером
 * при ack=Rejected с причиной из набора copyright-related.
 */
export async function incrementLabelStrike(labelId: number, reason: string): Promise<void> {
  try {
    await db.update(labelsTable)
      .set({ copyrightStrikes: sql`${labelsTable.copyrightStrikes} + 1` })
      .where(eq(labelsTable.id, labelId));
    logger.warn({ labelId, reason }, "[risk] label strike incremented");
  } catch (e) {
    logger.error({ err: e, labelId, reason }, "[risk] strike increment failed");
  }
}

/** Распознаёт причины ack/error, считающиеся копирайт-страйком. */
export function isCopyrightFailure(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("copyright") ||
    m.includes("infring") ||
    m.includes("isrc conflict") ||
    m.includes("workalreadyexists") ||
    m.includes("duplicate isrc") ||
    m.includes("rights conflict") ||
    m.includes("audible magic") ||
    m.includes("fingerprint match")
  );
}

/** Порог, при котором deliver требует ручного подтверждения. */
export const LABEL_STRIKE_BLOCK_THRESHOLD = 3;
