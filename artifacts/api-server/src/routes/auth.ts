import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { SessionUser, AuthRole } from "../lib/auth";

const router = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
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

  req.session.user = sessionUser;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Не удалось создать сессию" });
      return;
    }
    res.json({ user: sessionUser });
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

router.get("/auth/me", (req, res): void => {
  if (!req.session?.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ user: req.session.user });
});

export default router;
