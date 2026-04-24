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
  inserted: number;        // строк РЕАЛЬНО добавлено в usage_reports (после dedup)
  skippedDuplicates: number; // строк отброшено dedup-ключом (platform,period,track,country)
  unmatched: number;       // строк ушло в ingestion_unmatched
  transactions: number;    // агрегатов добавлено в transactions
  totalRevenue: number;    // сумма revenue только из РЕАЛЬНО вставленных usage-строк
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
    skippedDuplicates: 0,
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
  let skippedDuplicates = 0;
  let unmatched = 0;
  let transactionsCreated = 0;
  let importId = 0;
  let actualInsertedRevenue = 0;

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
    // Хеш-ключ usage-строки нужен чтобы после INSERT...RETURNING понять,
    // какие именно строки реально вставились (DB сделала dedup) — и только
    // их доход учесть в transactions. Иначе при повторном импорте за тот же
    // период доход задвоится в transactions, даже если usage_reports защищён.
    type UsageRow = typeof usageReportsTable.$inferInsert;
    interface PendingUsage {
      key: string;             // dedup-key (platform|period|track|country)
      row: UsageRow;
      revenue: number;
      currency: string;
      artistId: number | null;
      labelId: number | null;
      releaseId: number | null;
    }
    const pendingUsage: PendingUsage[] = [];
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
      const key = `${dsp}|${input.period}|${match.trackId}|${row.countryCode ?? "_"}`;
      pendingUsage.push({
        key,
        row: {
          artistId: match.artistId,
          releaseId: match.releaseId,
          trackId: match.trackId,
          platform: dsp,
          period: input.period,
          streams: row.streams,
          revenue: row.revenue.toFixed(4),
          countryCode: row.countryCode,
        },
        revenue: row.revenue,
        currency: row.currency,
        artistId: match.artistId,
        labelId: match.labelId,
        releaseId: match.releaseId,
      });
    }

    // Вставляем usage_reports чанками с ON CONFLICT DO NOTHING.
    // .returning() даёт ID только тех строк, которые РЕАЛЬНО вставились
    // (Postgres не возвращает skipped-by-conflict). КРИТИЧНО: считаем КРАТНОСТЬ
    // returned-ключей (Map, не Set) — иначе если в одном CSV 2 строки с одним
    // dedup-key, БД вставит ОДНУ, а мы засчитаем обе в transactions → двойной
    // учёт дохода. Map<key, count> + decrement в проходе по pendingUsage.
    const CHUNK = 500;
    const insertedKeyCount = new Map<string, number>();
    for (let i = 0; i < pendingUsage.length; i += CHUNK) {
      const chunk = pendingUsage.slice(i, i + CHUNK);
      const inserted = await tx
        .insert(usageReportsTable)
        .values(chunk.map((p) => p.row))
        .onConflictDoNothing()
        .returning({
          trackId: usageReportsTable.trackId,
          countryCode: usageReportsTable.countryCode,
          platform: usageReportsTable.platform,
          period: usageReportsTable.period,
        });
      for (const r of inserted) {
        const k = `${r.platform}|${r.period}|${r.trackId}|${r.countryCode ?? "_"}`;
        insertedKeyCount.set(k, (insertedKeyCount.get(k) ?? 0) + 1);
      }
    }

    // Считаем агрегаты в transactions ТОЛЬКО для реально-вставленных usage-строк.
    // Группируем по (releaseId, currency) — нельзя суммировать USD+EUR в один transaction.
    // Декрементируем счётчик: если ключ ещё «доступен» (count > 0) — это реально
    // вставленная строка, иначе — внутрифайловый дубль (skipped).
    const releaseRevenue = new Map<string, { releaseId: number; artistId: number | null; labelId: number | null; revenue: number; currency: string }>();
    for (const p of pendingUsage) {
      const remaining = insertedKeyCount.get(p.key) ?? 0;
      if (remaining <= 0) {
        skippedDuplicates += 1;
        continue;
      }
      insertedKeyCount.set(p.key, remaining - 1);
      actualInsertedRevenue += p.revenue;
      if (!p.releaseId) continue;
      const groupKey = `${p.releaseId}|${p.currency}`;
      const acc = releaseRevenue.get(groupKey) ?? {
        releaseId: p.releaseId,
        artistId: p.artistId,
        labelId: p.labelId,
        revenue: 0,
        currency: p.currency,
      };
      acc.revenue += p.revenue;
      releaseRevenue.set(groupKey, acc);
    }

    for (let i = 0; i < unmatchedRows.length; i += CHUNK) {
      await tx.insert(ingestionUnmatchedTable).values(unmatchedRows.slice(i, i + CHUNK));
    }
    inserted = pendingUsage.length - skippedDuplicates;
    unmatched = unmatchedRows.length;

    // Транзакции — агрегаты per (release, currency). Только ненулевые.
    // source='ingestion' + import_id для трассировки и фильтрации в /finance.
    const txRows: typeof transactionsTable.$inferInsert[] = [];
    for (const acc of releaseRevenue.values()) {
      if (acc.revenue === 0) continue;
      txRows.push({
        type: "dsp_revenue",
        amount: acc.revenue.toFixed(4),
        currency: acc.currency,
        artistId: acc.artistId,
        labelId: acc.labelId,
        releaseId: acc.releaseId,
        platform: dsp,
        description: `Import #${importId} (${input.filename})`,
        period: input.period,
        source: "ingestion",
        importId,
      });
    }
    if (txRows.length > 0) {
      for (let i = 0; i < txRows.length; i += CHUNK) {
        await tx.insert(transactionsTable).values(txRows.slice(i, i + CHUNK));
      }
      transactionsCreated = txRows.length;
    }

    // Обновляем итоги в родительской записи импорта.
    // totalRevenue = сумма реально вставленных строк (после dedup) — отражает
    // фактический финансовый эффект импорта, а не «сырой» парсинг файла.
    await tx.update(ingestionImportsTable)
      .set({
        insertedRows: inserted,
        unmatchedRows: unmatched,
        totalRevenue: actualInsertedRevenue.toFixed(4),
      })
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
    skippedDuplicates,
    unmatched,
    transactions: transactionsCreated,
    totalRevenue: Math.round(actualInsertedRevenue * 10000) / 10000,
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

