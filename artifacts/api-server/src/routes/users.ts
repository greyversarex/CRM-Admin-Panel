import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { count, eq, desc, ilike, or, and } from "drizzle-orm";
import { z } from "zod";
import { CreateUserBody, UpdateUserBody, GetUserParams, UpdateUserParams, DeleteUserParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";

const adminOnly = requireRole("admin", "manager");

const router = Router();

// Whitelist of fields a user is allowed to change on their own profile.
// Notably absent: role, status, email, artistId, labelId, passwordHash.
const UpdateMyProfileBody = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  country: z.string().max(8).nullable().optional(),
  region: z.string().max(120).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  zipCode: z.string().max(20).nullable().optional(),
  about: z.string().max(2000).nullable().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  dspProfiles: z.object({
    appleMusic: z.string().max(255).optional(),
    spotify:    z.string().max(255).optional(),
    yandex:     z.string().max(255).optional(),
    youtube:    z.string().max(255).optional(),
  }).strict().optional(),
  socialLinks: z.object({
    facebook:  z.string().max(255).optional(),
    instagram: z.string().max(255).optional(),
    youtube:   z.string().max(255).optional(),
    tiktok:    z.string().max(255).optional(),
    linkedin:  z.string().max(255).optional(),
    x:         z.string().max(255).optional(),
    telegram:  z.string().max(255).optional(),
    vk:        z.string().max(255).optional(),
  }).strict().optional(),
}).strict();

function formatUser(u: typeof usersTable.$inferSelect) {
  // Strip the password hash so it never leaks via /users responses.
  const { passwordHash: _omit, ...rest } = u;
  return {
    ...rest,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

router.get("/users", adminOnly, async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;
  const role = req.query.role as string | undefined;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const filters: any[] = [];
  if (role)   filters.push(eq(usersTable.role, role));
  if (status) filters.push(eq(usersTable.status, status));
  if (search) filters.push(or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`)));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const users = await db.select().from(usersTable).where(where).limit(limit).offset(offset).orderBy(desc(usersTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(usersTable).where(where);

  res.json({
    data: users.map(formatUser),
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

router.post("/users", adminOnly, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.insert(usersTable).values(parsed.data).returning();
  res.status(201).json(formatUser(user));
});

router.patch("/users/me", requireAuth, async (req, res): Promise<void> => {
  const sessionUser = req.session.user!;
  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Нечего обновлять" });
    return;
  }
  const [user] = await db.update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, sessionUser.id))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  // Keep session in sync if name changed (used for header / sidebar).
  if (parsed.data.name && req.session.user) {
    req.session.user.name = parsed.data.name;
  }
  res.json(formatUser(user));
});

router.get("/users/:id", adminOnly, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUser(user));
});

router.put("/users/:id", adminOnly, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUser(user));
});

router.delete("/users/:id", adminOnly, async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.delete(usersTable).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
