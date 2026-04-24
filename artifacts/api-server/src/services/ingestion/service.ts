import { createHash } from "crypto";
import {
  db,
  ingestionImportsTable,
  ingestionUnmatchedTable,
  transactionsTable,
  usageReportsTable,
  tracksTable,
  releasesTable,
} from "@workspace/db";
import { eq, inArray, desc, and, sql } from "drizzle-orm";
import { parseByDsp, isSupportedDsp, type SupportedDsp } from "./index";
import type { ParsedRow } from "./types";

export interface PreviewResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  matchedRows: number;
  unmatchedRows: number;
  sample: Array<Pick<ParsedRow, "isrc" | "title" | "artist" | "countryCode" | "streams" | "revenue" | "currency"> & { matched: boolean }>;
  summary: {
    totalRevenue: number;
    currency: string;
    period: string | null;
    dsp: SupportedDsp;
  };
  warnings: string[];
  /** Сколько transactions(type='dsp_revenue') УЖЕ существует за этот dsp+period.
   * Если >0 — повторный commit добавит дубликаты (нет supersede flow в MVP).
   * Юзер должен явно подтвердить «correction import» в UI. */
  existingTransactionsForPeriod: number;
}

export interface CommitResult {
  importId: number;
  inserted: number;        // строк добавлено в usage_reports
  unmatched: number;       // строк ушло в ingestion_unmatched
  transactions: number;    // агрегатов добавлено в transactions
  totalRevenue: number;
  currency: string;
  period: string;
  duplicate: boolean;      // true → этот файл (по idempotencyKey) уже был загружен
  /** Эхо-предупреждение: были ли уже dsp_revenue transactions за этот dsp+period
   * ДО этого импорта. Не блокирует, но фронт должен показать админу. */
  hadExistingTransactions: boolean;
}

export function computeIdempotencyKey(buffer: Buffer, dsp: string, period: string): string {
  const h = createHash("sha256").update(buffer).digest("hex");
  return `${h}:${dsp}:${period}`;
}

/** Парсит файл и возвращает превью без записи в БД. */
export async function previewImport(buffer: Buffer, dspRaw: string): Promise<PreviewResult> {
  if (!isSupportedDsp(dspRaw)) {
    throw new Error(`Unsupported DSP: ${dspRaw}`);
  }
  const dsp: SupportedDsp = dspRaw;
  const parsed = parseByDsp(dsp, buffer);

  // Сматчим по ISRC чтобы показать в превью какие строки найдут трек.
  const isrcs = Array.from(new Set(parsed.rows.map((r) => r.isrc).filter((x): x is string => !!x)));
  const matchedSet = new Set<string>();
  if (isrcs.length > 0) {
    const found = await db.select({ isrc: tracksTable.isrc }).from(tracksTable).where(inArray(tracksTable.isrc, isrcs));
    for (const t of found) if (t.isrc) matchedSet.add(t.isrc);
  }

  const matchedRows = parsed.rows.filter((r) => r.isrc && matchedSet.has(r.isrc)).length;
  const unmatchedRows = parsed.rows.length - matchedRows;
  const totalRevenue = parsed.rows.reduce((s, r) => s + r.revenue, 0);

  // Считаем сколько dsp_revenue transactions уже есть за этот период — если есть,
  // следующий commit СОЗДАСТ ДУБЛИКАТЫ (supersede/reversal не реализован в MVP).
  let existingTransactionsForPeriod = 0;
  const warnings = [...parsed.warnings];
  if (parsed.detectedPeriod) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.type, "dsp_revenue"),
        eq(transactionsTable.platform, dsp),
        eq(transactionsTable.period, parsed.detectedPeriod),
      ));
    existingTransactionsForPeriod = Number(count) || 0;
    if (existingTransactionsForPeriod > 0) {
      warnings.push(
        `За период ${parsed.detectedPeriod} (${dsp}) уже есть ${existingTransactionsForPeriod} transactions. Импорт ДОБАВИТ ещё, что приведёт к двойному учёту дохода. Используйте только для дозагрузки новых треков, не для коррекции существующих сумм.`,
      );
    }
  }

  const sample = parsed.rows.slice(0, 10).map((r) => ({
    isrc: r.isrc,
    title: r.title,
    artist: r.artist,
    countryCode: r.countryCode,
    streams: r.streams,
    revenue: r.revenue,
    currency: r.currency,
    matched: !!(r.isrc && matchedSet.has(r.isrc)),
  }));

  return {
    totalRows: parsed.rows.length + parsed.invalidRows,
    validRows: parsed.rows.length,
    invalidRows: parsed.invalidRows,
    matchedRows,
    unmatchedRows,
    sample,
    summary: {
      totalRevenue: Math.round(totalRevenue * 10000) / 10000,
      currency: parsed.detectedCurrency ?? "USD",
      period: parsed.detectedPeriod,
      dsp,
    },
    warnings,
    existingTransactionsForPeriod,
  };
}

export interface CommitInput {
  buffer: Buffer;
  dsp: string;
  period: string;       // YYYY-MM
  filename: string;
  uploadedBy: number | null;
  /** Если за этот dsp+period УЖЕ есть transactions(type=dsp_revenue),
   * commit бросит ExistingTransactionsError. Передайте force=true чтобы
   * сознательно сделать correction-import (UI должен показать чекбокс). */
  force?: boolean;
}

/** Server-side guard: блокирует commit если за тот же dsp+period уже есть
 * dsp_revenue transactions. Защита от случайного двойного учёта дохода. */
export class ExistingTransactionsError extends Error {
  constructor(public readonly dsp: string, public readonly period: string, public readonly count: number) {
    super(`За период ${period} (${dsp}) уже есть ${count} transactions. Передайте force=true чтобы подтвердить correction-import.`);
    this.name = "ExistingTransactionsError";
  }
}

/** Парсит и сохраняет в БД одной транзакцией. Возвращает счётчики. */
export async function commitImport(input: CommitInput): Promise<CommitResult> {
  if (!isSupportedDsp(input.dsp)) throw new Error(`Unsupported DSP: ${input.dsp}`);
  const dsp: SupportedDsp = input.dsp;

  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    throw new Error(`Invalid period format ${input.period} — expected YYYY-MM`);
  }

  const idempotencyKey = computeIdempotencyKey(input.buffer, dsp, input.period);

  // Helper: возвращает duplicate-ответ для уже существующего импорта.
  const asDuplicate = async (existing: typeof ingestionImportsTable.$inferSelect): Promise<CommitResult> => ({
    importId: existing.id,
    inserted: existing.insertedRows,
    unmatched: existing.unmatchedRows,
    transactions: 0,
    totalRevenue: parseFloat(existing.totalRevenue),
    currency: existing.currency,
    period: existing.period,
    duplicate: true,
    hadExistingTransactions: false,
  });

  // Fast-path idempotency check ДО парсинга. Race может проскочить — обработаем
  // unique-violation при INSERT ниже.
  const [existing] = await db.select().from(ingestionImportsTable).where(eq(ingestionImportsTable.idempotencyKey, idempotencyKey));
  if (existing) return asDuplicate(existing);

  const parsed = parseByDsp(dsp, input.buffer);
  const totalRevenue = parsed.rows.reduce((s, r) => s + r.revenue, 0);
  const currency = parsed.detectedCurrency ?? "USD";

  // Готовим маппинг ISRC → {trackId, releaseId, artistId}
  const isrcs = Array.from(new Set(parsed.rows.map((r) => r.isrc).filter((x): x is string => !!x)));
  const trackMap = new Map<string, { trackId: number; releaseId: number | null; artistId: number; labelId: number | null }>();
  if (isrcs.length > 0) {
    const tracks = await db
      .select({
        id: tracksTable.id,
        isrc: tracksTable.isrc,
        releaseId: tracksTable.releaseId,
        artistId: tracksTable.artistId,
      })
      .from(tracksTable)
      .where(inArray(tracksTable.isrc, isrcs));

    const releaseIds = Array.from(new Set(tracks.map((t) => t.releaseId).filter((x): x is number => !!x)));
    const releaseLabel = new Map<number, number | null>();
    if (releaseIds.length > 0) {
      const rels = await db.select({ id: releasesTable.id, labelId: releasesTable.labelId }).from(releasesTable).where(inArray(releasesTable.id, releaseIds));
      for (const r of rels) releaseLabel.set(r.id, r.labelId);
    }
    for (const t of tracks) {
      if (!t.isrc) continue;
      trackMap.set(t.isrc, {
        trackId: t.id,
        releaseId: t.releaseId,
        artistId: t.artistId,
        labelId: t.releaseId ? (releaseLabel.get(t.releaseId) ?? null) : null,
      });
    }
  }

  // Считаем "had existing transactions" до commit'а — для инфо-флага в response.
  const [{ count: existingCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.type, "dsp_revenue"),
      eq(transactionsTable.platform, dsp),
      eq(transactionsTable.period, input.period),
    ));
  const hadExistingTransactions = Number(existingCount) > 0;

  // Server-side guard: если за период уже есть transactions, требуем явный force-флаг.
  // Защита от случайного двойного учёта при загрузке исправленного файла.
  if (hadExistingTransactions && !input.force) {
    throw new ExistingTransactionsError(dsp, input.period, Number(existingCount));
  }

  let inserted = 0;
  let unmatched = 0;
  let transactionsCreated = 0;
  let importId = 0;

  try {
  await db.transaction(async (tx) => {
    // Создаём родительский импорт сразу — UNIQUE INDEX на idempotencyKey
    // защищает от race на втором параллельном POST'е.
    const [imp] = await tx.insert(ingestionImportsTable).values({
      dsp,
      period: input.period,
      filename: input.filename,
      uploadedBy: input.uploadedBy,
      totalRows: parsed.rows.length + parsed.invalidRows,
      insertedRows: 0,
      unmatchedRows: 0,
      totalRevenue: totalRevenue.toFixed(4),
      currency,
      idempotencyKey,
    }).returning();
    importId = imp.id;

    // Раскладываем строки на usage_reports / unmatched.
    // Группируем доход по (release, period) для агрегата в transactions.
    const releaseRevenue = new Map<number, { artistId: number | null; labelId: number | null; revenue: number; currency: string }>();
    const matchedUsage: typeof usageReportsTable.$inferInsert[] = [];
    const unmatchedRows: typeof ingestionUnmatchedTable.$inferInsert[] = [];

    for (const row of parsed.rows) {
      const match = row.isrc ? trackMap.get(row.isrc) : undefined;
      if (!match) {
        unmatchedRows.push({
          importId,
          dsp,
          period: input.period,
          rawIsrc: row.isrc,
          rawTitle: row.title,
          rawArtist: row.artist,
          revenue: row.revenue.toFixed(4),
          currency: row.currency,
          countryCode: row.countryCode,
          streams: row.streams,
        });
        continue;
      }
      matchedUsage.push({
        artistId: match.artistId,
        releaseId: match.releaseId,
        trackId: match.trackId,
        platform: dsp,
        period: input.period,
        streams: row.streams,
        revenue: row.revenue.toFixed(4),
        countryCode: row.countryCode,
      });
      if (match.releaseId) {
        const acc = releaseRevenue.get(match.releaseId) ?? {
          artistId: match.artistId,
          labelId: match.labelId,
          revenue: 0,
          currency: row.currency,
        };
        acc.revenue += row.revenue;
        releaseRevenue.set(match.releaseId, acc);
      }
    }

    // Вставляем чанками по 500 строк (чтобы pg-параметров не переполнить).
    const CHUNK = 500;
    for (let i = 0; i < matchedUsage.length; i += CHUNK) {
      await tx.insert(usageReportsTable).values(matchedUsage.slice(i, i + CHUNK));
    }
    for (let i = 0; i < unmatchedRows.length; i += CHUNK) {
      await tx.insert(ingestionUnmatchedTable).values(unmatchedRows.slice(i, i + CHUNK));
    }
    inserted = matchedUsage.length;
    unmatched = unmatchedRows.length;

    // Транзакции — агрегаты per release. Только для ненулевых (включая отрицательные).
    const txRows: typeof transactionsTable.$inferInsert[] = [];
    for (const [releaseId, acc] of releaseRevenue) {
      if (acc.revenue === 0) continue;
      txRows.push({
        type: "dsp_revenue",
        amount: acc.revenue.toFixed(4),
        currency: acc.currency,
        artistId: acc.artistId,
        labelId: acc.labelId,
        releaseId,
        platform: dsp,
        description: `Import #${importId} (${input.filename})`,
        period: input.period,
      });
    }
    if (txRows.length > 0) {
      for (let i = 0; i < txRows.length; i += CHUNK) {
        await tx.insert(transactionsTable).values(txRows.slice(i, i + CHUNK));
      }
      transactionsCreated = txRows.length;
    }

    // Обновляем итоги в родительской записи импорта.
    await tx.update(ingestionImportsTable)
      .set({ insertedRows: inserted, unmatchedRows: unmatched })
      .where(eq(ingestionImportsTable.id, importId));
  });
  } catch (err: any) {
    // Race с параллельным POST'ом того же файла: pg_unique_violation.
    // INSERT в ingestion_imports проиграл UNIQUE INDEX → весь tx откатился,
    // ничего не записано. Возвращаем duplicate-ответ.
    const PG_UNIQUE_VIOLATION = "23505";
    if (err?.code === PG_UNIQUE_VIOLATION || err?.cause?.code === PG_UNIQUE_VIOLATION) {
      const [winner] = await db.select().from(ingestionImportsTable).where(eq(ingestionImportsTable.idempotencyKey, idempotencyKey));
      if (winner) return asDuplicate(winner);
    }
    throw err;
  }

  return {
    importId,
    inserted,
    unmatched,
    transactions: transactionsCreated,
    totalRevenue: Math.round(totalRevenue * 10000) / 10000,
    currency,
    period: input.period,
    duplicate: false,
    hadExistingTransactions,
  };
}

/** Список последних 50 импортов для UI. */
export async function listImports(limit: number = 50) {
  const rows = await db.select().from(ingestionImportsTable).orderBy(desc(ingestionImportsTable.createdAt)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    dsp: r.dsp,
    period: r.period,
    filename: r.filename,
    uploadedBy: r.uploadedBy,
    totalRows: r.totalRows,
    insertedRows: r.insertedRows,
    unmatchedRows: r.unmatchedRows,
    totalRevenue: parseFloat(r.totalRevenue),
    currency: r.currency,
    createdAt: r.createdAt.toISOString(),
  }));
}

