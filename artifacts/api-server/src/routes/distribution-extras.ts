/**
 * Distribution — ACRCloud Check + Disputes
 *
 * GET   /api/distribution/acr/checks?releaseId=
 * POST  /api/distribution/acr/scan          { releaseId, trackId? }
 * GET   /api/distribution/disputes          — споры по релизам (rights conflicts на release_id)
 *
 * ACRCloud работает при заполненных settings.acrcloud {host, accessKey, accessSecret}.
 * Без ключей возвращает status="error" + errorMessage="ACRCloud credentials not configured".
 *
 * Реальная интеграция:
 *  1. Берём track.audio_url (https) — скачиваем первые ~10 секунд (ACRCloud поддерживает sample 1-30 сек)
 *  2. Считаем HMAC-SHA1 подпись над "POST\n/v1/identify\n{accessKey}\naudio\n1\n{ts}"
 *  3. multipart/form-data POST на https://{host}/v1/identify
 *  4. Парсим ответ → обновляем acr_check (matched_*, confidence, result_json, status)
 *
 * Если audio_url отсутствует — пишем status="error" с понятным сообщением.
 */
import { Router } from "express";
import { z } from "zod";
import { db, acrChecksTable, releasesTable, tracksTable, rightsConflictsTable, platformSettingsTable, artistsTable, ddexMessagesTable, deliveriesTable, integrationsTable, assetsTable, labelsTable, releaseArtistsTable, releaseDspsTable, type AcrCheckSegment } from "@workspace/db";
import { eq, desc, and, gte, lte, inArray, sql, count, isNotNull, or, asc } from "drizzle-orm";
import { getDataScope } from "../lib/auth";
import { resolveAssetLocalPath } from "../ddex/service";
import * as mm from "music-metadata";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { createHmac } from "node:crypto";
import { auditMutation } from "../lib/audit";
import { logger } from "../lib/logger";
import { getIntegrationByCode, loadCredentials } from "../services/integrations-service";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { lookupIsrc, detectIsrcConflict, normalizeIsrc } from "../services/musicbrainz";
import { assessAndPersist } from "../services/risk-engine";

const storage = new ObjectStorageService();

const router = Router();

interface AcrCloudConfig {
  host?: string;
  accessKey?: string;
  accessSecret?: string;
  enabled?: boolean;
}

/**
 * Загружает конфиг ACRCloud из двух источников:
 * 1. Таблица integrations (Настройки → Интеграции) — приоритет
 *    Ключи: access_key, access_secret, host
 * 2. platformSettingsTable key="acrcloud" (устаревший Настройки → ACRCloud)
 *    Ключи: accessKey, accessSecret, host
 */
async function loadAcrConfig(): Promise<AcrCloudConfig> {
  try {
    // Приоритет: интеграции (куда обычно сохраняет пользователь через UI)
    const integration = await getIntegrationByCode("acrcloud");
    if (integration && integration.status !== "disconnected") {
      const creds = await loadCredentials(integration.id);
      const host = creds["host"] || "identify-eu-west-1.acrcloud.com";
      const accessKey = creds["access_key"] || creds["accessKey"];
      const accessSecret = creds["access_secret"] || creds["accessSecret"];
      if (accessKey && accessSecret) {
        return { host, accessKey, accessSecret, enabled: true };
      }
    }
    // Fallback: старый путь через platformSettings
    const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "acrcloud"));
    return (row?.value ?? {}) as AcrCloudConfig;
  } catch (e) {
    logger.error({ err: e }, "[distribution-extras] loadAcrConfig: read integration/settings failed");
    return {};
  }
}

const AcrChecksQuery = z.object({
  releaseId: z.coerce.number().int().positive().optional(),
});

router.get("/distribution/acr/checks", async (req, res): Promise<void> => {
  const parsed = AcrChecksQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query", message: parsed.error.message });
    return;
  }
  const releaseId = parsed.data.releaseId ?? null;
  let q = db.select().from(acrChecksTable).$dynamic();
  if (releaseId) q = q.where(eq(acrChecksTable.releaseId, releaseId));
  const rows = await q.orderBy(desc(acrChecksTable.scannedAt)).limit(200);
  res.json({ checks: rows, configured: await acrConfigured() });
});

async function acrConfigured(): Promise<boolean> {
  const c = await loadAcrConfig();
  return Boolean(c.enabled !== false && c.host && c.accessKey && c.accessSecret);
}

const ScanBody = z.object({
  releaseId: z.number().int().positive(),
  trackId: z.number().int().positive().optional(),
});

/**
 * Скачивает первые ~10 секунд аудио. ACRCloud принимает любой кусок mp3/wav/m4a 1-30 сек.
 * Лимит 1 МБ — большего не нужно для отпечатка.
 */
// SSRF-защита: запрещаем приватные/локальные IP и не-HTTP схемы.
// Для VPS (Timeweb) это критично — без allowlist можно через ACR scan ходить на внутренние сервисы.
function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const o = m.slice(1).map((s) => parseInt(s, 10));
  if (o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 0.0.0.0/8, 100.64.0.0/10
  if (o[0] === 10) return true;
  if (o[0] === 127) return true;
  if (o[0] === 0) return true;
  if (o[0] === 169 && o[1] === 254) return true;
  if (o[0] === 172 && (o[1] ?? 0) >= 16 && (o[1] ?? 0) <= 31) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  if (o[0] === 100 && (o[1] ?? 0) >= 64 && (o[1] ?? 0) <= 127) return true;
  return false;
}

/**
 * Читаем первые maxBytes байт аудиофайла.
 * Если audioUrl — локальный objectPath (/objects/...) — читаем напрямую из хранилища.
 * Если это внешний https URL — скачиваем через HTTP с SSRF-guard.
 */
/**
 * Достаёт «умный» сэмпл аудио для отправки в ACRCloud.
 *
 * ACRCloud рекомендует ~10 секунд аудио из самой узнаваемой части трека
 * (припев/вокал). Проблема: если брать с самого начала файла, то в первых
 * сотнях КБ часто ID3-метаданные (особенно с встроенной обложкой) или
 * затихание/интро. Решение: пропускаем первые 20% файла и берём 512 КБ —
 * этого хватит на ~12-30 секунд аудио (зависит от битрейта) и почти всегда
 * попадает в куплет/припев.
 */
const SAMPLE_BYTES = 512_000;
const SAMPLE_SKIP_RATIO = 0.20;
const SAMPLE_MIN_SKIP = 100_000;

interface SampleResult { buffer: Buffer; offsetBytes: number; totalBytes: number | null }

/**
 * SSRF-guard для внешнего audio_url. Бросает Error при любом подозрении.
 * Вынесено отдельно, чтобы переиспользовать в fetchByteRange (multi-segment
 * scan): первый probe валидирует URL, но между сегментами DNS может смениться
 * (DNS-rebinding / TOCTOU), поэтому каждый byte-range запрос валидируется
 * заново.
 */
async function assertSafeAudioUrl(audioUrl: string): Promise<URL> {
  let u: URL;
  try { u = new URL(audioUrl); } catch { throw new Error("invalid_audio_url"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`scheme_not_allowed:${u.protocol}`);
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("internal_host_not_allowed");
  }
  if (host.includes(":")) throw new Error("ipv6_not_allowed");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIPv4(host)) throw new Error(`private_ip_not_allowed:${host}`);
  } else {
    const { lookup } = await import("dns/promises");
    const records = await lookup(host, { all: true }).catch(() => [] as Array<{ address: string; family: number }>);
    if (records.length === 0) throw new Error("dns_resolve_failed");
    for (const r of records) {
      if (r.family === 6) throw new Error("ipv6_resolution_not_allowed");
      if (isPrivateIPv4(r.address)) throw new Error(`private_ip_not_allowed:${r.address}`);
    }
  }
  return u;
}

async function fetchSample(audioUrl: string): Promise<SampleResult> {
  // ── Локальный файл хранилища ───────────────────────────────────────────────
  if (audioUrl.startsWith("/objects/")) {
    let file;
    try {
      file = await storage.getObjectEntityFile(audioUrl);
    } catch (e) {
      if (e instanceof ObjectNotFoundError) throw new Error("audio_file_not_found");
      throw e;
    }
    const [meta] = await file.getMetadata();
    const totalBytes = meta.size;
    const offset = computeOffset(totalBytes);
    const end = Math.min(totalBytes - 1, offset + SAMPLE_BYTES - 1);
    const stream = file.createReadStream({ start: offset, end });
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    return { buffer: Buffer.concat(chunks).subarray(0, SAMPLE_BYTES), offsetBytes: offset, totalBytes };
  }

  // ── Внешний URL — SSRF-guard + HTTP fetch ─────────────────────────────────
  await assertSafeAudioUrl(audioUrl);

  // HEAD-запрос чтобы узнать размер (и затем умно высчитать offset).
  // Если HEAD не поддержан — fallback на чтение с начала.
  let totalBytes: number | null = null;
  try {
    const headResp = await fetch(audioUrl, { method: "HEAD", signal: AbortSignal.timeout(8_000), redirect: "manual" });
    const cl = headResp.headers.get("content-length");
    if (headResp.ok && cl) totalBytes = parseInt(cl, 10);
  } catch { /* ignore — пойдём с offset=0 */ }

  const offset = totalBytes !== null ? computeOffset(totalBytes) : 0;
  const end = totalBytes !== null
    ? Math.min(totalBytes - 1, offset + SAMPLE_BYTES - 1)
    : offset + SAMPLE_BYTES - 1;

  const resp = await fetch(audioUrl, {
    method: "GET",
    headers: { Range: `bytes=${offset}-${end}` },
    signal: AbortSignal.timeout(15_000),
    redirect: "manual",
  });
  if (resp.status >= 300 && resp.status < 400) throw new Error(`audio_redirect_blocked_${resp.status}`);
  if (!resp.ok && resp.status !== 206) throw new Error(`audio_fetch_${resp.status}`);
  const ab = await resp.arrayBuffer();
  return { buffer: Buffer.from(ab).subarray(0, SAMPLE_BYTES), offsetBytes: offset, totalBytes };
}

function computeOffset(totalBytes: number): number {
  // Если файл слишком маленький — берём с начала
  if (totalBytes <= SAMPLE_BYTES + SAMPLE_MIN_SKIP) return 0;
  const wantedSkip = Math.max(SAMPLE_MIN_SKIP, Math.floor(totalBytes * SAMPLE_SKIP_RATIO));
  // Гарантируем что хвост файла не короче SAMPLE_BYTES
  return Math.min(wantedSkip, totalBytes - SAMPLE_BYTES);
}

/**
 * Реальный вызов ACRCloud Identify API.
 * Документация: https://docs.acrcloud.com/reference/identification-api
 */
async function callAcrIdentify(cfg: Required<AcrCloudConfig>, sample: Buffer): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; error: string }> {
  const httpMethod = "POST";
  const httpUri = "/v1/identify";
  const dataType = "audio";
  const signatureVersion = "1";
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const stringToSign = [httpMethod, httpUri, cfg.accessKey, dataType, signatureVersion, timestamp].join("\n");
  const signature = createHmac("sha1", cfg.accessSecret).update(stringToSign).digest("base64");

  const form = new FormData();
  // sample → передаём как Blob (Node 18+ глобальный)
  form.append("sample", new Blob([new Uint8Array(sample)]), "sample");
  form.append("sample_bytes", String(sample.length));
  form.append("access_key", cfg.accessKey);
  form.append("data_type", dataType);
  form.append("signature_version", signatureVersion);
  form.append("signature", signature);
  form.append("timestamp", timestamp);

  try {
    const resp = await fetch(`https://${cfg.host}${httpUri}`, {
      method: httpMethod,
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const json = await resp.json().catch(() => ({})) as Record<string, unknown>;
    if (!resp.ok) {
      return { ok: false, error: `ACRCloud HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 200)}` };
    }
    return { ok: true, result: json };
  } catch (e) {
    return { ok: false, error: `ACRCloud network: ${(e as Error).message}` };
  }
}

/**
 * Background-обработка: качаем sample, отправляем на ACRCloud,
 * обновляем acr_checks row.
 */
/** Убираем query-string из URL чтобы не утекали подписанные токены/ключи доступа. */
function safeUrl(u: string): string {
  try {
    const parsed = new URL(u, "http://x.local");
    return `${parsed.origin === "http://x.local" ? "" : parsed.origin}${parsed.pathname}`;
  } catch {
    return u.split("?")[0];
  }
}

async function processAcrCheck(checkId: number, audioUrl: string, cfg: Required<AcrCloudConfig>): Promise<void> {
  const startedAt = Date.now();
  const safeAudioUrl = safeUrl(audioUrl);
  try {
    const { buffer: sample, offsetBytes, totalBytes } = await fetchSample(audioUrl);
    const fetchedAt = Date.now();
    const r = await callAcrIdentify(cfg, sample);
    const finishedAt = Date.now();

    // Мета-данные нашего скана (не часть ответа ACRCloud, но полезно для отчёта).
    // audio_url хранится без query-string — чтобы не утекали подписанные токены.
    const scanMeta = {
      sample_bytes: sample.length,
      sample_kb: Math.round(sample.length / 1024),
      sample_offset_bytes: offsetBytes,
      sample_offset_kb: Math.round(offsetBytes / 1024),
      total_file_bytes: totalBytes,
      total_file_kb: totalBytes !== null ? Math.round(totalBytes / 1024) : null,
      sample_position_pct: totalBytes && totalBytes > 0 ? Math.round((offsetBytes / totalBytes) * 100) : null,
      audio_url: safeAudioUrl,
      acr_host: cfg.host,
      fetch_ms: fetchedAt - startedAt,
      identify_ms: finishedAt - fetchedAt,
      total_ms: finishedAt - startedAt,
      requested_at_utc: new Date(startedAt).toISOString(),
      completed_at_utc: new Date(finishedAt).toISOString(),
    };

    if (!r.ok) {
      await db.update(acrChecksTable).set({
        status: "error",
        errorMessage: r.error,
        resultJson: { _scan_meta: scanMeta, _error: r.error },
      }).where(eq(acrChecksTable.id, checkId));
      return;
    }

    // Инжектируем _scan_meta в результат для прозрачности
    const enrichedResult = { ...r.result, _scan_meta: scanMeta };

    const status = r.result["status"] as { code?: number; msg?: string } | undefined;
    const metadata = r.result["metadata"] as { music?: Array<Record<string, unknown>> } | undefined;
    const musicMatches = metadata?.music ?? [];

    if (status?.code === 0 && musicMatches.length > 0) {
      const top = musicMatches[0];
      const artists = (top["artists"] as Array<{ name?: string }> | undefined)?.map((a) => a.name).filter(Boolean).join(", ");
      const album = top["album"] as { name?: string } | undefined;
      const externalIds = top["external_ids"] as { isrc?: string } | undefined;
      await db.update(acrChecksTable).set({
        status: "matched",
        confidence: typeof top["score"] === "number" ? String(top["score"]) : null,
        matchedTitle: typeof top["title"] === "string" ? top["title"] : null,
        matchedArtist: artists ?? null,
        matchedIsrc: externalIds?.isrc ?? null,
        matchedLabel: typeof top["label"] === "string" ? top["label"] : (album?.name ?? null),
        resultJson: enrichedResult,
        errorMessage: null,
      }).where(eq(acrChecksTable.id, checkId));
    } else if (status?.code === 1001) {
      // "No result" — это нормальный кейс: трек не найден в базе ACRCloud
      await db.update(acrChecksTable).set({
        status: "clean",
        resultJson: enrichedResult,
        errorMessage: null,
      }).where(eq(acrChecksTable.id, checkId));
    } else {
      await db.update(acrChecksTable).set({
        status: "error",
        errorMessage: `ACRCloud: ${status?.msg ?? "unknown"} (code=${status?.code})`,
        resultJson: enrichedResult,
      }).where(eq(acrChecksTable.id, checkId));
    }
  } catch (e) {
    logger.warn({ err: e, checkId }, "[acr] background processing failed");
    const failedAt = Date.now();
    const partialMeta = {
      audio_url: safeAudioUrl,
      acr_host: cfg.host,
      total_ms: failedAt - startedAt,
      requested_at_utc: new Date(startedAt).toISOString(),
      failed_at_utc: new Date(failedAt).toISOString(),
      phase: "background",
    };
    await db.update(acrChecksTable).set({
      status: "error",
      errorMessage: `Background: ${(e as Error).message}`,
      resultJson: { _scan_meta: partialMeta, _error: (e as Error).message },
    }).where(eq(acrChecksTable.id, checkId)).catch(() => undefined);
  }
}

router.post("/distribution/acr/scan", async (req, res) => {
  const parsed = ScanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const { releaseId, trackId } = parsed.data;

  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, releaseId));
  if (!release) { res.status(404).json({ error: "Release not found" }); return; }

  let track: typeof tracksTable.$inferSelect | null = null;
  if (trackId) {
    const [t] = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId));
    if (!t) { res.status(404).json({ error: "Track not found" }); return; }
    track = t;
  } else {
    // Если trackId не указан — берём первый трек релиза
    const [t] = await db.select().from(tracksTable).where(eq(tracksTable.releaseId, releaseId)).limit(1);
    track = t ?? null;
  }

  const cfg = await loadAcrConfig();
  const userId = req.session?.user?.id ?? null;

  // 1. Без ключей — error row, 503
  if (!cfg.host || !cfg.accessKey || !cfg.accessSecret || cfg.enabled === false) {
    const [row] = await db.insert(acrChecksTable).values({
      releaseId, trackId: track?.id ?? null,
      status: "error",
      errorMessage: "ACRCloud credentials not configured (заполните Настройки → ACRCloud)",
      scannedBy: userId,
    }).returning();
    void auditMutation(req, { action: "acr_scan", entityType: "acr_check", entityId: row.id, before: null, after: row });
    res.status(503).json({ ...row, error: "credentials_not_configured" });
    return;
  }

  // 2. Без audio_url — error row, 422
  if (!track?.audioUrl) {
    const [row] = await db.insert(acrChecksTable).values({
      releaseId, trackId: track?.id ?? null,
      status: "error",
      errorMessage: "У трека нет audio_url — загрузите аудиофайл перед сканированием",
      scannedBy: userId,
    }).returning();
    void auditMutation(req, { action: "acr_scan", entityType: "acr_check", entityId: row.id, before: null, after: row });
    res.status(422).json({ ...row, error: "audio_url_missing" });
    return;
  }

  // 3. Создаём pending row, запускаем background, отдаём 202
  const [row] = await db.insert(acrChecksTable).values({
    releaseId, trackId: track.id,
    status: "pending",
    scannedBy: userId,
  }).returning();
  void auditMutation(req, { action: "acr_scan", entityType: "acr_check", entityId: row.id, before: null, after: row });

  void processAcrCheck(row.id, track.audioUrl, cfg as Required<AcrCloudConfig>);
  res.status(202).json(row);
});

// ── Multi-segment ACR scan ────────────────────────────────────────────────
//
// «Полный» скан: режем файл на N окон по ~512 КБ (≈12 сек аудио каждое),
// разнесённых равномерно по таймлайну, и шлём каждое в ACRCloud отдельно.
// Это в разы повышает шанс поймать совпадение в треках, где первое окно
// (которое использует quick-scan) — вступление/чистый бит без вокала.
//
// Для прозрачности и UX результат пишется в ОДНУ acr_checks-строку:
//   mode='full', engine='acrcloud', segments=[{start_pct, status, score, …}].
// Финальный status строки — самый «горячий» из сегментов: matched > error > clean.

const SEGMENT_COUNT = 5;
const SEGMENT_BYTES = 512_000;

interface SegmentSamplePlan { startBytes: number; endBytes: number; startPct: number; endPct: number }

function planSegments(totalBytes: number | null): SegmentSamplePlan[] {
  // Если размер неизвестен (например, внешний URL без HEAD) — берём один кусок с нуля.
  if (totalBytes === null || totalBytes <= SEGMENT_BYTES * 2) {
    return [{ startBytes: 0, endBytes: Math.min((totalBytes ?? SEGMENT_BYTES) - 1, SEGMENT_BYTES - 1), startPct: 0, endPct: 100 }];
  }
  const usable = totalBytes - SEGMENT_BYTES;
  const plans: SegmentSamplePlan[] = [];
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    // Равномерно: 0%, 25%, 50%, 75%, 95% (последнее — отступаем чтоб не упереться)
    const pos = (SEGMENT_COUNT as number) === 1 ? 0 : (i / (SEGMENT_COUNT - 1)) * 0.95;
    const start = Math.floor(usable * pos);
    const end = start + SEGMENT_BYTES - 1;
    plans.push({
      startBytes: start,
      endBytes: end,
      startPct: Math.round((start / totalBytes) * 100),
      endPct: Math.round((end / totalBytes) * 100),
    });
  }
  return plans;
}

/** Скачать конкретный байтовый диапазон файла (object-storage или https).
 *  Для внешних URL — каждый раз валидируем хост (DNS-rebinding / TOCTOU
 *  между сегментами могли подменить A-запись на приватный IP). */
async function fetchByteRange(audioUrl: string, startBytes: number, endBytes: number): Promise<{ buffer: Buffer; totalBytes: number | null }> {
  if (audioUrl.startsWith("/objects/")) {
    let file;
    try { file = await storage.getObjectEntityFile(audioUrl); }
    catch (e) { if (e instanceof ObjectNotFoundError) throw new Error("audio_file_not_found"); throw e; }
    const [meta] = await file.getMetadata();
    const total = meta.size;
    const end = Math.min(total - 1, endBytes);
    const stream = file.createReadStream({ start: startBytes, end });
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    return { buffer: Buffer.concat(chunks), totalBytes: total };
  }
  // Внешний URL: повторная SSRF-валидация (хост, IP, scheme).
  // Без этого DNS-rebinding между probe и сегментами позволил бы попасть
  // во внутреннюю сеть после первого «честного» ответа.
  await assertSafeAudioUrl(audioUrl);
  const resp = await fetch(audioUrl, {
    method: "GET",
    headers: { Range: `bytes=${startBytes}-${endBytes}` },
    signal: AbortSignal.timeout(15_000),
    redirect: "manual",
  });
  if (resp.status >= 300 && resp.status < 400) throw new Error(`audio_redirect_blocked_${resp.status}`);
  if (!resp.ok && resp.status !== 206) throw new Error(`audio_fetch_${resp.status}`);
  const ab = await resp.arrayBuffer();
  return { buffer: Buffer.from(ab), totalBytes: null };
}

async function processFullScan(checkId: number, audioUrl: string, cfg: Required<AcrCloudConfig>, releaseId: number): Promise<void> {
  const startedAt = Date.now();
  const safeAudioUrl = safeUrl(audioUrl);
  try {
    // Шаг 1: один раз через fetchSample валидируем URL (SSRF-guard) + узнаём totalBytes.
    const probe = await fetchSample(audioUrl);
    const totalBytes = probe.totalBytes;
    const plans = planSegments(totalBytes);

    const segments: AcrCheckSegment[] = [];
    let topMatch: { title?: string; artist?: string; isrc?: string; score: number } | null = null;
    let matchedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      const segStart = Date.now();
      try {
        // Первый сегмент уже скачан в probe — переиспользуем чтоб не делать лишний HTTP.
        const buf = i === 0 && p.startBytes === probe.offsetBytes
          ? probe.buffer
          : (await fetchByteRange(audioUrl, p.startBytes, p.endBytes)).buffer;
        const r = await callAcrIdentify(cfg, buf);
        const took = Date.now() - segStart;
        if (!r.ok) {
          errorCount++;
          segments.push({ index: i, startPct: p.startPct, endPct: p.endPct, startBytes: p.startBytes, endBytes: p.endBytes, status: "error", error: r.error.slice(0, 200), tookMs: took });
          continue;
        }
        const status = r.result["status"] as { code?: number; msg?: string } | undefined;
        const md = r.result["metadata"] as { music?: Array<Record<string, unknown>> } | undefined;
        const matches = md?.music ?? [];
        if (status?.code === 0 && matches.length > 0) {
          matchedCount++;
          const top = matches[0];
          const artists = (top["artists"] as Array<{ name?: string }> | undefined)?.map((a) => a.name).filter(Boolean).join(", ");
          const externalIds = top["external_ids"] as { isrc?: string } | undefined;
          const score = typeof top["score"] === "number" ? top["score"] : 0;
          const matchedTitle = typeof top["title"] === "string" ? top["title"] : undefined;
          const matchedArtist = artists || undefined;
          const matchedIsrc = externalIds?.isrc;
          if (!topMatch || score > topMatch.score) topMatch = { title: matchedTitle, artist: matchedArtist, isrc: matchedIsrc, score };
          segments.push({ index: i, startPct: p.startPct, endPct: p.endPct, startBytes: p.startBytes, endBytes: p.endBytes, status: "matched", score, matchedTitle, matchedArtist, matchedIsrc, tookMs: took });
        } else if (status?.code === 1001) {
          segments.push({ index: i, startPct: p.startPct, endPct: p.endPct, startBytes: p.startBytes, endBytes: p.endBytes, status: "clean", tookMs: took });
        } else {
          errorCount++;
          segments.push({ index: i, startPct: p.startPct, endPct: p.endPct, startBytes: p.startBytes, endBytes: p.endBytes, status: "error", error: `code=${status?.code} ${status?.msg ?? ""}`.slice(0, 200), tookMs: took });
        }
      } catch (e) {
        errorCount++;
        segments.push({ index: i, startPct: p.startPct, endPct: p.endPct, startBytes: p.startBytes, endBytes: p.endBytes, status: "error", error: (e as Error).message.slice(0, 200), tookMs: Date.now() - segStart });
      }
      // ACRCloud free-tier лимит ~3 RPS — между окнами пауза 400 мс.
      if (i < plans.length - 1) await new Promise((r) => setTimeout(r, 400));
    }

    const finishedAt = Date.now();
    const finalStatus: "matched" | "clean" | "error" = matchedCount > 0 ? "matched" : (errorCount === segments.length ? "error" : "clean");

    await db.update(acrChecksTable).set({
      status: finalStatus,
      confidence: topMatch ? String(topMatch.score) : null,
      matchedTitle: topMatch?.title ?? null,
      matchedArtist: topMatch?.artist ?? null,
      matchedIsrc: topMatch?.isrc ?? null,
      segments,
      resultJson: {
        _scan_meta: {
          mode: "full",
          engine: "acrcloud",
          segments_count: segments.length,
          matched_count: matchedCount,
          error_count: errorCount,
          total_file_bytes: totalBytes,
          total_ms: finishedAt - startedAt,
          audio_url: safeAudioUrl,
          requested_at_utc: new Date(startedAt).toISOString(),
          completed_at_utc: new Date(finishedAt).toISOString(),
        },
        top_match: topMatch,
      },
      errorMessage: finalStatus === "error" ? "All segments failed (see segments[].error)" : null,
    }).where(eq(acrChecksTable.id, checkId));

    // Risk-engine увидит наличие full-scan и снимет/добавит факторы.
    void assessAndPersist(releaseId);
  } catch (e) {
    logger.warn({ err: e, checkId }, "[acr] full-scan background failed");
    await db.update(acrChecksTable).set({
      status: "error",
      errorMessage: `Full-scan: ${(e as Error).message}`,
      resultJson: { _scan_meta: { mode: "full", engine: "acrcloud", audio_url: safeAudioUrl, error: (e as Error).message } },
    }).where(eq(acrChecksTable.id, checkId)).catch(() => undefined);
  }
}

router.post("/distribution/acr/scan-full", async (req, res): Promise<void> => {
  const parsed = ScanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const { releaseId, trackId } = parsed.data;

  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, releaseId));
  if (!release) { res.status(404).json({ error: "Release not found" }); return; }

  let track: typeof tracksTable.$inferSelect | null = null;
  if (trackId) {
    const [t] = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId));
    if (!t) { res.status(404).json({ error: "Track not found" }); return; }
    track = t;
  } else {
    const [t] = await db.select().from(tracksTable).where(eq(tracksTable.releaseId, releaseId)).limit(1);
    track = t ?? null;
  }

  const cfg = await loadAcrConfig();
  const userId = req.session?.user?.id ?? null;

  if (!cfg.host || !cfg.accessKey || !cfg.accessSecret || cfg.enabled === false) {
    res.status(503).json({ error: "credentials_not_configured", message: "ACRCloud не настроен (Настройки → Интеграции)" });
    return;
  }
  if (!track?.audioUrl) {
    res.status(422).json({ error: "audio_url_missing", message: "У трека нет audio_url" });
    return;
  }

  const [row] = await db.insert(acrChecksTable).values({
    releaseId, trackId: track.id,
    status: "pending",
    mode: "full",
    engine: "acrcloud",
    scannedBy: userId,
  }).returning();
  void auditMutation(req, { action: "acr_scan_full", entityType: "acr_check", entityId: row.id, before: null, after: row });
  void processFullScan(row.id, track.audioUrl, cfg as Required<AcrCloudConfig>, releaseId);
  res.status(202).json(row);
});

// ── MusicBrainz ISRC validator ────────────────────────────────────────────
//
// Спрашивает у MusicBrainz: какие recording'и зарегистрированы под этим ISRC?
// Если ничего — clean (мы ставим свой ISRC). Если найдено что-то с другим
// артистом/названием — matched (это конфликт, наш ISRC уже занят).

const MbCheckBody = z.object({ trackId: z.number().int().positive() });

router.post("/distribution/musicbrainz/check-isrc", async (req, res): Promise<void> => {
  const parsed = MbCheckBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation", details: parsed.error.flatten() }); return; }
  const { trackId } = parsed.data;

  const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId));
  if (!track) { res.status(404).json({ error: "Track not found" }); return; }
  if (!track.isrc) {
    res.status(422).json({ error: "isrc_missing", message: "У трека нет ISRC — нечего проверять" });
    return;
  }
  // tracks.release_id nullable в схеме (orphan-треки разрешены),
  // но для проверки ISRC нам нужен релиз — без него непонятно куда писать
  // и кому принадлежит «наш» артист.
  const trackReleaseId = track.releaseId;
  if (trackReleaseId === null) {
    res.status(422).json({ error: "track_orphan", message: "Трек не привязан к релизу — проверка невозможна" });
    return;
  }

  const isrc = normalizeIsrc(track.isrc);
  if (!isrc) {
    res.status(422).json({ error: "isrc_invalid_format", message: `ISRC '${track.isrc}' не похож на правильный формат (CC-XXX-YY-NNNNN)` });
    return;
  }

  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, trackReleaseId));
  const [artist] = release ? await db.select({ name: artistsTable.name }).from(artistsTable).where(eq(artistsTable.id, release.artistId)) : [undefined];
  const ourArtist = artist?.name ?? "Unknown";
  const userId = req.session?.user?.id ?? null;

  const lookup = await lookupIsrc(isrc);
  if (lookup.kind === "error") {
    res.status(502).json({ error: "musicbrainz_error", message: lookup.message });
    return;
  }

  if (lookup.kind === "not_found") {
    const [row] = await db.insert(acrChecksTable).values({
      releaseId: trackReleaseId,
      trackId: track.id,
      status: "clean",
      engine: "musicbrainz_isrc",
      mode: "sample",
      matchedIsrc: isrc,
      resultJson: { engine: "musicbrainz_isrc", isrc, recordings: [], verdict: "isrc_not_in_mb" },
      scannedBy: userId,
    }).returning();
    void auditMutation(req, { action: "musicbrainz_isrc_check", entityType: "acr_check", entityId: row.id, before: null, after: row });
    void assessAndPersist(trackReleaseId);
    res.status(200).json(row);
    return;
  }

  // kind === "found"
  const conflict = detectIsrcConflict(track.title, ourArtist, lookup.recordings);
  const [row] = await db.insert(acrChecksTable).values({
    releaseId: trackReleaseId,
    trackId: track.id,
    status: conflict.conflict ? "matched" : "clean",
    engine: "musicbrainz_isrc",
    mode: "sample",
    matchedIsrc: isrc,
    matchedTitle: conflict.conflictingTitle ?? null,
    matchedArtist: conflict.conflictingArtist ?? null,
    confidence: lookup.recordings[0]?.score ? String(lookup.recordings[0].score) : null,
    resultJson: {
      engine: "musicbrainz_isrc",
      isrc,
      our_artist: ourArtist,
      our_title: track.title,
      recordings: lookup.recordings,
      verdict: conflict.conflict ? "isrc_owned_by_other" : "isrc_match_us",
    },
    scannedBy: userId,
  }).returning();
  void auditMutation(req, { action: "musicbrainz_isrc_check", entityType: "acr_check", entityId: row.id, before: null, after: row });
  void assessAndPersist(trackReleaseId);
  res.status(200).json(row);
});

// ── Moderation queue ────────────────────────────────────────────────────
//
// Релизы, ожидающие/прошедшие модерацию. По каждому релизу даём:
//   • базовые поля (title/artist/upc/type/submitted)
//   • сводку по аудио (сколько треков всего / сколько с реальным asset row)
//   • статус ACR-проверки (pending/clean/match/error/none)
//   • risk_score из risk-engine (если есть)
// Фильтр по статусу: pending_review (по умолчанию), approved, rejected, all.
router.get("/distribution/moderation", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  if (!scope.fullAccess) { res.status(403).json({ error: "Admin/manager only" }); return; }

  const status = typeof req.query.status === "string" ? req.query.status : "pending_review";
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);

  const statusFilter =
    status === "all"
      ? undefined
      : inArray(releasesTable.status, status.split(",").filter(Boolean));

  const releases = await db.select({
    id:           releasesTable.id,
    title:        releasesTable.title,
    artistId:     releasesTable.artistId,
    artistName:   artistsTable.name,
    releaseType:  releasesTable.releaseType,
    upc:          releasesTable.upc,
    status:       releasesTable.status,
    statusNote:   releasesTable.statusNote,
    submittedAt:  releasesTable.updatedAt,
    riskScore:    releasesTable.riskScore,
    riskFactors:  releasesTable.riskFactors,
  })
    .from(releasesTable)
    .leftJoin(artistsTable, eq(releasesTable.artistId, artistsTable.id))
    .where(statusFilter)
    .orderBy(desc(releasesTable.updatedAt))
    .limit(limit);

  if (releases.length === 0) { res.json({ items: [] }); return; }

  const releaseIds = releases.map((r) => r.id);

  // Tracks per release (count + how many with audio asset)
  const trackRows = await db.select({
    releaseId: tracksTable.releaseId,
    trackId:   tracksTable.id,
  }).from(tracksTable).where(inArray(tracksTable.releaseId, releaseIds));
  const trackIds = trackRows.map((t) => t.trackId);

  const audioAssets = trackIds.length > 0
    ? await db.select({ trackId: assetsTable.trackId }).from(assetsTable)
        .where(and(inArray(assetsTable.trackId, trackIds), eq(assetsTable.kind, "audio")))
    : [];
  const tracksWithAudio = new Set(audioAssets.map((a) => a.trackId).filter((x): x is number => x != null));

  const trackStatsByRelease = new Map<number, { total: number; withAudio: number }>();
  for (const t of trackRows) {
    if (t.releaseId == null) continue;
    const cur = trackStatsByRelease.get(t.releaseId) ?? { total: 0, withAudio: 0 };
    cur.total += 1;
    if (t.trackId != null && tracksWithAudio.has(t.trackId)) cur.withAudio += 1;
    trackStatsByRelease.set(t.releaseId, cur);
  }

  // Latest ACR check per release (берём самый свежий, агрегируем по статусу всех)
  const acrRows = await db.select({
    releaseId: acrChecksTable.releaseId,
    status:    acrChecksTable.status,
    scannedAt: acrChecksTable.scannedAt,
  }).from(acrChecksTable)
    .where(and(isNotNull(acrChecksTable.releaseId), inArray(acrChecksTable.releaseId, releaseIds)))
    .orderBy(desc(acrChecksTable.scannedAt));

  // Сворачиваем в один статус: если есть match — match; иначе если есть error — error;
  // иначе если есть clean — clean; иначе pending; иначе none.
  const acrByRelease = new Map<number, { status: string; lastScannedAt: string | null; total: number }>();
  for (const a of acrRows) {
    if (!a.releaseId) continue;
    const cur = acrByRelease.get(a.releaseId);
    if (!cur) {
      acrByRelease.set(a.releaseId, { status: a.status, lastScannedAt: a.scannedAt.toISOString(), total: 1 });
    } else {
      const order = ["match", "error", "pending", "clean"];
      const a1 = order.indexOf(cur.status);
      const a2 = order.indexOf(a.status);
      if (a2 >= 0 && (a1 < 0 || a2 < a1)) cur.status = a.status;
      cur.total += 1;
    }
  }

  res.json({
    items: releases.map((r) => {
      const ts = trackStatsByRelease.get(r.id) ?? { total: 0, withAudio: 0 };
      const acr = acrByRelease.get(r.id);
      const riskFactors = (r.riskFactors as unknown as Array<{ code: string; severity: string }> | null) ?? [];
      const issuesCount = riskFactors.filter((f) => f.severity === "error" || f.severity === "warning").length;
      return {
        id:           r.id,
        title:        r.title,
        artistId:     r.artistId,
        artistName:   r.artistName ?? "",
        releaseType:  r.releaseType,
        upc:          r.upc ?? "",
        status:       r.status,
        statusNote:   r.statusNote ?? null,
        submittedAt:  r.submittedAt.toISOString(),
        audio:        ts,
        acr: acr
          ? { status: acr.status, lastScannedAt: acr.lastScannedAt, totalChecks: acr.total }
          : { status: "none", lastScannedAt: null, totalChecks: 0 },
        riskScore:    r.riskScore ?? null,
        issuesCount,
      };
    }),
  });
});

// ── DSP Status — агрегация по партнёрам ─────────────────────────────────
//
// Сводка по каждой DSP/деливери-партнёру: сколько сообщений ушло/принято/
// отклонено/в очереди/с ошибками; когда в последний раз была отправка/ack;
// текущий integration.status (для подсветки «не настроено»). Используется на
// dashboard-вкладке «Статус площадок».
router.get("/distribution/dsp-status", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  if (!scope.fullAccess) { res.status(403).json({ error: "Admin/manager only" }); return; }

  // Группируем ddex_messages по partner_code + status
  const msgRows = await db.select({
    partnerCode: ddexMessagesTable.partnerCode,
    status:      ddexMessagesTable.status,
    cnt:         count(),
    lastSent:    sql<string | null>`max(${ddexMessagesTable.sentAt})`,
    lastAcked:   sql<string | null>`max(${ddexMessagesTable.ackedAt})`,
  })
    .from(ddexMessagesTable)
    .groupBy(ddexMessagesTable.partnerCode, ddexMessagesTable.status);

  // Параллельно — текущие настроенные DSP-/delivery-интеграции, чтобы
  // показать «настроено / не настроено» даже если по ним ещё нет сообщений.
  const integrations = await db.select({
    code:       integrationsTable.code,
    name:       integrationsTable.name,
    status:     integrationsTable.status,
    category:   integrationsTable.category,
  }).from(integrationsTable)
    .where(or(eq(integrationsTable.category, "dsp"), eq(integrationsTable.category, "delivery")));

  type DspRow = {
    code: string;
    name: string;
    integrationStatus: string | null;
    counts: { sent: number; acked: number; rejected: number; queued: number; invalid: number; cancelled: number; draft: number; validated: number };
    totalMessages: number;
    lastSentAt: string | null;
    lastAckedAt: string | null;
  };

  const map = new Map<string, DspRow>();
  for (const i of integrations) {
    map.set(i.code, {
      code: i.code, name: i.name, integrationStatus: i.status,
      counts: { sent: 0, acked: 0, rejected: 0, queued: 0, invalid: 0, cancelled: 0, draft: 0, validated: 0 },
      totalMessages: 0, lastSentAt: null, lastAckedAt: null,
    });
  }
  for (const m of msgRows) {
    let row = map.get(m.partnerCode);
    if (!row) {
      row = {
        code: m.partnerCode, name: m.partnerCode, integrationStatus: null,
        counts: { sent: 0, acked: 0, rejected: 0, queued: 0, invalid: 0, cancelled: 0, draft: 0, validated: 0 },
        totalMessages: 0, lastSentAt: null, lastAckedAt: null,
      };
      map.set(m.partnerCode, row);
    }
    if (m.status in row.counts) (row.counts as Record<string, number>)[m.status] = m.cnt;
    row.totalMessages += m.cnt;
    if (m.lastSent && (!row.lastSentAt || m.lastSent > row.lastSentAt)) row.lastSentAt = m.lastSent;
    if (m.lastAcked && (!row.lastAckedAt || m.lastAcked > row.lastAckedAt)) row.lastAckedAt = m.lastAcked;
  }

  res.json({ items: Array.from(map.values()).sort((a, b) => b.totalMessages - a.totalMessages || a.name.localeCompare(b.name)) });
});

// ── Scheduled — релизы с будущей датой релиза ────────────────────────────
//
// Берём релизы, у которых releaseDate >= today и они в активном статусе
// (approved/live/delivering — то есть уже могут уйти/ушли в DSP, но дата ещё
// не наступила). Для status='draft' такие релизы не показываем (они ещё в
// работе). Используется для календаря выпусков.
router.get("/distribution/scheduled", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  if (!scope.fullAccess) { res.status(403).json({ error: "Admin/manager only" }); return; }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const from = typeof req.query.from === "string" ? req.query.from : today;
  const to   = typeof req.query.to === "string" ? req.query.to : null;

  const conds = [
    isNotNull(releasesTable.releaseDate),
    gte(releasesTable.releaseDate, from),
    inArray(releasesTable.status, ["approved", "live", "delivering", "pending_review"]),
  ];
  if (to) conds.push(lte(releasesTable.releaseDate, to));

  const rows = await db.select({
    id:          releasesTable.id,
    title:       releasesTable.title,
    artistName:  artistsTable.name,
    releaseType: releasesTable.releaseType,
    upc:         releasesTable.upc,
    status:      releasesTable.status,
    releaseDate: releasesTable.releaseDate,
    releaseTime: releasesTable.releaseTime,
  })
    .from(releasesTable)
    .leftJoin(artistsTable, eq(releasesTable.artistId, artistsTable.id))
    .where(and(...conds))
    .orderBy(releasesTable.releaseDate)
    .limit(200);

  res.json({
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      artistName: r.artistName ?? "",
      releaseType: r.releaseType,
      upc: r.upc ?? "",
      status: r.status,
      releaseDate: r.releaseDate,
      releaseTime: r.releaseTime ?? null,
    })),
  });
});

// ── Disputes (фильтрованные конфликты по релизам) ─────────────────────────
router.get("/distribution/disputes", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const where = status
    ? and(eq(rightsConflictsTable.assetType, "release"), eq(rightsConflictsTable.status, status))
    : eq(rightsConflictsTable.assetType, "release");
  const rows = await db.select().from(rightsConflictsTable).where(where).orderBy(desc(rightsConflictsTable.createdAt)).limit(200);
  res.json({ disputes: rows });
});

// ── Backfill audio tech metadata ─────────────────────────────────────────
//
// Одноразовый endpoint: для каждого assets.kind='audio' БЕЗ sample_rate_hz
// читает локальный файл через music-metadata и заполняет sample_rate_hz,
// bit_depth, channels, codec, bitrate_kbps. Используется один раз после
// миграции 0018, и каждый раз когда добавляется аудио без правильных метатэгов.
router.post("/distribution/backfill-audio-tech", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  if (!scope.fullAccess) { res.status(403).json({ error: "Admin/manager only" }); return; }

  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 500);
  const rows = await db.select({
    id: assetsTable.id,
    objectPath: assetsTable.objectPath,
    storageKey: assetsTable.storageKey,
    mimeType: assetsTable.mimeType,
    sizeBytes: assetsTable.sizeBytes,
  }).from(assetsTable)
    .where(and(eq(assetsTable.kind, "audio"), sql`${assetsTable.sampleRateHz} IS NULL`))
    .limit(limit);

  let updated = 0; let failed = 0;
  for (const r of rows) {
    const localPath = resolveAssetLocalPath(r.objectPath, r.storageKey);
    if (!localPath) { failed += 1; continue; }
    try {
      const stream = createReadStream(localPath);
      const meta = await mm.parseStream(
        stream as unknown as Readable,
        { mimeType: r.mimeType, size: r.sizeBytes },
        { duration: true },
      );
      const f = meta.format;
      stream.destroy();
      await db.update(assetsTable).set({
        durationSeconds: f.duration ? Math.round(f.duration) : undefined,
        sampleRateHz: f.sampleRate ?? null,
        bitDepth: f.bitsPerSample ?? null,
        channels: f.numberOfChannels ?? null,
        codec: f.codec ?? f.container ?? null,
        bitrateKbps: f.bitrate ? Math.round(f.bitrate / 1000) : null,
      }).where(eq(assetsTable.id, r.id));
      updated += 1;
    } catch (err) {
      logger.warn({ err, assetId: r.id }, "backfill-audio-tech failed");
      failed += 1;
    }
  }

  res.json({ scanned: rows.length, updated, failed });
});

// ── Moderation detail (полная карточка релиза для модерации) ────────────
//
// Отдаёт админу всё необходимое для решения «одобрить/отклонить»:
//   • полную карточку релиза (cover, артисты с ролями, лейбл, UPC, c/p line,
//     жанр, даты, тип, выбранные DSP)
//   • список треков со всеми Audio Details (ISRC, версия, длительность,
//     контрибьюторы — writers/performers/production, lyrics, языки)
//   • аудио-файл по каждому треку: формат, sample rate, bit depth, channels,
//     размер + проверка соответствия требованиям (lossless, 44.1+ kHz, 16+ bit)
//   • cover-ассет: размеры файла + предупреждение если меньше 3000×3000
//   • историю ACR по релизу (последние сегменты)
//   • risk score / факторы
//   • автоматический QC-чеклист с issues для top-banner ("N issues")
router.get("/distribution/moderation/:releaseId/details", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  if (!scope.fullAccess) { res.status(403).json({ error: "Admin/manager only" }); return; }

  const releaseId = parseInt(req.params.releaseId, 10);
  if (!releaseId) { res.status(400).json({ error: "Invalid releaseId" }); return; }

  const [release] = await db.select().from(releasesTable).where(eq(releasesTable.id, releaseId));
  if (!release) { res.status(404).json({ error: "Release not found" }); return; }

  // Артист (legacy) + лейбл
  const [legacyArtist] = await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable).where(eq(artistsTable.id, release.artistId));
  const label = release.labelId
    ? (await db.select({ id: labelsTable.id, name: labelsTable.name }).from(labelsTable).where(eq(labelsTable.id, release.labelId)))[0] ?? null
    : null;

  // Multi-primary artists через release_artists
  const releaseArtists = await db.select({
    artistId: releaseArtistsTable.artistId,
    role: releaseArtistsTable.role,
    position: releaseArtistsTable.position,
    name: artistsTable.name,
  }).from(releaseArtistsTable)
    .innerJoin(artistsTable, eq(artistsTable.id, releaseArtistsTable.artistId))
    .where(eq(releaseArtistsTable.releaseId, releaseId))
    .orderBy(asc(releaseArtistsTable.position), asc(releaseArtistsTable.id));

  // Выбранные DSP
  const dsps = (await db.select({ code: releaseDspsTable.dspCode })
    .from(releaseDspsTable)
    .where(eq(releaseDspsTable.releaseId, releaseId))).map((r) => r.code);

  // Cover asset
  const [coverAsset] = await db.select().from(assetsTable)
    .where(and(eq(assetsTable.releaseId, releaseId), inArray(assetsTable.kind, ["cover", "image"])))
    .orderBy(desc(assetsTable.createdAt))
    .limit(1);

  // Tracks + audio assets
  const tracks = await db.select().from(tracksTable)
    .where(eq(tracksTable.releaseId, releaseId))
    .orderBy(asc(tracksTable.trackNumber), asc(tracksTable.id));

  const trackIds = tracks.map((t) => t.id);
  const audioAssets = trackIds.length
    ? await db.select().from(assetsTable)
        .where(and(inArray(assetsTable.trackId, trackIds), eq(assetsTable.kind, "audio")))
    : [];
  const audioByTrack = new Map<number, typeof audioAssets[number]>();
  for (const a of audioAssets) if (a.trackId != null && !audioByTrack.has(a.trackId)) audioByTrack.set(a.trackId, a);

  // ACR checks по релизу (история, последние 50)
  const acrChecks = await db.select().from(acrChecksTable)
    .where(eq(acrChecksTable.releaseId, releaseId))
    .orderBy(desc(acrChecksTable.scannedAt))
    .limit(50);

  // ── Audio File Requirements (Symphonic / DDEX baseline) ────────────────
  const REQ = { losslessMimes: ["audio/wav", "audio/x-wav", "audio/wave", "audio/flac", "audio/x-flac"], minSampleRate: 44100, minBitDepth: 16 };

  function checkTrackAudio(a: typeof audioAssets[number] | undefined) {
    if (!a) return { ok: false, missing: true, checks: { format: false, sampleRate: false, bitDepth: false } };
    const isLossless = REQ.losslessMimes.includes(a.mimeType.toLowerCase());
    const srOk = (a.sampleRateHz ?? 0) >= REQ.minSampleRate;
    const bdOk = (a.bitDepth ?? 0) >= REQ.minBitDepth;
    return {
      ok: isLossless && srOk && bdOk,
      missing: false,
      checks: { format: isLossless, sampleRate: srOk, bitDepth: bdOk },
    };
  }

  // ── Auto QC issues ─────────────────────────────────────────────────────
  const issues: { code: string; severity: "error" | "warning"; message: string; trackId?: number }[] = [];
  if (!release.upc) issues.push({ code: "missing_upc", severity: "error", message: "UPC не указан" });
  if (!release.releaseDate) issues.push({ code: "missing_release_date", severity: "error", message: "Дата релиза не указана" });
  if (!coverAsset) issues.push({ code: "missing_cover", severity: "error", message: "Обложка не загружена" });
  else if (coverAsset.sizeBytes < 200_000) issues.push({ code: "small_cover", severity: "warning", message: "Обложка возможно меньше 3000×3000 (файл < 200 КБ)" });
  if (!releaseArtists.length) issues.push({ code: "no_artists", severity: "error", message: "Не указаны primary-артисты релиза" });
  if (tracks.length === 0) issues.push({ code: "no_tracks", severity: "error", message: "В релизе нет треков" });

  for (const t of tracks) {
    if (!t.isrc) issues.push({ code: "missing_isrc", severity: "error", message: `Track ${t.trackNumber ?? "?"}: ISRC не указан`, trackId: t.id });
    const audio = audioByTrack.get(t.id);
    const ck = checkTrackAudio(audio);
    if (ck.missing) issues.push({ code: "missing_audio", severity: "error", message: `Track ${t.trackNumber ?? "?"}: аудио-файл не загружен`, trackId: t.id });
    else {
      if (!ck.checks.format)     issues.push({ code: "non_lossless",     severity: "error",   message: `Track ${t.trackNumber ?? "?"}: формат не lossless (${audio?.mimeType ?? "—"})`,        trackId: t.id });
      if (!ck.checks.sampleRate) issues.push({ code: "low_sample_rate",  severity: "warning", message: `Track ${t.trackNumber ?? "?"}: sample rate ${audio?.sampleRateHz ?? "?"} Hz (требуется ≥ ${REQ.minSampleRate})`, trackId: t.id });
      if (!ck.checks.bitDepth)   issues.push({ code: "low_bit_depth",    severity: "warning", message: `Track ${t.trackNumber ?? "?"}: bit depth ${audio?.bitDepth ?? "?"} (требуется ≥ ${REQ.minBitDepth})`,         trackId: t.id });
    }
    const writersTotal = ((t.writers as Array<{ share?: number }> | null) ?? []).reduce((s, w) => s + (w.share ?? 0), 0);
    if (writersTotal > 0 && Math.abs(writersTotal - 100) > 0.01) {
      issues.push({ code: "writers_share_mismatch", severity: "warning", message: `Track ${t.trackNumber ?? "?"}: сумма долей авторов = ${writersTotal}% (должна быть 100%)`, trackId: t.id });
    }
  }

  // Группировка ACR по релизу: общий статус
  const order = ["match", "error", "pending", "clean"];
  let acrStatus: string = "none";
  for (const c of acrChecks) {
    const a1 = order.indexOf(acrStatus);
    const a2 = order.indexOf(c.status);
    if (a2 >= 0 && (a1 < 0 || a2 < a1)) acrStatus = c.status;
  }

  res.json({
    release: {
      id: release.id,
      title: release.title,
      releaseType: release.releaseType,
      releaseVersion: release.releaseVersion,
      catalogNumber: release.catalogNumber,
      upc: release.upc,
      status: release.status,
      statusNote: release.statusNote,
      genre: release.genre,
      subgenre: release.subgenre,
      language: release.language,
      isExplicit: release.isExplicit,
      isCompilation: release.isCompilation,
      isVariousArtists: release.isVariousArtists,
      releaseDate: release.releaseDate,
      releaseTime: release.releaseTime,
      cLine: release.cLine, cLineYear: release.cLineYear,
      pLine: release.pLine, pLineYear: release.pLineYear,
      submittedAt: release.updatedAt.toISOString(),
      riskScore: release.riskScore ?? null,
      riskFactors: release.riskFactors ?? [],
    },
    legacyArtist,
    label,
    artists: releaseArtists,
    dsps,
    cover: coverAsset ? {
      id: coverAsset.id,
      filename: coverAsset.filename,
      mimeType: coverAsset.mimeType,
      sizeBytes: coverAsset.sizeBytes,
      objectPath: coverAsset.objectPath,
    } : null,
    tracks: tracks.map((t) => {
      const audio = audioByTrack.get(t.id);
      const ck = checkTrackAudio(audio);
      return {
        id: t.id,
        position: t.trackNumber,
        title: t.title,
        trackVersion: t.trackVersion,
        isrc: t.isrc,
        durationSeconds: audio?.durationSeconds ?? t.durationSeconds ?? null,
        explicitStatus: t.explicitStatus,
        aiUsage: t.aiUsage,
        recordingYear: t.recordingYear,
        countryOfRecording: t.countryOfRecording,
        audioStyle: t.audioStyle,
        vocalLanguage: t.vocalLanguage,
        hasLyrics: !!(t.lyrics && t.lyrics.trim().length > 0),
        displayArtists: t.displayArtists ?? [],
        writers: t.writers ?? [],
        performers: t.performers ?? [],
        production: t.production ?? [],
        audio: audio ? {
          filename: audio.filename,
          mimeType: audio.mimeType,
          sizeBytes: audio.sizeBytes,
          sampleRateHz: audio.sampleRateHz,
          bitDepth: audio.bitDepth,
          channels: audio.channels,
          codec: audio.codec,
          bitrateKbps: audio.bitrateKbps,
        } : null,
        requirements: ck,
      };
    }),
    acr: {
      status: acrStatus,
      totalChecks: acrChecks.length,
      latest: acrChecks.slice(0, 5).map((c) => ({
        id: c.id,
        scannedAt: c.scannedAt.toISOString(),
        status: c.status,
        confidence: c.confidence,
        matchedTitle: c.matchedTitle,
        matchedArtist: c.matchedArtist,
      })),
    },
    requirements: REQ,
    issues,
  });
});

export default router;
