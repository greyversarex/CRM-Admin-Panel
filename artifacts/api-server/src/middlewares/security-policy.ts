import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface SecuritySettings {
  ipWhitelist?: string[];
  sessionTimeoutMinutes?: number;
}

let cached: { v: SecuritySettings; at: number } | null = null;
const TTL_MS = 60_000;

async function loadSecurity(): Promise<SecuritySettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.v;
  try {
    const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "security"));
    const v = (row?.value ?? {}) as SecuritySettings;
    cached = { v, at: Date.now() };
    return v;
  } catch {
    return {};
  }
}

export function invalidateSecurityPolicyCache(): void {
  cached = null;
}

function clientIp(req: Request): string {
  return String(req.ip ?? req.socket.remoteAddress ?? "");
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const x = Number(p);
    if (!Number.isInteger(x) || x < 0 || x > 255) return null;
    n = (n * 256) + x;
  }
  return n >>> 0;
}

function cidrMatchV4(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(base);
  if (a === null || b === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (a & mask) === (b & mask);
}

function ipMatches(rawIp: string, list: string[]): boolean {
  if (!rawIp) return false;
  // Normalize IPv4-mapped IPv6 (::ffff:1.2.3.4) → 1.2.3.4
  const ip = rawIp.startsWith("::ffff:") ? rawIp.slice(7) : rawIp;
  for (const entry of list) {
    const e = entry.trim();
    if (!e) continue;
    if (e === ip || e === rawIp) return true;
    if (e.includes("/")) {
      if (cidrMatchV4(ip, e)) return true;
      continue;
    }
    if (e.endsWith("*")) {
      const prefix = e.slice(0, -1);
      if (ip.startsWith(prefix) || rawIp.startsWith(prefix)) return true;
    }
  }
  return false;
}

export const securityPolicy: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sec = await loadSecurity();
    const list = Array.isArray(sec.ipWhitelist) ? sec.ipWhitelist.filter((x) => typeof x === "string" && x.trim()) : [];
    if (list.length > 0) {
      const ip = clientIp(req);
      if (!ipMatches(ip, list)) {
        res.status(403).json({ error: "IP не в белом списке" });
        return;
      }
    }
    if (req.session && sec.sessionTimeoutMinutes && sec.sessionTimeoutMinutes > 0) {
      req.session.cookie.maxAge = sec.sessionTimeoutMinutes * 60 * 1000;
    }
    next();
  } catch {
    next();
  }
};
