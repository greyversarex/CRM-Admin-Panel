import { Router } from "express";
import { db, splitsTable, releasesTable, tracksTable } from "@workspace/db";
import { count, eq, desc, and, sql, inArray } from "drizzle-orm";
import { CreateSplitBody, UpdateSplitBody, GetSplitParams, UpdateSplitParams, DeleteSplitParams } from "@workspace/api-zod";
import { requireAuth, requireRole, getDataScope } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { notifyAdmins } from "../services/notifications";

const router = Router();

async function enrichSplit(s: typeof splitsTable.$inferSelect) {
  let releaseName = null;
  if (s.releaseId) {
    const [release] = await db.select({ title: releasesTable.title }).from(releasesTable).where(eq(releasesTable.id, s.releaseId));
    releaseName = release?.title ?? null;
  }

  let trackName = null;
  if (s.trackId) {
    const [track] = await db.select({ title: tracksTable.title }).from(tracksTable).where(eq(tracksTable.id, s.trackId));
    trackName = track?.title ?? null;
  }

  return {
    ...s,
    releaseName,
    trackName,
    participants: (s.participants as any[]) ?? [],
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Resolve release IDs visible to the current scope (artist/label). */
async function scopedReleaseIds(scope: ReturnType<typeof getDataScope>): Promise<number[] | null> {
  if (scope.fullAccess) return null; // null = no restriction
  if (scope.artistId) {
    const rows = await db.select({ id: releasesTable.id }).from(releasesTable).where(eq(releasesTable.artistId, scope.artistId));
    return rows.map(r => r.id);
  }
  if (scope.labelId) {
    const rows = await db.select({ id: releasesTable.id }).from(releasesTable).where(eq(releasesTable.labelId, scope.labelId));
    return rows.map(r => r.id);
  }
  return [];
}

// GET /splits — artist/label see only splits for their own releases
router.get("/splits", requireAuth, async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  const filters: any[] = [];

  if (req.query.release_id !== undefined) {
    const v = parseInt(req.query.release_id as string, 10);
    if (Number.isFinite(v)) filters.push(eq(splitsTable.releaseId, v));
  }
  if (req.query.track_id !== undefined) {
    const v = parseInt(req.query.track_id as string, 10);
    if (Number.isFinite(v)) filters.push(eq(splitsTable.trackId, v));
  }
  if (req.query.artist_id !== undefined) {
    const v = parseInt(req.query.artist_id as string, 10);
    if (!Number.isFinite(v)) { res.status(400).json({ error: "Invalid artist_id" }); return; }
    filters.push(sql`${splitsTable.participants} @> ${JSON.stringify([{ entityType: "artist", entityId: v }])}::jsonb`);
  }

  // Scope: non-admin/manager can only see splits for their releases
  const releaseIds = await scopedReleaseIds(scope);
  if (releaseIds !== null) {
    if (releaseIds.length === 0) {
      res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      return;
    }
    filters.push(inArray(splitsTable.releaseId, releaseIds));
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const splits = await db.select().from(splitsTable).where(where).limit(limit).offset(offset).orderBy(desc(splitsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(splitsTable).where(where);

  const data = await Promise.all(splits.map(enrichSplit));

  res.json({
    data,
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

// POST /splits — admin/manager only
router.post("/splits", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const parsed = CreateSplitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const total = parsed.data.participants.reduce((sum, p) => sum + p.percentage, 0);
  if (Math.abs(total - 100) > 0.01) {
    res.status(400).json({ error: "Split percentages must sum to 100%" });
    return;
  }

  const [split] = await db.insert(splitsTable).values({
    ...parsed.data,
    participants: parsed.data.participants as any,
  }).returning();
  void auditMutation(req, { action: "create", entityType: "split", entityId: split.id, before: null, after: split });
  const enriched = await enrichSplit(split);
  res.status(201).json(enriched);
});

// GET /splits/:id — scoped (artist/label can only view splits for their releases)
router.get("/splits/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetSplitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [split] = await db.select().from(splitsTable).where(eq(splitsTable.id, params.data.id));
  if (!split) {
    res.status(404).json({ error: "Split not found" });
    return;
  }

  // Scope check for non-admin/manager
  const scope = getDataScope(req);
  if (!scope.fullAccess && split.releaseId) {
    const [release] = await db.select({ artistId: releasesTable.artistId, labelId: releasesTable.labelId })
      .from(releasesTable).where(eq(releasesTable.id, split.releaseId));
    if (release) {
      const artistOk = !scope.artistId || release.artistId === scope.artistId;
      const labelOk = !scope.labelId || release.labelId === scope.labelId;
      if (!artistOk || !labelOk) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
  }

  const enriched = await enrichSplit(split);
  res.json(enriched);
});

// PUT /splits/:id — admin/manager only
router.put("/splits/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const params = UpdateSplitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSplitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const total = parsed.data.participants.reduce((sum, p) => sum + p.percentage, 0);
  if (Math.abs(total - 100) > 0.01) {
    res.status(400).json({ error: "Split percentages must sum to 100%" });
    return;
  }

  const [existing] = await db.select().from(splitsTable).where(eq(splitsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Split not found" }); return; }

  const [split] = await db.update(splitsTable)
    .set({ ...parsed.data, participants: parsed.data.participants as any })
    .where(eq(splitsTable.id, params.data.id))
    .returning();
  if (!split) {
    res.status(404).json({ error: "Split not found" });
    return;
  }
  void auditMutation(req, { action: "update", entityType: "split", entityId: split.id, before: existing, after: split });

  const enriched = await enrichSplit(split);
  res.json(enriched);
});

// DELETE /splits/:id — admin/manager only
router.delete("/splits/:id", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const params = DeleteSplitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [split] = await db.delete(splitsTable).where(eq(splitsTable.id, params.data.id)).returning();
  if (!split) {
    res.status(404).json({ error: "Split not found" });
    return;
  }
  void auditMutation(req, { action: "delete", entityType: "split", entityId: split.id, before: split, after: null });

  res.sendStatus(204);
});

// ─── Acceptance flow ──────────────────────────────────────────────────────
// Per-participant acceptance status is stored inline in the jsonb participants
// array as `acceptanceStatus: 'pending' | 'accepted' | 'rejected'` (default
// pending) + `acceptanceAt` ISO string. This avoids a schema migration: the UI
// derives the overall split status (pending / partial / fully-accepted /
// rejected) from the participants array.
async function applyParticipantDecision(
  req: Parameters<Parameters<typeof router.post>[1]>[0],
  res: Parameters<Parameters<typeof router.post>[1]>[1],
  decision: "accepted" | "rejected",
): Promise<void> {
  const params = GetSplitParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const scope = getDataScope(req);
  if (scope.role !== "artist" && scope.role !== "label") {
    res.status(403).json({ error: "Только артист или лейбл может подписать сплит" });
    return;
  }

  const [split] = await db.select().from(splitsTable).where(eq(splitsTable.id, params.data.id));
  if (!split) { res.status(404).json({ error: "Split not found" }); return; }

  const participants = (split.participants as any[]) ?? [];
  // Найти участника, которому соответствует текущий пользователь.
  const myEntityType = scope.role === "artist" ? "artist" : "label";
  const myEntityId = scope.role === "artist" ? scope.artistId : scope.labelId;
  if (!myEntityId) { res.status(403).json({ error: "Нет привязки к артисту/лейблу" }); return; }

  const idx = participants.findIndex(
    (p) => p && p.entityType === myEntityType && Number(p.entityId) === Number(myEntityId),
  );
  if (idx < 0) { res.status(403).json({ error: "Вы не указаны в этом сплите" }); return; }

  const now = new Date().toISOString();
  const updatedParticipants = participants.map((p, i) =>
    i === idx ? { ...p, acceptanceStatus: decision, acceptanceAt: now } : p,
  );

  const [updated] = await db.update(splitsTable)
    .set({ participants: updatedParticipants as any })
    .where(eq(splitsTable.id, split.id))
    .returning();

  void auditMutation(req, {
    action: decision === "accepted" ? "accept" : "reject",
    entityType: "split",
    entityId: split.id,
    before: split,
    after: updated,
  });

  // Уведомляем админов
  const participantName = participants[idx]?.entityName ?? `${myEntityType} #${myEntityId}`;
  void notifyAdmins({
    type: `split_${decision}`,
    title: decision === "accepted"
      ? `${participantName} подписал сплит #${split.id}`
      : `${participantName} отклонил сплит #${split.id}`,
    body: "",
    entityType: "general",
    link: "/splits",
  });

  const enriched = await enrichSplit(updated);
  res.json(enriched);
}

router.post("/splits/:id/accept", requireAuth, async (req, res): Promise<void> => {
  await applyParticipantDecision(req, res, "accepted");
});

router.post("/splits/:id/reject", requireAuth, async (req, res): Promise<void> => {
  await applyParticipantDecision(req, res, "rejected");
});

export default router;
