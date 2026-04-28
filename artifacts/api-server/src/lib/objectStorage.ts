// ─── Local-filesystem object storage ──────────────────────────────────────
//
// Хранилище медиа-файлов (обложки релизов, аудио, аватары, KYC-документы)
// на локальном диске сервера. Архитектурно сохраняет тот же интерфейс, что
// был у GCS-обёртки: ObjectStorageService + objectStorageClient.bucket().file(),
// поэтому остальной код (routes/assets.ts, routes/users.ts, routes/kyc.ts)
// продолжает работать без изменений.
//
// Файлы лежат под `LOCAL_STORAGE_ROOT` (env, по умолчанию `<cwd>/.local-storage`).
// MIME-тип каждого файла сохраняется в спутник-файле `<name>.meta.json`,
// чтобы потоки отдачи проставляли правильный Content-Type.
//
// Поток загрузки (presign → PUT → confirm) реализован через короткоживущие
// HMAC-токены: `createUpload()` возвращает URL вида
//   /api/storage/upload/<objectId>?exp=<ms>&sig=<hex>
// Соответствующий PUT-роут лежит в routes/storage-upload.ts и пишет тело
// напрямую в файл под PRIVATE_OBJECT_DIR.

import { promises as fs, createReadStream, createWriteStream, type ReadStream } from "fs";
import path from "path";
import { Transform, type Readable } from "stream";
import { pipeline } from "stream/promises";
import { randomUUID, createHmac, timingSafeEqual } from "crypto";

// ─── Roots ────────────────────────────────────────────────────────────────
export const LOCAL_STORAGE_ROOT = path.resolve(
  process.env.LOCAL_STORAGE_ROOT?.trim() ||
    path.join(process.cwd(), ".local-storage"),
);

function getPrivateObjectDirRaw(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR?.trim() || "private";
  // Strip leading slash if present — мы трактуем PRIVATE_OBJECT_DIR как
  // относительный префикс под LOCAL_STORAGE_ROOT.
  return dir.replace(/^\/+/, "");
}

// Resolve a path relative to LOCAL_STORAGE_ROOT, защищая от path traversal.
function resolveSafe(...parts: string[]): string {
  const joined = path.join(LOCAL_STORAGE_ROOT, ...parts);
  const normalized = path.resolve(joined);
  const root = path.resolve(LOCAL_STORAGE_ROOT);
  if (normalized !== root && !normalized.startsWith(root + path.sep)) {
    throw new Error("Path traversal detected");
  }
  return normalized;
}

// ─── Errors ───────────────────────────────────────────────────────────────
export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// ─── HMAC upload tokens ───────────────────────────────────────────────────
function uploadSecret(): string {
  return (
    process.env.UPLOAD_SIGNING_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "dev-only-insecure-upload-fallback"
  );
}

function signUploadToken(objectId: string, expMs: number, maxBytes: number): string {
  return createHmac("sha256", uploadSecret())
    .update(`${objectId}|${expMs}|${maxBytes}`)
    .digest("hex");
}

export function verifyUploadToken(
  objectId: string,
  expMs: number,
  maxBytes: number,
  sig: string,
): boolean {
  if (!Number.isFinite(expMs) || Date.now() > expMs) return false;
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return false;
  const expected = signUploadToken(objectId, expMs, maxBytes);
  if (expected.length !== sig.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}

// ─── File-like shim (mimics @google-cloud/storage File API) ───────────────
type FileMetadata = { size: number; contentType?: string };

function metaPathFor(fp: string): string {
  return `${fp}.meta.json`;
}

async function readSidecarMeta(fp: string): Promise<{ contentType?: string }> {
  try {
    const txt = await fs.readFile(metaPathFor(fp), "utf8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

async function writeSidecarMeta(fp: string, meta: { contentType?: string }): Promise<void> {
  await fs.writeFile(metaPathFor(fp), JSON.stringify(meta));
}

export class LocalFile {
  constructor(public bucket: LocalBucket, public name: string) {}

  /** Полный путь на диске (валидируется через resolveSafe). */
  fullPath(): string {
    return resolveSafe(this.bucket.name, this.name);
  }

  async exists(): Promise<[boolean]> {
    try {
      const st = await fs.stat(this.fullPath());
      return [st.isFile()];
    } catch {
      return [false];
    }
  }

  async getMetadata(): Promise<[FileMetadata]> {
    const fp = this.fullPath();
    const stat = await fs.stat(fp);
    const sidecar = await readSidecarMeta(fp);
    return [{ size: stat.size, contentType: sidecar.contentType }];
  }

  async setMetadata(opts: { metadata?: { contentType?: string } } = {}): Promise<void> {
    const fp = this.fullPath();
    const existing = await readSidecarMeta(fp);
    await writeSidecarMeta(fp, { ...existing, ...(opts.metadata ?? {}) });
  }

  createReadStream(opts?: { start?: number; end?: number }): ReadStream {
    return createReadStream(this.fullPath(), opts);
  }

  async delete(opts?: { ignoreNotFound?: boolean }): Promise<void> {
    const fp = this.fullPath();
    try {
      await fs.unlink(fp);
    } catch (err: any) {
      if (err?.code === "ENOENT" && opts?.ignoreNotFound) {
        // ничего
      } else if (err?.code !== "ENOENT") {
        throw err;
      }
    }
    // sidecar meta — best effort
    try {
      await fs.unlink(metaPathFor(fp));
    } catch {
      /* ignore */
    }
  }

  /**
   * Совместимо с GCS API: записывает буфер целиком. Для больших файлов
   * (covers через presign-flow) используется streaming-PUT через отдельный
   * роут; этот метод используется только аватарами и KYC (≤25 МБ).
   */
  async save(
    data: Buffer,
    opts?: { contentType?: string; resumable?: boolean; metadata?: { contentType?: string } },
  ): Promise<void> {
    const fp = this.fullPath();
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, data);
    const ct = opts?.metadata?.contentType ?? opts?.contentType;
    if (ct) {
      await writeSidecarMeta(fp, { contentType: ct });
    }
  }
}

export class LocalBucket {
  constructor(public name: string) {}
  file(name: string): LocalFile {
    return new LocalFile(this, name);
  }
}

class LocalStorageClient {
  bucket(name: string): LocalBucket {
    return new LocalBucket(name);
  }
}

// Совместимый со старым кодом экспорт.
export const objectStorageClient = new LocalStorageClient();

// ─── Upload streaming (used by routes/storage-upload.ts) ──────────────────
export class PayloadTooLargeError extends Error {
  constructor(public maxBytes: number) {
    super(`Payload exceeds ${maxBytes} bytes`);
    this.name = "PayloadTooLargeError";
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}

class SizeLimiter extends Transform {
  public bytes = 0;
  constructor(private readonly max: number) {
    super();
  }
  _transform(
    chunk: Buffer,
    _enc: BufferEncoding,
    cb: (err?: Error | null, data?: Buffer) => void,
  ): void {
    this.bytes += chunk.length;
    if (this.bytes > this.max) {
      cb(new PayloadTooLargeError(this.max));
      return;
    }
    cb(null, chunk);
  }
}

/**
 * Stream a readable body straight to disk under PRIVATE_OBJECT_DIR/uploads/<id>,
 * enforcing a hard byte-cap with proper backpressure (pipeline()). On any
 * failure (oversize, abort, fs error) the partially-written target file and
 * its sidecar meta are removed so confirm-step never sees orphaned data.
 *
 * Throws PayloadTooLargeError when body exceeds `maxBytes`. Returns the
 * actual size after the write completes.
 */
export async function streamUploadToObject(
  objectId: string,
  body: Readable,
  maxBytes: number,
  contentType: string | null,
): Promise<{ size: number }> {
  const privateDir = getPrivateObjectDirRaw();
  const target = resolveSafe(privateDir, "uploads", objectId);
  await fs.mkdir(path.dirname(target), { recursive: true });

  const limiter = new SizeLimiter(maxBytes);
  const ws = createWriteStream(target);

  try {
    await pipeline(body, limiter, ws);
  } catch (err) {
    // Best-effort cleanup of the partial file + sidecar.
    await fs.unlink(target).catch(() => {});
    await fs.unlink(metaPathFor(target)).catch(() => {});
    throw err;
  }

  if (limiter.bytes === 0) {
    // Empty bodies leave a 0-byte file behind — kill it so confirm fails clean.
    await fs.unlink(target).catch(() => {});
    await fs.unlink(metaPathFor(target)).catch(() => {});
    return { size: 0 };
  }

  if (contentType) {
    await writeSidecarMeta(target, { contentType });
  }
  return { size: limiter.bytes };
}

// ─── Public service ───────────────────────────────────────────────────────
export class ObjectStorageService {
  constructor() {}

  /** Логический префикс под LOCAL_STORAGE_ROOT (например "private"). */
  getPrivateObjectDir(): string {
    return getPrivateObjectDirRaw();
  }

  /**
   * Сгенерировать короткоживущий PUT URL и вернуть пути для последующего
   * сохранения в БД. Контракт идентичен предыдущей GCS-реализации:
   *   • objectId   – UUID файла под uploads/
   *   • storageKey – `<privateDir>/uploads/<uuid>`  (не путь на диске!)
   *   • objectPath – `/objects/uploads/<uuid>`     (то, что ходит между UI и API)
   *   • uploadURL  – относительный URL `/api/storage/upload/<uuid>?exp=…&sig=…`
   */
  async createUpload(opts?: {
    contentType?: string;
    ttlSec?: number;
    /** Hard cap (bytes) bound into the HMAC token. Default 250 МБ. */
    maxBytes?: number;
  }): Promise<{
    objectId: string;
    storageKey: string;
    objectPath: string;
    uploadURL: string;
  }> {
    const privateDir = getPrivateObjectDirRaw();
    const objectId = randomUUID();
    const ttl = opts?.ttlSec ?? 900;
    const expMs = Date.now() + ttl * 1000;
    const maxBytes = opts?.maxBytes ?? 250 * 1024 * 1024;
    const sig = signUploadToken(objectId, expMs, maxBytes);
    return {
      objectId,
      storageKey: `${privateDir}/uploads/${objectId}`,
      objectPath: `/objects/uploads/${objectId}`,
      uploadURL: `/api/storage/upload/${objectId}?exp=${expMs}&max=${maxBytes}&sig=${sig}`,
    };
  }

  /**
   * Для локального хранилища "ссылка на скачивание" — это тот же
   * cookie-аутентифицированный streaming-роут, что используется браузером
   * для отображения обложек/проигрывания аудио. Возвращаем относительный URL.
   */
  async getDownloadURL(objectPath: string, _ttlSec: number = 300): Promise<string> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    return `/api/storage${objectPath}`;
  }

  async deleteByObjectPath(objectPath: string): Promise<void> {
    try {
      const file = await this.getObjectEntityFile(objectPath);
      await file.delete({ ignoreNotFound: true });
    } catch (err) {
      if (err instanceof ObjectNotFoundError) return;
      throw err;
    }
  }

  /** Найти LocalFile по `/objects/<…>` пути. Бросает ObjectNotFoundError если нет на диске. */
  async getObjectEntityFile(objectPath: string): Promise<LocalFile> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const parts = objectPath.slice(1).split("/").filter(Boolean);
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }
    const entityId = parts.slice(1).join("/"); // "uploads/<uuid>"
    const privateDir = getPrivateObjectDirRaw(); // "private"

    const fullRel = `${privateDir}/${entityId}`;
    const [bucketName, ...rest] = fullRel.split("/");
    const objectName = rest.join("/");
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return file;
  }

  /**
   * No-op shim: на GCS это переписывало http-URL вида
   * https://storage.googleapis.com/<bucket>/<obj> в наш `/objects/...`.
   * Для локального хранилища таких внешних URL не бывает, поэтому возвращаем
   * вход как есть.
   */
  normalizeObjectEntityPath(rawPath: string): string {
    return rawPath;
  }

  /**
   * No-op: ACL выполняется на уровне БД (assets/kyc_documents строки + scope).
   * Сохраняем сигнатуру для совместимости.
   */
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    _aclPolicy: unknown,
  ): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }

  async canAccessObjectEntity(_args: {
    userId?: string;
    objectFile: LocalFile;
    requestedPermission?: unknown;
  }): Promise<boolean> {
    // Контроль доступа делается на уровне роута через scope/owner проверки.
    return true;
  }
}
