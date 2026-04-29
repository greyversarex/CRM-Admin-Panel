import type { Request, Response, NextFunction, RequestHandler } from "express";
import { createHash } from "crypto";
import { db, apiKeysTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export type AuthRole = "admin" | "manager" | "label" | "artist";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: AuthRole;
  artistId: number | null;
  labelId: number | null;
}

/**
 * При impersonation (admin → войти как пользователь) `user` подменяется на target,
 * а `impersonator` хранит исходного admin'а. Все запросы выполняются от имени
 * target (scope, RBAC, audit). На /auth/stop-impersonate возвращаем session.user
 * из impersonator.
 */
export interface ImpersonatorRef {
  id: number;
  name: string;
  email: string;
  role: AuthRole;
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    impersonator?: ImpersonatorRef;
  }
}

/**
 * Try to authenticate by X-API-Key header. If valid, sets req.session.user
 * with role="admin" (api keys grant full back-office access; permission scoping
 * via api_keys.permissions is enforced by individual routes when relevant).
 */
async function tryApiKeyAuth(req: Request): Promise<boolean> {
  const raw = req.header("x-api-key");
  if (!raw || !raw.startsWith("tjm_")) return false;
  const hash = createHash("sha256").update(raw).digest("hex");
  const [row] = await db
    .select()
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.keyHash, hash), eq(apiKeysTable.enabled, true)));
  if (!row) return false;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return false;
  // Update last_used_at (fire-and-forget)
  void db.update(apiKeysTable).set({ lastUsedAt: new Date() }).where(eq(apiKeysTable.id, row.id));
  if (req.session) {
    req.session.user = {
      id: 0,
      name: `[api-key] ${row.name}`,
      email: `apikey-${row.id}@system.local`,
      role: "admin" as AuthRole,
      artistId: null,
      labelId: null,
    };
  }
  return true;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.session?.user) { next(); return; }
  try {
    if (await tryApiKeyAuth(req)) { next(); return; }
  } catch {
    // fall through to 401
  }
  res.status(401).json({ error: "Unauthorized" });
}

export function requireRole(...roles: AuthRole[]): RequestHandler {
  return (req, res, next) => {
    const u = req.session?.user;
    if (!u) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(u.role)) {
      res.status(403).json({ error: "Forbidden: insufficient role" });
      return;
    }
    next();
  };
}

export function getSessionUser(req: Request): SessionUser | undefined {
  return req.session?.user;
}

/**
 * Data-access scope derived from the session user.
 *
 * - `fullAccess: true`  → admin / manager: can read all org data and use query filters as-is.
 * - `fullAccess: false` → label / artist: can only see their own data; query filters are
 *   ignored or overridden with the session-derived id.
 */
export interface DataScope {
  fullAccess: boolean;
  role: AuthRole;
  artistId: number | null;   // forced artistId filter (artist role)
  labelId: number | null;    // forced labelId filter (label role)
}

export function getDataScope(req: Request): DataScope {
  const u = req.session?.user;
  if (!u) {
    // requireAuth should always run first; this is a safety net.
    return { fullAccess: false, role: "artist", artistId: null, labelId: null };
  }
  if (u.role === "admin" || u.role === "manager") {
    return { fullAccess: true, role: u.role, artistId: null, labelId: null };
  }
  return {
    fullAccess: false,
    role: u.role,
    artistId: u.role === "artist" ? u.artistId : null,
    labelId:  u.role === "label"  ? u.labelId  : null,
  };
}

/**
 * Resolve the effective {artistId, labelId} filter to apply on a list endpoint,
 * combining (a) what the caller asked for via query params and (b) what the session
 * scope actually permits. For non-privileged roles, query params are IGNORED.
 *
 * Returns `null` when the caller asked for something outside their scope (caller
 * should respond 403). Otherwise returns the filter to apply (may be all-undefined
 * for admin/manager who didn't supply any filter).
 */
export function resolveScopeFilter(
  req: Request,
  rawQueryArtistId?: number,
  rawQueryLabelId?: number,
): { artistId?: number; labelId?: number } | null {
  const s = getDataScope(req);
  if (s.fullAccess) {
    return { artistId: rawQueryArtistId, labelId: rawQueryLabelId };
  }
  if (s.role === "artist") {
    if (s.artistId == null) return null;
    if (rawQueryArtistId !== undefined && rawQueryArtistId !== s.artistId) return null;
    return { artistId: s.artistId };
  }
  if (s.role === "label") {
    if (s.labelId == null) return null;
    if (rawQueryLabelId !== undefined && rawQueryLabelId !== s.labelId) return null;
    return { labelId: s.labelId };
  }
  return null;
}
