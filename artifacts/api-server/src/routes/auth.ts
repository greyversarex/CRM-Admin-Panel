import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { SessionUser, AuthRole, ImpersonatorRef } from "../lib/auth";
import { requireAuth } from "../lib/auth";
import { maskBankInfoFor } from "../lib/kycUtils";
import { auditMutation } from "../lib/audit";

const router = Router();

// Brute-force guard: 10 login attempts per 5 min per IP. In dev (Replit
// preview iframe) the limit is relaxed so the demo buttons remain usable.
//
// IP-rate-limit alone is not enough — a botnet can rotate addresses, and we
// also want to defend a single account against a slow distributed brute-force.
// Per-account lockout (failed_login_attempts + locked_until in `users`) handles
// that case; this limiter just throttles obvious noise.
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

// Account-lockout policy.
const LOCKOUT_THRESHOLD = 5;            // bad attempts before lockout
const LOCKOUT_DURATION_MS = 15 * 60_000; // 15 minutes

function buildProfilePayload(u: typeof usersTable.$inferSelect) {
  // Allow-list: failedLoginAttempts/lockedUntil internal-only.
  // Bank: admin/manager raw, artist/label masked (PATCH /users/me/bank-info для edit).
  const role = u.role as AuthRole;
  const masked = maskBankInfoFor({
    bankName: u.bankName,
    bankAccountNumber: u.bankAccountNumber,
    bankSwift: u.bankSwift,
    bankIban: u.bankIban,
    bankHolderName: u.bankHolderName,
    bankCountry: u.bankCountry,
  }, role === "admin" || role === "manager" ? role : (role === "label" ? "label" : "artist"));
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role,
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
    // ─── KYC / Bank / Tax (Task #6) ───────────────────────────────────────
    kycStatus: u.kycStatus,
    kycCompletedAt: u.kycCompletedAt?.toISOString() ?? null,
    ...masked,
    taxId: u.taxId,
    taxCountry: u.taxCountry,
    taxFormType: u.taxFormType,
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
    // Same response as bad password — do not leak whether email exists.
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }

  // Account lockout check: if locked_until is in the future, refuse the login
  // BEFORE bcrypt-comparing, so we don't burn CPU on attackers and we don't
  // accidentally grant a session to someone who learned the password during the lockout window.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    res.status(429).json({
      error: `Аккаунт временно заблокирован после нескольких неверных попыток. Попробуй через ${minutesLeft} мин.`,
    });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    // Bad password: increment counter and, if threshold reached, set lockout window.
    // If a previous lockout window has already expired (lockedUntil is in the past),
    // forget the old fail-count and start a fresh streak — so the user gets a full
    // 5 attempts after each lockout instead of being instantly re-locked on the
    // first miss after the window elapses.
    const lockoutExpired =
      user.lockedUntil !== null && user.lockedUntil.getTime() <= Date.now();
    const baseAttempts = lockoutExpired ? 0 : user.failedLoginAttempts ?? 0;
    const nextAttempts = baseAttempts + 1;
    const willLock = nextAttempts >= LOCKOUT_THRESHOLD;
    const newLockedUntil = willLock
      ? new Date(Date.now() + LOCKOUT_DURATION_MS)
      : lockoutExpired
        ? null
        : user.lockedUntil;
    await db
      .update(usersTable)
      .set({
        failedLoginAttempts: nextAttempts,
        lockedUntil: newLockedUntil,
      })
      .where(eq(usersTable.id, user.id));

    if (willLock) {
      res.status(429).json({
        error: `Аккаунт временно заблокирован после нескольких неверных попыток. Попробуй через ${Math.ceil(LOCKOUT_DURATION_MS / 60_000)} мин.`,
      });
      return;
    }
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }

  if (user.status !== "active") {
    res.status(403).json({ error: "Аккаунт заблокирован или неактивен" });
    return;
  }

  // Success — reset the lockout counter and update last_login_at.
  await db
    .update(usersTable)
    .set({
      lastLoginAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(usersTable.id, user.id));

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
  // impersonator surfaces в payload, чтобы UI мог показать баннер
  // «Вы вошли как X (admin: Y)» и кнопку «Вернуться к админу».
  res.json({
    user: buildProfilePayload(u),
    impersonator: req.session.impersonator ?? null,
  });
});

// ─── Impersonation (admin → войти как пользователь) ────────────────────────
//
// Подменяет session.user на target и сохраняет оригинального admin'а в
// session.impersonator. Все последующие запросы выполняются от имени target
// (RBAC, scope, audit) — admin несёт полную ответственность за действия,
// поэтому каждое начало/окончание импер. логируется в audit_log.
//
// Запреты:
//  - доступно только admin
//  - target не может быть admin (нельзя «брать» чужого админа)
//  - вложенный импер. запрещён (если уже импер'ишь — сначала останови)

router.post("/auth/impersonate", requireAuth, async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;

  if (sessionUser.role !== "admin") {
    res.status(403).json({ error: "Только администратор может входить от имени пользователя" });
    return;
  }
  if (req.session.impersonator) {
    res.status(400).json({ error: "Сначала вернись к своей учётной записи" });
    return;
  }

  const targetId = Number(req.body?.userId);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    res.status(400).json({ error: "userId обязателен" });
    return;
  }
  if (targetId === sessionUser.id) {
    res.status(400).json({ error: "Нельзя войти самим собой" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
  if (!target) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }
  if (target.role === "admin") {
    res.status(403).json({ error: "Нельзя войти под другого администратора" });
    return;
  }
  if (target.status !== "active") {
    res.status(400).json({ error: "Пользователь неактивен или заблокирован" });
    return;
  }

  const impersonator: ImpersonatorRef = {
    id: sessionUser.id,
    name: sessionUser.name,
    email: sessionUser.email,
    role: sessionUser.role,
  };
  const newSessionUser: SessionUser = {
    id: target.id,
    name: target.name,
    email: target.email,
    role: target.role as AuthRole,
    artistId: target.artistId,
    labelId: target.labelId,
  };

  // Аудит ДО смены сессии — чтобы IP/userAgent были привязаны к admin'у.
  void auditMutation(req, {
    action: "update",
    entityType: "auth.impersonate.start",
    entityId: target.id,
    after: { adminId: impersonator.id, targetId: target.id, targetEmail: target.email },
  });

  // Регенерируем session ID (защита от session fixation на target's сессию).
  req.session.regenerate((regenErr) => {
    if (regenErr) {
      req.log?.error({ err: regenErr }, "session.regenerate failed (impersonate)");
      res.status(500).json({ error: "Не удалось переключить сессию" });
      return;
    }
    req.session.user = newSessionUser;
    req.session.impersonator = impersonator;
    req.session.save((err) => {
      if (err) {
        req.log?.error({ err }, "session.save failed (impersonate)");
        res.status(500).json({ error: "Не удалось переключить сессию" });
        return;
      }
      res.json({
        user: buildProfilePayload(target),
        impersonator,
      });
    });
  });
});

router.post("/auth/stop-impersonate", requireAuth, async (req, res): Promise<void> => {
  const impersonator = req.session.impersonator;
  if (!impersonator) {
    res.status(400).json({ error: "Вы не находитесь в режиме impersonation" });
    return;
  }

  const [adminUser] = await db.select().from(usersTable).where(eq(usersTable.id, impersonator.id));
  if (!adminUser) {
    // Admin удалили во время impersonation — единственный безопасный выход — destroy session.
    req.session.destroy(() => {
      res.status(401).json({ error: "Учётная запись администратора больше не существует" });
    });
    return;
  }
  if (adminUser.status !== "active" || adminUser.role !== "admin") {
    req.session.destroy(() => {
      res.status(401).json({ error: "Учётная запись администратора заблокирована" });
    });
    return;
  }

  void auditMutation(req, {
    action: "update",
    entityType: "auth.impersonate.stop",
    entityId: req.session.user?.id ?? null,
    after: { adminId: adminUser.id, targetId: req.session.user?.id ?? null },
  });

  const restored: SessionUser = {
    id: adminUser.id,
    name: adminUser.name,
    email: adminUser.email,
    role: adminUser.role as AuthRole,
    artistId: adminUser.artistId,
    labelId: adminUser.labelId,
  };

  req.session.regenerate((regenErr) => {
    if (regenErr) {
      req.log?.error({ err: regenErr }, "session.regenerate failed (stop-impersonate)");
      res.status(500).json({ error: "Не удалось вернуть сессию" });
      return;
    }
    req.session.user = restored;
    // impersonator сбрасывается — после regenerate session пустая, мы кладём только user.
    req.session.save((err) => {
      if (err) {
        req.log?.error({ err }, "session.save failed (stop-impersonate)");
        res.status(500).json({ error: "Не удалось вернуть сессию" });
        return;
      }
      res.json({
        user: buildProfilePayload(adminUser),
        impersonator: null,
      });
    });
  });
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
  // Reset the lockout counter alongside the password change — a successful
  // password change implies the user (or admin via reset flow) has control,
  // and we don't want a stale counter blocking the next login.
  await db
    .update(usersTable)
    .set({ passwordHash: newHash, failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

export default router;
