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
import { db, acrChecksTable, releasesTable, tracksTable, rightsConflictsTable, platformSettingsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { auditMutation } from "../lib/audit";
import { logger } from "../lib/logger";
import { getIntegrationByCode, loadCredentials } from "../services/integrations-service";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

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
  } catch { return {}; }
}

router.get("/distribution/acr/checks", async (req, res) => {
  const releaseId = req.query.releaseId ? Number(req.query.releaseId) : null;
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
async function fetchSample(audioUrl: string, maxBytes = 1_048_576): Promise<Buffer> {
  // ── Локальный файл хранилища ───────────────────────────────────────────────
  if (audioUrl.startsWith("/objects/")) {
    let file;
    try {
      file = await storage.getObjectEntityFile(audioUrl);
    } catch (e) {
      if (e instanceof ObjectNotFoundError) throw new Error("audio_file_not_found");
      throw e;
    }
    const stream = file.createReadStream({ start: 0, end: maxBytes - 1 });
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    return Buffer.concat(chunks).subarray(0, maxBytes);
  }

  // ── Внешний URL — SSRF-guard + HTTP fetch ─────────────────────────────────
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

  const resp = await fetch(audioUrl, {
    method: "GET",
    headers: { Range: `bytes=0-${maxBytes - 1}` },
    signal: AbortSignal.timeout(15_000),
    redirect: "manual",
  });
  if (resp.status >= 300 && resp.status < 400) throw new Error(`audio_redirect_blocked_${resp.status}`);
  if (!resp.ok && resp.status !== 206) throw new Error(`audio_fetch_${resp.status}`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab).subarray(0, maxBytes);
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
async function processAcrCheck(checkId: number, audioUrl: string, cfg: Required<AcrCloudConfig>): Promise<void> {
  try {
    const sample = await fetchSample(audioUrl);
    const r = await callAcrIdentify(cfg, sample);
    if (!r.ok) {
      await db.update(acrChecksTable).set({ status: "error", errorMessage: r.error }).where(eq(acrChecksTable.id, checkId));
      return;
    }
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
        resultJson: r.result,
        errorMessage: null,
      }).where(eq(acrChecksTable.id, checkId));
    } else if (status?.code === 1001) {
      // "No result" — это нормальный кейс: трек не найден в базе ACRCloud
      await db.update(acrChecksTable).set({
        status: "clean",
        resultJson: r.result,
        errorMessage: null,
      }).where(eq(acrChecksTable.id, checkId));
    } else {
      await db.update(acrChecksTable).set({
        status: "error",
        errorMessage: `ACRCloud: ${status?.msg ?? "unknown"} (code=${status?.code})`,
        resultJson: r.result,
      }).where(eq(acrChecksTable.id, checkId));
    }
  } catch (e) {
    logger.warn({ err: e, checkId }, "[acr] background processing failed");
    await db.update(acrChecksTable).set({
      status: "error",
      errorMessage: `Background: ${(e as Error).message}`,
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

// ── Disputes (фильтрованные конфликты по релизам) ─────────────────────────
router.get("/distribution/disputes", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const where = status
    ? and(eq(rightsConflictsTable.assetType, "release"), eq(rightsConflictsTable.status, status))
    : eq(rightsConflictsTable.assetType, "release");
  const rows = await db.select().from(rightsConflictsTable).where(where).orderBy(desc(rightsConflictsTable.createdAt)).limit(200);
  res.json({ disputes: rows });
});

export default router;
