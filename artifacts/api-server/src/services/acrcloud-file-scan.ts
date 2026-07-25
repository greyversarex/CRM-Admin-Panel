/**
 * Проверка трека по базе ACRCloud через File Scanning API.
 *
 * Отличие от того, что было раньше:
 *  - Identify API (`connectors/acrcloud.ts`) умеет смотреть только на кусок
 *    до 5 МБ / ~15 сек. Чтобы покрыть трек целиком, старый код резал файл на
 *    5 окон и делал 5 отдельных вызовов — отсюда rate-limit, «4 из 5 сегментов
 *    упали» и вечные code=2004.
 *  - File Scanning принимает файл ЦЕЛИКОМ (до 500 МБ) и сам возвращает список
 *    совпавших участков с таймкодами. Никакой ручной нарезки.
 *
 * Поток: upload → ACRCloud обрабатывает асинхронно → опрашиваем состояние →
 * нормализуем результат в AcrFileScanMatch[] и кладём в acr_checks.result_json.
 *
 * UPC/ISRC у нашего релиза не нужны — матч идёт по отпечатку звука.
 *
 * Документация: https://docs.acrcloud.com/reference/console-api/file-scanning
 */

import { db, acrChecksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { assertSafeAudioUrl } from "../lib/ssrf-guard";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getIntegrationByCode, loadCredentials } from "./integrations-service";
import { buildFsConfig, type FsConfig } from "../connectors/acrcloud-fs";

const storage = new ObjectStorageService();

/**
 * Нормализованное совпадение — ровно те поля, которые показывает UI
 * (см. модалку «Music recognition matches by ACRCloud»).
 */
export type AcrFileScanMatch = {
  title: string | null;
  artist: string | null;
  album: string | null;
  label: string | null;
  upc: string | null;
  isrc: string | null;
  releaseDate: string | null;
  /** score 0..100 */
  confidence: number | null;
  /** Ключи DSP, где трек найден: spotify | deezer | youtube | … */
  foundOn: string[];
  /** Границы совпавшего участка в НАШЕМ файле, мс. */
  matchedFromMs: number | null;
  matchedToMs: number | null;
  /** Сколько отдельных участков файла совпало с этим треком. */
  segments: number;
  acrid: string | null;
};

/** Что кладём в acr_checks.result_json для engine='acrcloud_fs'. */
export type AcrFileScanResult = {
  matches: AcrFileScanMatch[];
  scannedSegments: number;
  fs: { host: string; containerId: string; fileId: string; state: number };
  _scan_meta: Record<string, unknown>;
};

/** Больше этого не грузим: лимит ACRCloud 500 МБ, но и наш трафик не бесконечный. */
const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;

/** Опрос результата: ~5 минут суммарно. */
const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_ATTEMPTS = 60;

// ── Конфиг ────────────────────────────────────────────────────────────────

/** Читает настройки интеграции acrcloud_fs. null — не настроено. */
export async function loadFileScanConfig(): Promise<FsConfig | null> {
  try {
    const integration = await getIntegrationByCode("acrcloud_fs");
    if (!integration || integration.status === "disconnected") return null;
    const creds = await loadCredentials(integration.id);
    return buildFsConfig(creds, (integration.config ?? {}) as Record<string, unknown>);
  } catch (e) {
    logger.error({ err: e }, "[acr-fs] loadFileScanConfig failed");
    return null;
  }
}

export async function isFileScanConfigured(): Promise<boolean> {
  return (await loadFileScanConfig()) !== null;
}

// ── Чтение аудио целиком ──────────────────────────────────────────────────

/**
 * Читает весь аудиофайл в память.
 * Локальные `/objects/...` — прямо из хранилища, внешние URL — через HTTP
 * с SSRF-guard. Оба пути ограничены MAX_UPLOAD_BYTES.
 */
async function readWholeAudio(audioUrl: string): Promise<Buffer> {
  if (audioUrl.startsWith("/objects/")) {
    let file;
    try {
      file = await storage.getObjectEntityFile(audioUrl);
    } catch (e) {
      if (e instanceof ObjectNotFoundError) throw new Error("Аудиофайл не найден в хранилище");
      throw e;
    }
    const [meta] = await file.getMetadata();
    if (typeof meta.size === "number" && meta.size > MAX_UPLOAD_BYTES) {
      throw new Error(`Файл слишком большой (${(meta.size / 1024 / 1024).toFixed(0)} МБ), лимит ${MAX_UPLOAD_BYTES / 1024 / 1024} МБ`);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    const stream = file.createReadStream();
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_UPLOAD_BYTES) { stream.destroy(); reject(new Error("Файл превысил лимит размера при чтении")); return; }
        chunks.push(chunk);
      });
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    return Buffer.concat(chunks);
  }

  await assertSafeAudioUrl(audioUrl);
  const resp = await fetch(audioUrl, { signal: AbortSignal.timeout(120_000), redirect: "manual" });
  if (resp.status >= 300 && resp.status < 400) throw new Error(`Скачивание аудио заблокировано (редирект ${resp.status})`);
  if (!resp.ok) throw new Error(`Не удалось скачать аудио: HTTP ${resp.status}`);
  const cl = resp.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_UPLOAD_BYTES) throw new Error("Файл слишком большой для проверки");
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error("Файл слишком большой для проверки");
  return buf;
}

// ── Вызовы ACRCloud ───────────────────────────────────────────────────────

function fsHeaders(cfg: FsConfig): Record<string, string> {
  return { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" };
}

/** Загружает файл в контейнер. Возвращает id файла в ACRCloud. */
async function uploadFile(cfg: FsConfig, audio: Buffer, fileName: string): Promise<string> {
  const form = new FormData();
  form.append("data_type", "audio");
  form.append("name", fileName);
  form.append("file", new Blob([new Uint8Array(audio)]), fileName);

  const url = `https://${cfg.host}/api/fs-containers/${encodeURIComponent(cfg.containerId)}/files`;
  const res = await fetch(url, {
    method: "POST",
    headers: fsHeaders(cfg),
    body: form,
    signal: AbortSignal.timeout(300_000),
  });

  const text = await res.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* не JSON */ }

  if (res.status === 401 || res.status === 403) throw new Error("ACRCloud: неверный API Token (проверьте Настройки → Интеграции)");
  if (res.status === 404) throw new Error(`ACRCloud: контейнер #${cfg.containerId} не найден`);
  if (!res.ok) {
    const msg = (body as { message?: string } | null)?.message;
    throw new Error(`ACRCloud отклонил загрузку: HTTP ${res.status}${msg ? ` — ${msg}` : ""}`);
  }

  const id = (body as { data?: { id?: unknown } } | null)?.data?.id;
  if (id === undefined || id === null) throw new Error("ACRCloud не вернул id загруженного файла");
  return String(id);
}

type FsFileState = { state: number; results: unknown; durationSec: number | null };

/** Забирает текущее состояние и результаты файла. */
async function fetchFileState(cfg: FsConfig, fileId: string): Promise<FsFileState> {
  const url = `https://${cfg.host}/api/fs-containers/${encodeURIComponent(cfg.containerId)}/files/${encodeURIComponent(fileId)}`;
  const res = await fetch(url, { headers: fsHeaders(cfg), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`ACRCloud: не удалось получить результат (HTTP ${res.status})`);

  const body = await res.json() as { data?: unknown };
  // Одиночный GET может вернуть и объект, и массив из одного элемента.
  const raw = Array.isArray(body.data) ? body.data[0] : body.data;
  const rec = (raw ?? {}) as { state?: unknown; results?: unknown; duration?: unknown };

  return {
    state: typeof rec.state === "number" ? rec.state : 0,
    results: rec.results ?? null,
    durationSec: typeof rec.duration === "number" ? rec.duration : null,
  };
}

// ── Нормализация ──────────────────────────────────────────────────────────

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function firstString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** «Found On» — ключи внешних сервисов, где ACRCloud нашёл этот трек. */
function extractFoundOn(external: unknown): string[] {
  if (!external || typeof external !== "object" || Array.isArray(external)) return [];
  return Object.entries(external as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(([k]) => k);
}

/**
 * Превращает сырой results.music[] в список совпадений.
 *
 * ACRCloud возвращает ОДНУ запись на каждый совпавший участок, поэтому один и
 * тот же трек приходит несколько раз. Схлопываем по acrid (или title+artist),
 * считаем количество участков и берём самый ранний/поздний таймкод — так UI
 * показывает «2 Segments» и «Matched Segment 00:02 – 00:13», как в ACRCloud.
 */
export function normalizeFileScanResults(results: unknown): AcrFileScanMatch[] {
  const container = (results ?? {}) as Record<string, unknown>;
  const music = asArray(container["music"]);

  const byKey = new Map<string, AcrFileScanMatch>();

  for (const entry of music) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const r = (e["result"] ?? e) as Record<string, unknown>;

    const title = firstString(r["title"]);
    const artists = asArray(r["artists"])
      .map((a) => (a && typeof a === "object" ? firstString((a as Record<string, unknown>)["name"]) : null))
      .filter((s): s is string => s !== null);
    const artist = artists.length ? artists.join(", ") : null;

    const albumObj = r["album"];
    const album = albumObj && typeof albumObj === "object"
      ? firstString((albumObj as Record<string, unknown>)["name"])
      : firstString(albumObj);

    const extIds = (r["external_ids"] ?? {}) as Record<string, unknown>;
    const acrid = firstString(r["acrid"]);

    // offset/played_duration приходят в СЕКУНДАХ, sample_*_offset_ms — в мс.
    const offsetSec = typeof e["offset"] === "number" ? e["offset"] : null;
    const playedSec = typeof e["played_duration"] === "number" ? e["played_duration"] : null;
    const beginMs = typeof r["sample_begin_time_offset_ms"] === "number"
      ? r["sample_begin_time_offset_ms"]
      : offsetSec !== null ? Math.round(offsetSec * 1000) : null;
    const endMs = typeof r["sample_end_time_offset_ms"] === "number"
      ? r["sample_end_time_offset_ms"]
      : beginMs !== null && playedSec !== null ? beginMs + Math.round(playedSec * 1000) : null;

    const score = typeof r["score"] === "number" ? r["score"] : null;

    const key = acrid ?? `${title ?? "?"}|${artist ?? "?"}`;
    const existing = byKey.get(key);

    if (existing) {
      existing.segments += 1;
      if (beginMs !== null && (existing.matchedFromMs === null || beginMs < existing.matchedFromMs)) existing.matchedFromMs = beginMs;
      if (endMs !== null && (existing.matchedToMs === null || endMs > existing.matchedToMs)) existing.matchedToMs = endMs;
      if (score !== null && (existing.confidence === null || score > existing.confidence)) existing.confidence = score;
      continue;
    }

    byKey.set(key, {
      title,
      artist,
      album,
      label: firstString(r["label"]),
      upc: firstString(extIds["upc"]),
      isrc: firstString(extIds["isrc"]),
      releaseDate: firstString(r["release_date"]),
      confidence: score,
      foundOn: extractFoundOn(r["external_metadata"]),
      matchedFromMs: beginMs,
      matchedToMs: endMs,
      segments: 1,
      acrid,
    });
  }

  // Самые уверенные — наверх, чтобы модератор сразу видел главное.
  return Array.from(byKey.values()).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

// ── Основной сценарий ─────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Фоновая обработка проверки: загрузка → опрос → запись результата.
 * Всегда доводит строку acr_checks до финального статуса (clean/matched/error) —
 * «вечный pending» это баг, из-за которого модератор не понимает, что происходит.
 */
export async function runFileScan(
  checkId: number,
  audioUrl: string,
  trackTitle: string,
  cfg: FsConfig,
): Promise<void> {
  const startedAt = Date.now();
  const meta: Record<string, unknown> = {
    engine: "acrcloud_fs",
    mode: "file_scan",
    audio_url: audioUrl,
    requested_at_utc: new Date().toISOString(),
  };

  const fail = async (message: string) => {
    meta["failed_at_utc"] = new Date().toISOString();
    meta["total_ms"] = Date.now() - startedAt;
    await db.update(acrChecksTable).set({
      status: "error",
      errorMessage: message,
      resultJson: { _scan_meta: meta } as Record<string, unknown>,
    }).where(eq(acrChecksTable.id, checkId)).catch(() => undefined);
  };

  try {
    const audio = await readWholeAudio(audioUrl);
    meta["file_bytes"] = audio.length;

    const safeName = `${trackTitle || "track"}`.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 80);
    const fileId = await uploadFile(cfg, audio, `${safeName}.audio`);
    meta["fs_file_id"] = fileId;
    meta["uploaded_at_utc"] = new Date().toISOString();

    // Опрос до готовности. state: 0 — в обработке, 1 — готово,
    // -1 — совпадений нет, -2/-3 — ошибка на стороне ACRCloud.
    let state = 0;
    let results: unknown = null;
    let attempts = 0;

    while (attempts < POLL_MAX_ATTEMPTS) {
      await sleep(POLL_INTERVAL_MS);
      attempts += 1;
      const snap = await fetchFileState(cfg, fileId);
      state = snap.state;
      results = snap.results;
      if (state !== 0) break;
    }
    meta["poll_attempts"] = attempts;
    meta["fs_state"] = state;

    if (state === 0) {
      await fail(`ACRCloud не успел обработать файл за ${Math.round((POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 60000)} мин. Файл загружен (id ${fileId}) — повторите проверку позже.`);
      return;
    }
    if (state === -2 || state === -3) {
      await fail(`ACRCloud не смог обработать файл (state=${state}). Обычно это битый или неподдерживаемый аудиоформат.`);
      return;
    }

    const matches = state === -1 ? [] : normalizeFileScanResults(results);
    const scannedSegments = matches.reduce((sum, m) => sum + m.segments, 0);

    meta["completed_at_utc"] = new Date().toISOString();
    meta["total_ms"] = Date.now() - startedAt;
    meta["matched_count"] = matches.length;

    const payload: AcrFileScanResult = {
      matches,
      scannedSegments,
      fs: { host: cfg.host, containerId: cfg.containerId, fileId, state },
      _scan_meta: meta,
    };

    const top = matches[0];
    await db.update(acrChecksTable).set({
      status: matches.length > 0 ? "matched" : "clean",
      confidence: top?.confidence != null ? String(top.confidence) : null,
      matchedTitle: top?.title ?? null,
      matchedArtist: top?.artist ?? null,
      matchedIsrc: top?.isrc ?? null,
      matchedLabel: top?.label ?? null,
      resultJson: payload as unknown as Record<string, unknown>,
      errorMessage: null,
    }).where(eq(acrChecksTable.id, checkId));
  } catch (e) {
    logger.warn({ err: e, checkId }, "[acr-fs] file scan failed");
    await fail(e instanceof Error ? e.message : "Неизвестная ошибка проверки");
  }
}
