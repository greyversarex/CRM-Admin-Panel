import type { Request, Response, NextFunction, RequestHandler } from "express";

export type AuthRole = "admin" | "manager" | "label" | "artist";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: AuthRole;
  artistId: number | null;
  labelId: number | null;
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
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
