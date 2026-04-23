import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { SessionUser, AuthRole } from "../lib/auth";
import { requireAuth } from "../lib/auth";

const router = Router();

// Brute-force guard: 10 login attempts per 5 min per IP. In dev (Replit
// preview iframe) the limit is relaxed so the demo buttons remain usable.
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Слишком много попыток входа. Попробуй через несколько минут." },
});

// Looser limiter for password change (5/15 min — still per IP, not per-account)
const changePwdLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Слишком много попыток смены пароля. Подожди немного." },
});

function buildProfilePayload(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as AuthRole,
    artistId: u.artistId,
    labelId: u.labelId,
    avatarUrl: u.avatarUrl,
    phone: u.phone,
    address: u.address,
    country: u.country,
    region: u.region,
    city: u.city,
    zipCode: u.zipCode,
    about: u.about,
    dspProfiles: u.dspProfiles ?? {},
    socialLinks: u.socialLinks ?? {},
  };
}

router.post("/auth/login", loginLimiter, async (req, res): Promise<void> => {
  const email = String(req.body?.email ?? "").toLowerCase().trim();
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    res.status(400).json({ error: "Email и пароль обязательны" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }

  if (user.status !== "active") {
    res.status(403).json({ error: "Аккаунт заблокирован или неактивен" });
    return;
  }

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  const sessionUser: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as AuthRole,
    artistId: user.artistId,
    labelId: user.labelId,
  };

  // Regenerate session ID to prevent session fixation
  req.session.regenerate((regenErr) => {
    if (regenErr) {
      req.log?.error({ err: regenErr }, "session.regenerate failed");
      res.status(500).json({ error: "Не удалось создать сессию" });
      return;
    }
    req.session.user = sessionUser;
    req.session.save((err) => {
      if (err) {
        req.log?.error({ err }, "session.save failed");
        res.status(500).json({ error: "Не удалось создать сессию" });
        return;
      }
      res.json({ user: buildProfilePayload(user) });
    });
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Не удалось завершить сессию" });
      return;
    }
    res.clearCookie("tm.sid");
    res.json({ ok: true });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session?.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // Re-read from DB so client always gets the latest profile fields.
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.user.id));
  if (!u) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // If the account was disabled in DB, terminate the session immediately.
  if (u.status !== "active") {
    req.session.destroy(() => {
      res.status(401).json({ error: "Аккаунт заблокирован" });
    });
    return;
  }
  // Re-sync session with DB (role/status/scope can be changed by an admin
  // mid-session; without this the user keeps the privileges they had at
  // login until they sign out).
  req.session.user = {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as AuthRole,
    artistId: u.artistId,
    labelId: u.labelId,
  };
  res.json({ user: buildProfilePayload(u) });
});

router.post("/auth/change-password", requireAuth, changePwdLimiter, async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const currentPassword = String(req.body?.currentPassword ?? "");
  const newPassword = String(req.body?.newPassword ?? "");

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Текущий и новый пароль обязательны" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "Минимум 8 символов в новом пароле" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUser.id));
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Текущий пароль неверный" });
    return;
  }
  const newHash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

export default router;
