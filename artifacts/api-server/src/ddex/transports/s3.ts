/**
 * S3-транспорт DDEX-доставки (AWS Signature V4, без AWS SDK).
 *
 * Используется партнёрами, которые принимают поставки через свой S3-бакет —
 * в частности ACRCloud (direct partnership): регион us-east-1, бакет партнёра,
 * префикс TajikMusic/. Мы кладём в бакет XML + полные WAV-файлы + cover,
 * последним — BatchComplete_<batchRef>.xml как сигнал «пакет готов».
 *
 * Required ctx.config: bucket, region (опц. prefix)
 * Required ctx.credentials: access_key_id, secret_access_key
 *
 * Подпись SigV4 написана вручную (как в connectors/api-validators.ts s3HeadBucket),
 * чтобы не тянуть aws-sdk в монорепо. Virtual-hosted style: {bucket}.s3.{region}.amazonaws.com.
 */

import crypto from "node:crypto";
import type { ITransport, TransportContext, TransportFile, UploadResult } from "./types";
import { buildBatchComplete } from "./types";

const SERVICE = "s3";
const MAX_ATTEMPTS = 3;

type S3Config = {
  bucket: string;
  region: string;
  prefix: string;          // без ведущего/замыкающего слэша; может быть ""
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;   // для временных (STS) ключей; обычно отсутствует
};

export const s3Transport: ITransport = {
  name: "s3",

  async test(ctx) {
    const cfg = parseS3Config(ctx);
    if ("error" in cfg) return { ok: false, message: cfg.error };
    try {
      // list-objects-v2 с max-keys=1 — самый дешёвый способ проверить и доступ к
      // бакету, и валидность ключей (без записи чего-либо в чужой бакет).
      const { status, body } = await s3Send({
        ...cfg, method: "GET", key: "",
        query: { "list-type": "2", "max-keys": "1", ...(cfg.prefix ? { prefix: `${cfg.prefix}/` } : {}) },
      });
      if (status === 200) {
        return { ok: true, message: `S3: бакет «${cfg.bucket}» (${cfg.region}) доступен, ключи валидны.` };
      }
      if (status === 404) return { ok: false, message: `S3 вернул 404 — бакет «${cfg.bucket}» не существует.` };
      if (status === 301) return { ok: false, message: `S3 вернул 301 — бакет «${cfg.bucket}» находится в другом регионе (указан ${cfg.region}).` };
      // 403 на листинг — частый случай для партнёрских политик (например ACRCloud),
      // где выдан только s3:PutObject на префикс. Это НЕ значит, что ключи неверны,
      // поэтому пробуем записать и удалить крошечный пробный объект под префиксом.
      if (status === 403) return await probeWrite(cfg);
      return { ok: false, message: `S3 вернул HTTP ${status}: ${body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, message: `Ошибка подключения к S3: ${(e as Error).message}` };
    }
  },

  async upload(ctx, batchRef, files): Promise<UploadResult> {
    const cfg = parseS3Config(ctx);
    if ("error" in cfg) throw new Error(cfg.error);
    const partyIdSender = ctx.config.partyIdSender || "PADPIDA-UNKNOWN";
    const partyIdRecipient = ctx.config.partyIdRecipient || "PADPIDA-UNKNOWN";

    const keyPrefix = [cfg.prefix, batchRef].filter(Boolean).join("/");
    const manifestName = `BatchComplete_${batchRef}.xml`;
    let totalBytes = 0;
    const written: string[] = [];

    for (const f of files) {
      const data = await toBuffer(f);
      await putWithRetry(cfg, `${keyPrefix}/${f.filename}`, data, contentTypeFor(f.filename));
      totalBytes += data.length;
      written.push(f.filename);
    }

    // BatchComplete последним — сигнал партнёру, что пакет полностью загружен.
    const manifestXml = buildBatchComplete(batchRef, written, partyIdSender, partyIdRecipient);
    const manifestBuf = Buffer.from(manifestXml, "utf8");
    await putWithRetry(cfg, `${keyPrefix}/${manifestName}`, manifestBuf, "application/xml");
    totalBytes += manifestBuf.length;

    return {
      ok: true,
      remotePath: `s3://${cfg.bucket}/${keyPrefix}`,
      totalBytes,
      fileCount: written.length + 1,
      manifestFilename: manifestName,
      uploadedFiles: [...written, manifestName],
    };
  },
};

// ── helpers ──────────────────────────────────────────────────────────────

function parseS3Config(ctx: TransportContext): S3Config | { error: string } {
  const bucket = (ctx.config.bucket || "").trim();
  const region = (ctx.config.region || "").trim();
  const prefix = (ctx.config.prefix || "").trim().replace(/^\/+|\/+$/g, "");
  const accessKeyId = (ctx.credentials.access_key_id || ctx.config.access_key_id || "").trim();
  const secretAccessKey = (ctx.credentials.secret_access_key || "").trim();
  const sessionToken = (ctx.credentials.session_token || "").trim();
  if (!bucket) return { error: "В config отсутствует bucket" };
  if (!region) return { error: "В config отсутствует region" };
  if (!/^[a-z0-9.-]{3,63}$/.test(bucket)) return { error: `Недопустимое имя бакета: «${bucket}»` };
  if (!accessKeyId) return { error: "В credentials отсутствует access_key_id" };
  if (!secretAccessKey) return { error: "В credentials отсутствует secret_access_key" };
  return { bucket, region, prefix, accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) };
}

/**
 * Проверка прав на запись через пробный объект (когда листинг бакета запрещён).
 * Кладём крошечный файл под префикс и сразу пытаемся удалить (best-effort).
 */
async function probeWrite(cfg: S3Config): Promise<{ ok: boolean; message: string }> {
  const probeKey = [cfg.prefix, `.replit-connection-test-${Date.now()}.txt`].filter(Boolean).join("/");
  const putRes = await s3Send({
    ...cfg, method: "PUT", key: probeKey,
    body: Buffer.from("connection-test", "utf8"), contentType: "text/plain", timeoutMs: 15_000,
  });
  if (putRes.status < 200 || putRes.status >= 300) {
    if (putRes.status === 403) {
      return { ok: false, message: `S3 вернул 403 — Access Key ID/Secret Key неверны или нет прав на запись в бакет «${cfg.bucket}» под префиксом «${cfg.prefix || "/"}».` };
    }
    return { ok: false, message: `S3 пробная запись вернула HTTP ${putRes.status}: ${putRes.body.slice(0, 200)}` };
  }
  // запись прошла — пробуем убрать за собой (если нет прав на DELETE, это не ошибка).
  const delRes = await s3Send({ ...cfg, method: "DELETE", key: probeKey, timeoutMs: 15_000 }).catch(() => null);
  const cleaned = delRes && delRes.status >= 200 && delRes.status < 300;
  return {
    ok: true,
    message: `S3: ключи валидны, есть права на запись в «${cfg.bucket}» (${cfg.region}). Листинг бакета недоступен — это нормально для ограниченной партнёрской политики.${cleaned ? "" : " Пробный файл удалить не удалось (нет прав на удаление) — партнёр очистит его сам."}`,
  };
}

async function toBuffer(f: TransportFile): Promise<Buffer> {
  if (f.content.type === "buffer") return f.content.data;
  const fs = await import("node:fs/promises");
  return fs.readFile(f.content.localPath);
}

function contentTypeFor(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

async function putWithRetry(cfg: S3Config, key: string, body: Buffer, contentType: string): Promise<void> {
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { status, body: respBody } = await s3Send({
        ...cfg, method: "PUT", key, body, contentType, timeoutMs: 120_000,
      });
      if (status >= 200 && status < 300) return;
      lastErr = `HTTP ${status}: ${respBody.slice(0, 300)}`;
      // 4xx (кроме 429) — ошибка прав/запроса, ретрай не поможет.
      if (status >= 400 && status < 500 && status !== 429) {
        throw new Error(`S3 PUT ${key} → ${lastErr}`);
      }
    } catch (e) {
      lastErr = (e as Error).message;
      if (lastErr.startsWith("S3 PUT ")) throw e; // явный фейл прав — не ретраим
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`S3 PUT ${key} не удался после ${MAX_ATTEMPTS} попыток: ${lastErr}`);
}

/** RFC3986 URI-encode для путей/query S3 SigV4. */
function uriEncode(input: string, encodeSlash: boolean): string {
  const bytes = Buffer.from(input, "utf8");
  let out = "";
  for (const b of bytes) {
    const c = String.fromCharCode(b);
    if ((b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || (b >= 0x30 && b <= 0x39) ||
        c === "-" || c === "_" || c === "." || c === "~") {
      out += c;
    } else if (c === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

async function s3Send(opts: {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  method: "GET" | "PUT" | "DELETE";
  key: string;            // объектный ключ без ведущего слэша; "" для bucket-level
  query?: Record<string, string>;
  body?: Buffer;
  contentType?: string;
  timeoutMs?: number;
}): Promise<{ status: number; body: string }> {
  const host = `${opts.bucket}.s3.${opts.region}.amazonaws.com`;
  const canonicalUri = "/" + (opts.key ? uriEncode(opts.key, false) : "");
  const queryEntries = Object.entries(opts.query ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalQuery = queryEntries.map(([k, v]) => `${uriEncode(k, true)}=${uriEncode(v, true)}`).join("&");

  const payload = opts.body ?? Buffer.alloc(0);
  const payloadHash = crypto.createHash("sha256").update(payload).digest("hex");
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  // Заголовки должны идти в алфавитном порядке; x-amz-security-token (если есть)
  // включается и в canonical, и в подписываемые, и в реальные заголовки.
  const headerPairs: Array<[string, string]> = [
    ["host", host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
    ...(opts.sessionToken ? [["x-amz-security-token", opts.sessionToken] as [string, string]] : []),
  ];
  const canonicalHeaders = headerPairs.map(([k, v]) => `${k}:${v}\n`).join("");
  const signedHeaders = headerPairs.map(([k]) => k).join(";");
  const canonicalRequest = [opts.method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/${opts.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const kDate = crypto.createHmac("sha256", `AWS4${opts.secretAccessKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(opts.region).digest();
  const kService = crypto.createHmac("sha256", kRegion).update(SERVICE).digest();
  const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  const res = await fetch(url, {
    method: opts.method,
    headers: {
      Authorization: authHeader,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      ...(opts.sessionToken ? { "x-amz-security-token": opts.sessionToken } : {}),
      ...(opts.contentType ? { "Content-Type": opts.contentType } : {}),
    },
    ...(opts.method === "PUT" ? { body: payload } : {}),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  const respBody = await res.text();
  return { status: res.status, body: respBody };
}
