import { Router } from "express";
import { db, takedownRequestsTable } from "@workspace/db";
import { eq, desc, and, or } from "drizzle-orm";
import { getDataScope } from "../lib/auth";

const router = Router();

router.get("/takedowns", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const where = scope.fullAccess
    ? undefined
    : scope.role === "label" && scope.labelId
      ? eq(takedownRequestsTable.labelId, scope.labelId)
      : scope.role === "artist" && scope.artistId
        ? eq(takedownRequestsTable.artistId, scope.artistId)
        : eq(takedownRequestsTable.id, -1);

  const rows = await db
    .select()
    .from(takedownRequestsTable)
    .where(where)
    .orderBy(desc(takedownRequestsTable.submittedAt));

  res.json(rows.map(r => ({
    id: r.id,
    release: r.releaseTitle,
    artist: r.artistName,
    upc: r.upc ?? "",
    reason: r.reason,
    note: r.note ?? "",
    dsps: r.dsps as string[],
    status: r.status,
    submittedAt: r.submittedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  })));
});

router.post("/takedowns", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  if (!req.session?.user?.id) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { release, artist, upc, reason, note, dsps } = req.body as {
    release: string; artist: string; upc?: string;
    reason: string; note?: string; dsps: string[];
  };

  if (!release || !reason || !dsps?.length) {
    res.status(400).json({ error: "release, reason and dsps are required" });
    return;
  }

  const [row] = await db.insert(takedownRequestsTable).values({
    releaseTitle: release,
    artistName: artist ?? "",
    upc: upc ?? null,
    reason,
    note: note ?? null,
    dsps,
    status: "pending",
    labelId: scope.labelId ?? null,
    artistId: scope.artistId ?? null,
    createdById: req.session?.user?.id,
  }).returning();

  res.status(201).json({
    id: row.id,
    release: row.releaseTitle,
    artist: row.artistName,
    upc: row.upc ?? "",
    reason: row.reason,
    note: row.note ?? "",
    dsps: row.dsps as string[],
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    completedAt: null,
  });
});

router.patch("/takedowns/:id/status", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  if (!scope.fullAccess) { res.status(403).json({ error: "Admin/manager only" }); return; }

  const id = parseInt(req.params.id, 10);
  const { status } = req.body as { status: string };
  const allowed = ["pending", "processing", "completed", "rejected"];
  if (!allowed.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }

  const completedAt = status === "completed" ? new Date() : undefined;

  const [row] = await db.update(takedownRequestsTable)
    .set({ status, ...(completedAt ? { completedAt } : {}) })
    .where(eq(takedownRequestsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: row.id, status: row.status, completedAt: row.completedAt?.toISOString() ?? null });
});

export default router;
