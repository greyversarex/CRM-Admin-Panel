/**
 * Manager permissions cache + middleware.
 *
 * Хранит in-memory мапу `key → enabled` с TTL 60 секунд (а также форс-инвалидацией
 * при PATCH через invalidateManagerPermissions()). Это делает требование «менеджер
 * должен пройти permission-check» дешёвым (~1 hashmap lookup на запрос).
 *
 * Bootstrap: при старте сервера убеждаемся, что в DB есть строка для каждого ключа
 * из MANAGER_PERMISSION_KEYS (default enabled=true) — иначе админ не сможет ничего
 * выключить пока кто-то не «потрогает» ключ.
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db, managerPermissionsTable, MANAGER_PERMISSION_KEYS, type ManagerPermissionKey } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

interface CacheEntry {
  enabled: boolean;
  fetchedAt: number;
}

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export async function bootstrapManagerPermissions(): Promise<void> {
  try {
    // Один INSERT с ON CONFLICT DO NOTHING для всех ключей сразу.
    const values = MANAGER_PERMISSION_KEYS.map((k) => sql`(${k}, true)`);
    if (values.length === 0) return;
    await db.execute(sql`
      INSERT INTO manager_permissions (key, enabled)
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT (key) DO NOTHING
    `);
    logger.info({ keys: MANAGER_PERMISSION_KEYS.length }, "[manager-permissions] bootstrapped");
  } catch (e) {
    logger.error({ err: e }, "[manager-permissions] bootstrap failed");
  }
}

export function invalidateManagerPermissions(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

async function fetchEnabled(key: string): Promise<boolean> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.enabled;
  const r = await db.execute<{ enabled: boolean }>(sql`
    SELECT enabled FROM manager_permissions WHERE key = ${key} LIMIT 1
  `);
  // Если ключа нет в DB — считаем что разрешено (fail-open для отсутствующих ключей,
  // bootstrap должен был его создать; альтернатива — закрыть менеджеру всё, что не сидится).
  const enabled = r.rows?.[0]?.enabled ?? true;
  cache.set(key, { enabled, fetchedAt: Date.now() });
  return enabled;
}

/**
 * Express-middleware: пропускает admin'а всегда; для manager'а проверяет флаг.
 * Для всех остальных ролей (label/artist) возвращает 403 — этот middleware ставится
 * только на admin/manager-разделы.
 */
export function requireManagerPermission(key: ManagerPermissionKey): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const u = req.session?.user;
    if (!u) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (u.role === "admin") { next(); return; }
    if (u.role !== "manager") { res.status(403).json({ error: "Forbidden" }); return; }
    try {
      const enabled = await fetchEnabled(key);
      if (!enabled) {
        res.status(403).json({
          error: "manager_permission_disabled",
          message: `Доступ к разделу "${key}" отключён администратором`,
        });
        return;
      }
      next();
    } catch (e) {
      logger.error({ err: e, key }, "[manager-permissions] check failed");
      res.status(500).json({ error: "permission_check_failed" });
    }
  };
}
