import type { Request, Response, NextFunction, RequestHandler } from "express";
import { createHash } from "crypto";
import { db, apiKeysTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  canApiKeyAccess,
  sanitizeApiKeyPermissions,
  type ApiKeyPermission,
} from "./api-key-permissions";
import { logger } from "./logger";

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

export interface ApiKeyAuthContext {
  id: number;
  name: string;
  permissions: ApiKeyPermission[];
  createdBy: number | null;
}

declare global {
  namespace Express {
    interface Request {
      apiKeyAuth?: ApiKeyAuthContext;
    }
  }
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    impersonator?: ImpersonatorRef;
  }
}

/**
 * Expose an API-key principal through the legacy req.session.user reads without
 * serializing it into the PostgreSQL session store. The non-enumerable property
 * is request-scoped: express-session's JSON-based change detection and save do
 * not turn an API-key request into a reusable cookie session.
 */
function attachRequestScopedApiKeyUser(req: Request, context: ApiKeyAuthContext): boolean {
  if (!req.session) return false;
  const user: SessionUser = {
    // Use the creator for legacy created_by fields when it still exists. Audit
    // records identify the API key separately and never claim this is a login.
    id: context.createdBy ?? 0,
    name: `[api-key] ${context.name}`,
    email: `apikey-${context.id}@system.local`,
    role: "admin",
    artistId: null,
    labelId: null,
  };
  Object.defineProperty(req.session, "user", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: user,
  });
  return true;
}

/** Authenticate X-API-Key and attach its request-scoped principal. */
async function tryApiKeyAuth(req: Request): Promise<ApiKeyAuthContext | null> {
  const raw = req.header("x-api-key");
  if (!raw || !raw.startsWith("tjm_")) return null;
  const hash = createHash("sha256").update(raw).digest("hex");
  const [row] = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      permissions: apiKeysTable.permissions,
      createdBy: apiKeysTable.createdBy,
      expiresAt: apiKeysTable.expiresAt,
    })
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.keyHash, hash), eq(apiKeysTable.enabled, true)));
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  const context: ApiKeyAuthContext = {
    id: row.id,
    name: row.name,
    permissions: sanitizeApiKeyPermissions(row.permissions),
    createdBy: row.createdBy,
  };
  if (!attachRequestScopedApiKeyUser(req, context)) return null;
  req.apiKeyAuth = context;

  // A denied request still counts as key usage, which makes attempted access
  // visible to administrators without logging the raw key.
  void db.update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, row.id))
    .catch((err: unknown) => {
      logger.warn({ err, apiKeyId: row.id }, "failed to update API key lastUsedAt");
    });
  return context;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // A route can invoke requireAuth more than once. Never let the temporary
  // admin-shaped compatibility principal bypass the API-key permission check.
  if (req.apiKeyAuth) {
    const access = canApiKeyAccess(req.apiKeyAuth.permissions, req.method, req.originalUrl);
    if (!access.allowed) {
      res.status(403).json({
        error: "Forbidden: API key lacks permission for this endpoint",
        requiredPermission: access.requiredPermission,
      });
      return;
    }
    next();
    return;
  }

  if (req.session?.user) { next(); return; }
  try {
    const apiKey = await tryApiKeyAuth(req);
    if (apiKey) {
      const access = canApiKeyAccess(apiKey.permissions, req.method, req.originalUrl);
      if (!access.allowed) {
        res.status(403).json({
          error: "Forbidden: API key lacks permission for this endpoint",
          requiredPermission: access.requiredPermission,
        });
        return;
      }
      next();
      return;
    }
  } catch (err) {
    logger.warn({ err }, "API key authentication failed");
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
