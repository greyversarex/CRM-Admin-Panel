import { Router } from "express";
import { db, labelMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getDataScope } from "../lib/auth";

const router = Router();

router.get("/label-members", async (req, res): Promise<void> => {
  const scope = getDataScope(req);

  let labelId: number | null = null;
  if (scope.fullAccess && req.query.labelId) {
    labelId = parseInt(req.query.labelId as string, 10);
  } else if (scope.role === "label" && scope.labelId) {
    labelId = scope.labelId;
  }

  if (!labelId) { res.status(400).json({ error: "labelId required" }); return; }

  const rows = await db
    .select()
    .from(labelMembersTable)
    .where(eq(labelMembersTable.labelId, labelId))
    .orderBy(labelMembersTable.invitedAt);

  res.json(rows.map(r => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    status: r.status,
    invitedAt: r.invitedAt.toISOString(),
    joinedAt: r.joinedAt?.toISOString() ?? null,
  })));
});

router.post("/label-members/invite", async (req, res): Promise<void> => {
  const scope = getDataScope(req);

  let labelId: number | null = null;
  if (scope.fullAccess && req.body.labelId) {
    labelId = parseInt(req.body.labelId, 10);
  } else if (scope.role === "label" && scope.labelId) {
    labelId = scope.labelId;
  }

  if (!labelId) { res.status(400).json({ error: "labelId required" }); return; }
  if (!req.session?.user?.id) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { email, name, role } = req.body as { email: string; name: string; role: string };
  if (!email || !name) { res.status(400).json({ error: "email and name required" }); return; }

  const validRoles = ["manager", "viewer"];
  const memberRole = validRoles.includes(role) ? role : "viewer";

  const existing = await db
    .select({ id: labelMembersTable.id })
    .from(labelMembersTable)
    .where(and(eq(labelMembersTable.labelId, labelId), eq(labelMembersTable.email, email)));

  if (existing.length > 0) {
    res.status(409).json({ error: "Этот email уже добавлен в команду" });
    return;
  }

  const [row] = await db.insert(labelMembersTable).values({
    labelId,
    email,
    name,
    role: memberRole,
    status: "pending",
    invitedById: req.session?.user?.id,
  }).returning();

  res.status(201).json({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    invitedAt: row.invitedAt.toISOString(),
    joinedAt: null,
  });
});

router.patch("/label-members/:id/role", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const id = parseInt(req.params.id, 10);
  const { role } = req.body as { role: string };

  const validRoles = ["owner", "manager", "viewer"];
  if (!validRoles.includes(role)) { res.status(400).json({ error: "Invalid role" }); return; }

  const [existing] = await db.select().from(labelMembersTable).where(eq(labelMembersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const isOwner = scope.role === "label" && scope.labelId === existing.labelId;
  if (!isOwner && !scope.fullAccess) { res.status(403).json({ error: "Forbidden" }); return; }

  const [row] = await db.update(labelMembersTable)
    .set({ role })
    .where(eq(labelMembersTable.id, id))
    .returning();

  res.json({ id: row.id, role: row.role });
});

router.delete("/label-members/:id", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const id = parseInt(req.params.id, 10);

  const [existing] = await db.select().from(labelMembersTable).where(eq(labelMembersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const isOwner = scope.role === "label" && scope.labelId === existing.labelId;
  if (!isOwner && !scope.fullAccess) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(labelMembersTable).where(eq(labelMembersTable.id, id));
  res.json({ ok: true });
});

export default router;
