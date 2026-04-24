import type { Request } from "express";
import { db, auditLogTable } from "@workspace/db";
import { logger } from "./logger";

// ─── Sanitization ───────────────────────────────────────────────────────────
//
// СТРОГИЙ allowlist по сущностям. Default-deny: если поле не в allowlist своей
// сущности — оно НЕ попадает в audit. Это compliance-требование (§4.12 ТЗ):
// «лучше не сохранить лишнее, чем случайно записать пароль/секрет/PII».
//
// Дополнительный nested-blocklist режет известно-секретные ключи на любой
// глубине внутри jsonb-полей (defence-in-depth).
const ENTITY_ALLOWLIST: Record<string, Set<string>> = {
  release: new Set([
    "id", "title", "releaseType", "status", "upc", "artistId", "labelId",
    "coverUrl", "genre", "releaseDate", "language", "isExplicit", "territories",
    "pLine", "cLine", "statusNote", "createdAt", "updatedAt",
  ]),
  track: new Set([
    "id", "title", "isrc", "releaseId", "artistId", "trackNumber",
    "durationSeconds", "genre", "language", "isExplicit", "composerName",
    "lyricistName", "iswc", "audioUrl", "createdAt", "updatedAt",
  ]),
  artist: new Set([
    "id", "name", "slug", "imageUrl", "genre", "bio", "country", "labelId",
    "spotifyId", "appleId", "status", "createdAt", "updatedAt",
    // socialLinks НЕ включаем: это PII / контакты, не нужно для аудита изменений.
  ]),
  label: new Set([
    "id", "name", "logoUrl", "country", "website", "parentLabelId", "status",
    "createdAt", "updatedAt",
  ]),
  transaction: new Set([
    "id", "type", "amount", "currency", "artistId", "labelId", "releaseId",
    "platform", "description", "period", "createdAt",
  ]),
  payout: new Set([
    "id", "artistId", "labelId", "amount", "currency", "method", "status",
    "rejectionReason", "processedAt", "createdAt", "updatedAt",
    // paymentDetails (банковские реквизиты) — категорически НЕ логируем.
  ]),
  split: new Set([
    "id", "releaseId", "trackId", "participants", "createdAt", "updatedAt",
    // participants содержит email + % share — это и есть смысл аудита splits.
  ]),
  user: new Set([
    "id", "name", "email", "role", "status", "avatarUrl", "artistId", "labelId",
    "lastLoginAt", "createdAt", "updatedAt",
    // passwordHash, phone/address/zipCode (PII), failedLoginAttempts/lockedUntil
    // (lockout механика — внутренняя), dspProfiles/socialLinks (могут содержать
    // токены/ссылки) — НЕ логируем.
  ]),
};

// Nested-blocklist: применяется на ЛЮБОЙ глубине внутри jsonb-полей. Даже если
// разрешённое поле верхнего уровня (`participants`, `paymentDetails` etc) когда-то
// случайно получит подобный nested-ключ — он не утечёт в audit.
const NEVER_LOG_NESTED = new Set([
  "passwordHash", "password", "cipherText", "secret", "token",
  "accessToken", "refreshToken", "apiKey", "privateKey", "bearerToken",
  "clientSecret", "webhookSecret",
]);

function sanitizeNested(v: unknown, depth: number): unknown {
  if (depth > 10) return v;
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map((item) => sanitizeNested(item, depth + 1));
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (NEVER_LOG_NESTED.has(k)) continue;
      out[k] = sanitizeNested(val, depth + 1);
    }
    return out;
  }
  return v;
}

export function sanitizeFields<T extends Record<string, unknown> | null | undefined>(
  row: T,
  entityType?: string,
): T {
  if (row === null || row === undefined) return row;
  const allow = entityType ? ENTITY_ALLOWLIST[entityType] : undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    // Default-deny: если есть allowlist для этой сущности и поля в нём нет — пропускаем.
    if (allow && !allow.has(k)) continue;
    // Если allowlist неизвестен (новый entity_type без записи) — также default-deny:
    // пишем только id и временные метки, остальное игнорируем. Это защита от
    // случайной утечки при добавлении новых роут без обновления audit.ts.
    if (!allow && !["id", "createdAt", "updatedAt"].includes(k)) continue;
    out[k] = sanitizeNested(v, 0);
  }
  return out as T;
}

// ─── Diff ───────────────────────────────────────────────────────────────────
//
// Простой shallow-diff: возвращает массив изменённых полей с before/after.
// Для вложенных объектов (jsonb-полей) сравниваем строкой через JSON.stringify
// — этого достаточно для UI «что поменялось».
export interface DiffEntry {
  field: string;
  old: unknown;
  new: unknown;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function computeDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): DiffEntry[] {
  const diff: DiffEntry[] = [];
  if (!before && !after) return diff;
  if (!before && after) {
    for (const [k, v] of Object.entries(after)) {
      if (v === null || v === undefined) continue;
      diff.push({ field: k, old: null, new: v });
    }
    return diff;
  }
  if (before && !after) {
    for (const [k, v] of Object.entries(before)) {
      if (v === null || v === undefined) continue;
      diff.push({ field: k, old: v, new: null });
    }
    return diff;
  }
  const keys = new Set([...Object.keys(before!), ...Object.keys(after!)]);
  for (const k of keys) {
    const oldV = before![k];
    const newV = after![k];
    if (!deepEqual(oldV, newV)) {
      diff.push({ field: k, old: oldV ?? null, new: newV ?? null });
    }
  }
  return diff;
}

// ─── Mutation logger ────────────────────────────────────────────────────────
//
// Fire-and-forget: НИКОГДА не ждём запись audit'а перед res.json(). Если запись
// не удастся — логируем в pino, но запрос пользователя не страдает.
//
// Возвращаем Promise, чтобы тесты могли при желании await'ить и проверить
// факт записи (рутины в проде должны передавать `void auditMutation(...)`).
export type AuditAction = "create" | "update" | "delete" | "login" | "approve" | "reject" | "deliver";

export interface AuditOptions {
  action: AuditAction;
  entityType: string;
  entityId: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export async function auditMutation(req: Request, opts: AuditOptions): Promise<void> {
  try {
    const sessionUser = req.session?.user;
    const sanitizedBefore = opts.before ? sanitizeFields(opts.before, opts.entityType) : null;
    const sanitizedAfter = opts.after ? sanitizeFields(opts.after, opts.entityType) : null;
    const diff = computeDiff(sanitizedBefore, sanitizedAfter);

    await db.insert(auditLogTable).values({
      userId: sessionUser?.id ?? null,
      userEmail: sessionUser?.email ?? null,
      userRole: sessionUser?.role ?? null,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      before: sanitizedBefore,
      after: sanitizedAfter,
      diff,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
      requestId: (req.get("x-request-id") ?? null),
    });
  } catch (err) {
    // Never let audit failure break the user-facing response.
    logger.error({ err, opts: { action: opts.action, entityType: opts.entityType, entityId: opts.entityId } }, "auditMutation failed");
  }
}
