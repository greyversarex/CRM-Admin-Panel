/**
 * Получение байтов ассета (аудио/обложка) для multipart-загрузки в Broma16.
 *
 * Наши URL бывают двух видов:
 *   - локальные `/objects/uploads/<uuid>` → читаем с диска через ObjectStorage
 *   - внешние `https://…` (например, обложка из Spotify-трансфера) → скачиваем
 */

import { promises as fs } from "fs";
import path from "path";
import { lookup } from "dns/promises";
import { ObjectStorageService } from "../../lib/objectStorage";

export type AssetBytes = { buffer: Buffer; contentType: string; filename: string };

const storage = new ObjectStorageService();

// ── Защита от SSRF при скачивании внешних ассетов ──────────────────────
// Внешние URL обложек/аудио (например, из Spotify-трансфера) могут указывать на
// произвольный хост. Перед запросом резолвим DNS и запрещаем приватные/локальные
// адреса (loopback, RFC1918, link-local + метаданные облака, CGNAT, IPv6 ULA).
function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + 169.254.169.254 (metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}
function isPrivateIPv6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === "::1" || x === "::") return true;
  if (x.startsWith("fc") || x.startsWith("fd")) return true; // fc00::/7 (ULA)
  if (x.startsWith("fe80")) return true; // link-local
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}
async function assertSafeExternalUrl(u: URL): Promise<void> {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`Не удалось разрешить адрес ассета: ${host}`);
  }
  const candidates = addrs.length > 0 ? addrs.map((a) => a.address) : [host];
  for (const ip of candidates) {
    if (isPrivateIPv4(ip) || isPrivateIPv6(ip)) {
      throw new Error(`Доступ к внутренним адресам запрещён: ${host}`);
    }
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_REDIRECTS = 5;

// Базовая проверка формы URL: только http(s), без учётных данных в URL и без
// нестандартных портов (публичные CDN отдают обложки по 80/443).
function assertUrlShape(u: URL): void {
  if (!ALLOWED_PROTOCOLS.has(u.protocol)) {
    throw new Error(`Недопустимый протокол ассета: ${u.protocol}`);
  }
  if (u.username || u.password) {
    throw new Error("URL ассета не должен содержать учётные данные");
  }
  if (u.port && u.port !== "80" && u.port !== "443") {
    throw new Error(`Недопустимый порт ассета: ${u.port}`);
  }
}

// Скачивание внешнего ассета с ручной обработкой редиректов: каждый хоп
// (в т.ч. Location-редиректы) проверяется по форме URL и на приватные/локальные
// адреса. Без этого публичный URL мог бы редиректом увести на внутренний
// ресурс (SSRF через редирект).
async function safeExternalFetch(initial: string): Promise<{ res: Response; finalUrl: URL }> {
  let current = new URL(initial);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertUrlShape(current);
    await assertSafeExternalUrl(current);
    const res = await fetch(current.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { res, finalUrl: current };
      current = new URL(location, current); // резолвим относительный Location
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error("Слишком много перенаправлений при загрузке ассета");
}

export async function fetchAssetBytes(url: string): Promise<AssetBytes> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Пустой URL ассета");

  if (/^https?:\/\//i.test(trimmed)) {
    const { res, finalUrl } = await safeExternalFetch(trimmed);
    if (!res.ok) throw new Error(`Не удалось скачать ассет (HTTP ${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const filename = path.basename(finalUrl.pathname) || "asset";
    return { buffer, contentType, filename };
  }

  // Локальный objectPath. Приводим `/api/storage/objects/...` → `/objects/...`.
  let objectPath = trimmed.replace(/^https?:\/\/[^/]+/i, "");
  const idx = objectPath.indexOf("/objects/");
  if (idx >= 0) objectPath = objectPath.slice(idx);
  if (!objectPath.startsWith("/objects/")) {
    throw new Error(`Неподдерживаемый путь ассета: ${trimmed}`);
  }

  const file = await storage.getObjectEntityFile(objectPath);
  const fp = file.fullPath();
  const buffer = await fs.readFile(fp);
  const [meta] = await file.getMetadata();
  const contentType = meta.contentType ?? "application/octet-stream";
  const filename = path.basename(objectPath) || "asset";
  return { buffer, contentType, filename };
}

// MIME → расширение. Наши ассеты хранятся под UUID без расширения, а Broma16
// определяет тип файла именно по расширению имени в multipart (иначе отдаёт
// `file: rule: file_type`). Поэтому перед загрузкой дополняем имя расширением.
const MIME_EXTENSION: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/tiff": "tiff",
};

/** Дополняет имя файла расширением по contentType, если его нет. */
export function ensureFilenameExtension(filename: string, contentType: string): string {
  const ext = MIME_EXTENSION[contentType.split(";")[0].trim().toLowerCase()];
  if (!ext) return filename;
  const base = filename.trim() || "file";
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}

/** Готовит FormData с одним файлом (+ доп. поля) для запросов Broma16. */
export function buildFileForm(
  asset: AssetBytes,
  fields: Record<string, string | number> = {},
  fileField = "file",
): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  const bytes = Uint8Array.from(asset.buffer);
  const filename = ensureFilenameExtension(asset.filename, asset.contentType);
  form.append(fileField, new Blob([bytes], { type: asset.contentType }), filename);
  return form;
}
