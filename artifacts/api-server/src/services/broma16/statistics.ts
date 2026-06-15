/**
 * Сбор статистики из Broma16 (ROD API).
 *
 * Поток: POST .../report (создать) → poll GET .../report/{id} (ждём status=done)
 * → скачиваем output_file (CSV/XLSX) → парсим → пишем в usage_reports,
 * матчим строки по ISRC / broma16_recording_id с нашими треками.
 *
 * Cron: ежедневно в 00:30 (pullDailyStatistics) запрашивает отчёт за вчера.
 */

import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { tracksTable, usageReportsTable } from "@workspace/db";
import { and, eq, isNull, isNotNull, or } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { Broma16ApiError } from "./errors";
import { createBroma16Client, type Broma16Client } from "./client";

function reportBase(accountId: string): string {
  return `/stat/v1/statistics/accounts/${accountId}`;
}

function extractReportId(data: unknown): string {
  if (data == null) throw new Broma16ApiError(0, "Broma16: пустой ответ при создании отчёта");
  if (typeof data === "number" || typeof data === "string") return String(data);
  const obj = data as Record<string, unknown>;
  const id = obj.id ?? obj.report_id ?? obj.reportId ?? obj.uuid;
  if (id == null) throw new Broma16ApiError(0, "Broma16: в ответе нет id отчёта статистики");
  return String(id);
}

export type ReportStatus = {
  status: string;
  outputFile: string | null;
  raw: Record<string, unknown>;
};

const DONE_STATUSES = new Set(["done", "ready", "completed", "complete", "success", "finished"]);
const FAILED_STATUSES = new Set(["error", "failed", "fail", "cancelled", "canceled"]);

export async function requestStatisticsReport(
  dateFrom: string,
  dateTo: string,
  outletCodes?: string[],
  client?: Broma16Client,
): Promise<string> {
  const c = client ?? (await createBroma16Client());
  const accountId = await c.getAccountId();
  const body: Record<string, unknown> = { dateFrom, dateTo };
  if (outletCodes && outletCodes.length > 0) {
    body.outlets = `[${outletCodes.join(",")}]`;
  }
  const data = await c.request<unknown>("POST", `${reportBase(accountId)}/report`, { body });
  const reportId = extractReportId(data);
  logger.info({ reportId, dateFrom, dateTo }, "[broma16] отчёт статистики создан");
  return reportId;
}

export async function checkReportStatus(reportId: string, client?: Broma16Client): Promise<ReportStatus> {
  const c = client ?? (await createBroma16Client());
  const accountId = await c.getAccountId();
  const data = await c.request<Record<string, unknown>>("GET", `${reportBase(accountId)}/report/${reportId}`);
  const status = String(data.status ?? data.state ?? "unknown").toLowerCase();
  const outputFile =
    (data.output_file ?? data.outputFile ?? data.file ?? data.url ?? data.link ?? data.download_url) ?? null;
  return { status, outputFile: outputFile != null ? String(outputFile) : null, raw: data };
}

export async function getStatisticsOutlets(client?: Broma16Client): Promise<unknown> {
  const c = client ?? (await createBroma16Client());
  return c.request<unknown>("GET", "/stat/v1/statistics/outlets");
}

// ── Парсинг файла отчёта ─────────────────────────────────────────

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function findColumn(keys: string[], needles: string[]): string | undefined {
  return keys.find((k) => {
    const nk = normKey(k);
    return needles.some((n) => nk.includes(n));
  });
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}\b)/g, "");
  const normalized = s.replace(/,/g, ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function toPeriod(v: unknown, fallback: string): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v == null) return fallback;
  const s = String(v).trim();
  const m = s.match(/(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/);
  if (m) {
    const mm = m[2].padStart(2, "0");
    return m[3] ? `${m[1]}-${mm}-${m[3].padStart(2, "0")}` : `${m[1]}-${mm}`;
  }
  return s || fallback;
}

type TrackKey = { trackId: number; releaseId: number | null; artistId: number };

async function buildTrackIndex(): Promise<{ byIsrc: Map<string, TrackKey>; byRecording: Map<string, TrackKey> }> {
  const rows = await db
    .select({
      id: tracksTable.id,
      isrc: tracksTable.isrc,
      releaseId: tracksTable.releaseId,
      artistId: tracksTable.artistId,
      recordingId: tracksTable.broma16RecordingId,
    })
    .from(tracksTable)
    .where(or(isNotNull(tracksTable.isrc), isNotNull(tracksTable.broma16RecordingId)));
  const byIsrc = new Map<string, TrackKey>();
  const byRecording = new Map<string, TrackKey>();
  for (const r of rows) {
    const key: TrackKey = { trackId: r.id, releaseId: r.releaseId, artistId: r.artistId };
    if (r.isrc) byIsrc.set(r.isrc.trim().toUpperCase(), key);
    if (r.recordingId != null) byRecording.set(String(r.recordingId), key);
  }
  return { byIsrc, byRecording };
}

type AggRow = {
  trackId: number;
  releaseId: number | null;
  artistId: number;
  platform: string;
  period: string;
  countryCode: string | null;
  streams: number;
  revenue: number;
};

export type IngestResult = {
  totalRows: number;
  matched: number;
  unmatched: number;
  written: number;
};

/** Скачивает файл отчёта и пишет агрегаты в usage_reports. */
export async function ingestReportFile(outputFileUrl: string, fallbackPeriod: string): Promise<IngestResult> {
  const res = await fetch(outputFileUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Broma16ApiError(res.status, `Broma16: не удалось скачать файл отчёта (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { totalRows: 0, matched: 0, unmatched: 0, written: 0 };
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  if (rows.length === 0) return { totalRows: 0, matched: 0, unmatched: 0, written: 0 };

  const keys = Object.keys(rows[0]);
  const col = {
    isrc: findColumn(keys, ["isrc"]),
    recording: findColumn(keys, ["recordingid", "recording", "trackid"]),
    period: findColumn(keys, ["period", "date", "month", "reporting"]),
    streams: findColumn(keys, ["stream", "quantity", "qty", "plays", "units", "count", "listen"]),
    revenue: findColumn(keys, ["revenue", "amount", "royalty", "net", "earning", "income", "payout"]),
    country: findColumn(keys, ["country", "territory", "region"]),
    outlet: findColumn(keys, ["outlet", "platform", "store", "dsp", "shop", "service", "channel"]),
  };
  if (!col.isrc && !col.recording) {
    logger.warn({ headers: keys }, "[broma16] в файле отчёта нет колонки ISRC/recording — пропуск");
    return { totalRows: rows.length, matched: 0, unmatched: rows.length, written: 0 };
  }

  const { byIsrc, byRecording } = await buildTrackIndex();
  const agg = new Map<string, AggRow>();
  let matched = 0;
  let unmatched = 0;

  for (const row of rows) {
    const isrc = col.isrc ? String(row[col.isrc] ?? "").trim().toUpperCase() : "";
    const recording = col.recording ? String(row[col.recording] ?? "").trim() : "";
    const track = (isrc && byIsrc.get(isrc)) || (recording && byRecording.get(recording)) || null;
    if (!track) {
      unmatched++;
      continue;
    }
    matched++;
    const period = col.period ? toPeriod(row[col.period], fallbackPeriod) : fallbackPeriod;
    const outlet = col.outlet ? String(row[col.outlet] ?? "").trim() : "";
    const platform = outlet || "Broma16";
    const country = col.country ? String(row[col.country] ?? "").trim() || null : null;
    const streams = col.streams ? Math.round(toNumber(row[col.streams])) : 0;
    const revenue = col.revenue ? toNumber(row[col.revenue]) : 0;

    const k = `${track.trackId}|${platform}|${period}|${country ?? "_"}`;
    const existing = agg.get(k);
    if (existing) {
      existing.streams += streams;
      existing.revenue += revenue;
    } else {
      agg.set(k, {
        trackId: track.trackId,
        releaseId: track.releaseId,
        artistId: track.artistId,
        platform,
        period,
        countryCode: country,
        streams,
        revenue,
      });
    }
  }

  let written = 0;
  for (const a of agg.values()) {
    // Идемпотентный upsert по уникальному индексу (platform, period, track, country):
    // сначала пытаемся обновить (повторный пул заменяет значения), иначе вставляем.
    const updated = await db
      .update(usageReportsTable)
      .set({ streams: a.streams, revenue: a.revenue.toFixed(4) })
      .where(
        and(
          eq(usageReportsTable.platform, a.platform),
          eq(usageReportsTable.period, a.period),
          eq(usageReportsTable.trackId, a.trackId),
          a.countryCode === null
            ? isNull(usageReportsTable.countryCode)
            : eq(usageReportsTable.countryCode, a.countryCode),
        ),
      )
      .returning({ id: usageReportsTable.id });
    if (updated.length === 0) {
      await db
        .insert(usageReportsTable)
        .values({
          trackId: a.trackId,
          releaseId: a.releaseId,
          artistId: a.artistId,
          platform: a.platform,
          period: a.period,
          streams: a.streams,
          revenue: a.revenue.toFixed(4),
          countryCode: a.countryCode,
        })
        .onConflictDoNothing();
    }
    written++;
  }

  logger.info({ totalRows: rows.length, matched, unmatched, written }, "[broma16] статистика загружена в usage_reports");
  return { totalRows: rows.length, matched, unmatched, written };
}

const POLL_INTERVAL_MS = 30_000;
const POLL_MAX_MS = 10 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Дожидается готовности отчёта (poll) и загружает его. */
export async function downloadAndParseReport(
  reportId: string,
  fallbackPeriod: string,
  client?: Broma16Client,
): Promise<IngestResult> {
  const c = client ?? (await createBroma16Client());
  const deadline = Date.now() + POLL_MAX_MS;
  for (;;) {
    const st = await checkReportStatus(reportId, c);
    if (DONE_STATUSES.has(st.status)) {
      if (!st.outputFile) throw new Broma16ApiError(0, "Broma16: отчёт готов, но нет ссылки на файл");
      return ingestReportFile(st.outputFile, fallbackPeriod);
    }
    if (FAILED_STATUSES.has(st.status)) {
      throw new Broma16ApiError(0, `Broma16: формирование отчёта завершилось ошибкой (status=${st.status})`);
    }
    if (Date.now() >= deadline) {
      throw new Broma16ApiError(0, `Broma16: отчёт не готов за отведённое время (status=${st.status})`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function doRequestAndIngest(
  dateFrom: string,
  dateTo: string,
  outletCodes?: string[],
): Promise<{ reportId: string } & IngestResult> {
  const client = await createBroma16Client();
  const reportId = await requestStatisticsReport(dateFrom, dateTo, outletCodes, client);
  const result = await downloadAndParseReport(reportId, dateFrom, client);
  return { reportId, ...result };
}

// Сериализация сбора статистики в рамках процесса: cron и ручной запуск пишут в
// одну таблицу usage_reports, поэтому одновременный ingest мог бы затереть данные
// при upsert. Цепочка промисов гарантирует строго последовательное выполнение.
let ingestChain: Promise<unknown> = Promise.resolve();

/**
 * Запрашивает отчёт за период и сразу загружает его (для ручного и cron-запуска).
 * Вызовы сериализуются, чтобы параллельные синхронизации не конфликтовали при
 * upsert в usage_reports.
 */
export async function requestAndIngest(
  dateFrom: string,
  dateTo: string,
  outletCodes?: string[],
): Promise<{ reportId: string } & IngestResult> {
  const run = ingestChain.then(
    () => doRequestAndIngest(dateFrom, dateTo, outletCodes),
    () => doRequestAndIngest(dateFrom, dateTo, outletCodes),
  );
  ingestChain = run.then(() => undefined, () => undefined);
  return run;
}

/** Cron: ежедневный сбор статистики за вчерашний день. */
export async function pullDailyStatistics(): Promise<void> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const day = ymd(yesterday);
  logger.info({ day }, "[broma16] ежедневный сбор статистики");
  const result = await requestAndIngest(day, day);
  logger.info({ day, ...result }, "[broma16] ежедневный сбор статистики завершён");
}
