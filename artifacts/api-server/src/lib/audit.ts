import type { Request } from "express";
import { db, auditLogTable } from "@workspace/db";
import { logger } from "./logger";

// ─── Sanitization ───────────────────────────────────────────────────────────
//
// СТРОГИЙ blocklist + по-таблице whitelist.  Лучше пропустить безобидное поле,
// чем случайно записать пароль или дешифрованный API-ключ. Все имена — camelCase,
// поскольку Drizzle возвращает selected rows в camelCase.
const NEVER_LOG_FIELDS = new Set([
  "passwordHash",     // bcrypt hash (всё равно секрет — никогда не пишем)
  "password",         // на всякий случай — если кто-то засунёт plain в before/after
  "cipherText",       // зашифрованные креды интеграций (lib/db/src/schema/integrations.ts)
  "secret",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "privateKey",
  // Внутренние lockout-поля (Task #2) — не светим во внешних логах
  "failedLoginAttempts",
  "lockedUntil",
]);

// Рекурсивная санитизация: вырезает blocked-ключи на ЛЮБОЙ глубине вложенности.
// Защищает на случай, если в jsonb-поле (вроде integrations.settings) когда-нибудь
// окажется чувствительное поле во вложенном объекте.
function sanitizeValue(v: unknown, depth: number): unknown {
  if (depth > 10) return v;
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map((item) => sanitizeValue(item, depth + 1));
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (NEVER_LOG_FIELDS.has(k)) continue;
      out[k] = sanitizeValue(val, depth + 1);
    }
    return out;
  }
  return v;
}

export function sanitizeFields<T extends Record<string, unknown> | null | undefined>(row: T): T {
  if (row === null || row === undefined) return row;
  return sanitizeValue(row, 0) as T;
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
    const sanitizedBefore = opts.before ? sanitizeFields(opts.before) : null;
    const sanitizedAfter = opts.after ? sanitizeFields(opts.after) : null;
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
