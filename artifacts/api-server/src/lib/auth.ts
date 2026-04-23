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
