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

export async function fetchAssetBytes(url: string): Promise<AssetBytes> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Пустой URL ассета");

  if (/^https?:\/\//i.test(trimmed)) {
    await assertSafeExternalUrl(new URL(trimmed));
    const res = await fetch(trimmed, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`Не удалось скачать ассет (HTTP ${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const filename = path.basename(new URL(trimmed).pathname) || "asset";
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

/** Готовит FormData с одним файлом (+ доп. поля) для запросов Broma16. */
export function buildFileForm(
  asset: AssetBytes,
  fields: Record<string, string | number> = {},
  fileField = "file",
): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  const bytes = Uint8Array.from(asset.buffer);
  form.append(fileField, new Blob([bytes], { type: asset.contentType }), asset.filename);
  return form;
}
