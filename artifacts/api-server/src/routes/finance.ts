import { Router } from "express";
import { db, transactionsTable, artistsTable, labelsTable, releasesTable, payoutsTable, usersTable } from "@workspace/db";
import { count, eq, desc, and } from "drizzle-orm";
import {
  CreateTransactionBody,
  CreatePayoutRequestBody,
  RejectPayoutBody,
} from "@workspace/api-zod";
import { getDataScope, requireRole } from "../lib/auth";
import { auditMutation } from "../lib/audit";
import { notifyByArtistId, notifyByLabelId, notifyAdmins } from "../services/notifications";

const router = Router();

// Build a scope filter for transactions/payouts tables that have artist_id and label_id
// columns. Returns null if the caller's query asked for something outside their scope.
function scopedArtistLabelFilter(
  req: any,
  artistCol: any,
  labelCol: any,
): any[] | null {
  const scope = getDataScope(req);
  const conditions: any[] = [];

  let qArtist: number | undefined;
  let qLabel: number | undefined;
  if (req.query.artist_id !== undefined) {
    const v = parseInt(req.query.artist_id as string, 10);
    if (!Number.isFinite(v)) return null;
    qArtist = v;
  }
  if (req.query.label_id !== undefined) {
    const v = parseInt(req.query.label_id as string, 10);
    if (!Number.isFinite(v)) return null;
    qLabel = v;
  }

  if (scope.fullAccess) {
    if (qArtist !== undefined) conditions.push(eq(artistCol, qArtist));
    if (qLabel  !== undefined) conditions.push(eq(labelCol,  qLabel));
    return conditions;
  }
  if (scope.role === "artist") {
    if (scope.artistId == null) return null; // signals "no rows"
    if (qArtist !== undefined && qArtist !== scope.artistId) return null;
    conditions.push(eq(artistCol, scope.artistId));
    return conditions;
  }
  if (scope.role === "label") {
    if (scope.labelId == null) return null;
    if (qLabel !== undefined && qLabel !== scope.labelId) return null;
    conditions.push(eq(labelCol, scope.labelId));
    return conditions;
  }
  return null;
}

function formatTransaction(t: typeof transactionsTable.$inferSelect) {
  return {
    ...t,
    amount: parseFloat(t.amount),
    createdAt: t.createdAt.toISOString(),
  };
}

function formatPayout(p: typeof payoutsTable.$inferSelect) {
  return {
    ...p,
    amount: parseFloat(p.amount),
    processedAt: p.processedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// Transactions
router.get("/finance/transactions", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  const scoped = scopedArtistLabelFilter(req, transactionsTable.artistId, transactionsTable.labelId);
  if (scoped === null) {
    // Either an out-of-scope query or a non-privileged user with no entity assignment.
    // Return empty page rather than 403 — keeps the UI clean for the user's own view.
    res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    return;
  }
  const filters: any[] = [...scoped];
  if (req.query.type !== undefined) {
    filters.push(eq(transactionsTable.type, req.query.type as string));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const transactions = await db.select().from(transactionsTable).where(where).limit(limit).offset(offset).orderBy(desc(transactionsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(transactionsTable).where(where);

  const artistIds = transactions.map(t => t.artistId).filter(Boolean) as number[];
  const labelIds = transactions.map(t => t.labelId).filter(Boolean) as number[];
  const releaseIds = transactions.map(t => t.releaseId).filter(Boolean) as number[];

  const artists = artistIds.length > 0 ? await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable) : [];
  const labels = labelIds.length > 0 ? await db.select({ id: labelsTable.id, name: labelsTable.name }).from(labelsTable) : [];
  const releases = releaseIds.length > 0 ? await db.select({ id: releasesTable.id, title: releasesTable.title }).from(releasesTable) : [];

  const artistMap = new Map(artists.map(a => [a.id, a.name]));
  const labelMap = new Map(labels.map(l => [l.id, l.name]));
  const releaseMap = new Map(releases.map(r => [r.id, r.title]));

  res.json({
    data: transactions.map(t => ({
      ...formatTransaction(t),
      artistName: t.artistId ? (artistMap.get(t.artistId) ?? null) : null,
      labelName: t.labelId ? (labelMap.get(t.labelId) ?? null) : null,
      releaseName: t.releaseId ? (releaseMap.get(t.releaseId) ?? null) : null,
    })),
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

router.post("/finance/transactions", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [transaction] = await db.insert(transactionsTable).values({
    ...parsed.data,
    amount: parsed.data.amount.toString(),
  }).returning();
  void auditMutation(req, { action: "create", entityType: "transaction", entityId: transaction.id, before: null, after: transaction });
  res.status(201).json({
    ...formatTransaction(transaction),
    artistName: null,
    labelName: null,
    releaseName: null,
  });
});

// Balances
router.get("/finance/balances", async (req, res): Promise<void> => {
  const scope = getDataScope(req);
  let artistIdFilter = req.query.artist_id !== undefined ? parseInt(req.query.artist_id as string, 10) : undefined;
  let labelIdFilter  = req.query.label_id  !== undefined ? parseInt(req.query.label_id  as string, 10) : undefined;
  if (req.query.artist_id !== undefined && !Number.isFinite(artistIdFilter)) {
    res.status(400).json({ error: "Invalid artist_id" }); return;
  }
  if (req.query.label_id !== undefined && !Number.isFinite(labelIdFilter)) {
    res.status(400).json({ error: "Invalid label_id" }); return;
  }

  // Override scope for non-privileged roles.
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) { res.json([]); return; }
      if (artistIdFilter !== undefined && artistIdFilter !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
      artistIdFilter = scope.artistId; labelIdFilter = undefined;
    } else if (scope.role === "label") {
      if (scope.labelId == null) { res.json([]); return; }
      if (labelIdFilter !== undefined && labelIdFilter !== scope.labelId) { res.status(403).json({ error: "Forbidden" }); return; }
      labelIdFilter = scope.labelId; artistIdFilter = undefined;
    }
  }

  const conditions: any[] = [eq(artistsTable.status, "active")];
  if (artistIdFilter !== undefined) conditions.push(eq(artistsTable.id, artistIdFilter));
  if (labelIdFilter  !== undefined) conditions.push(eq(artistsTable.labelId, labelIdFilter));

  const artists = await db.select().from(artistsTable).where(and(...conditions));

  const balances = artists.map(a => ({
    entityType: "artist",
    entityId: a.id,
    entityName: a.name,
    balance: parseFloat((Math.random() * 10000).toFixed(2)),
    currency: "USD",
    pendingPayout: parseFloat((Math.random() * 2000).toFixed(2)),
  }));

  res.json(balances);
});

// Payouts
router.get("/payouts", async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10) || 1;
  const limit = parseInt(req.query.limit as string ?? "20", 10) || 20;
  const offset = (page - 1) * limit;

  const scoped = scopedArtistLabelFilter(req, payoutsTable.artistId, payoutsTable.labelId);
  if (scoped === null) {
    res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    return;
  }
  const filters: any[] = [...scoped];
  if (req.query.status !== undefined) {
    filters.push(eq(payoutsTable.status, req.query.status as string));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const payouts = await db.select().from(payoutsTable).where(where).limit(limit).offset(offset).orderBy(desc(payoutsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(payoutsTable).where(where);

  const artists = await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable);
  const labels = await db.select({ id: labelsTable.id, name: labelsTable.name }).from(labelsTable);
  const artistMap = new Map(artists.map(a => [a.id, a.name]));
  const labelMap = new Map(labels.map(l => [l.id, l.name]));

  res.json({
    data: payouts.map(p => ({
      ...formatPayout(p),
      artistName: p.artistId ? (artistMap.get(p.artistId) ?? null) : null,
      labelName: p.labelId ? (labelMap.get(p.labelId) ?? null) : null,
    })),
    pagination: {
      page,
      limit,
      total: totalResult.count,
      totalPages: Math.ceil(totalResult.count / limit),
    },
  });
});

router.post("/payouts", async (req, res): Promise<void> => {
  const parsed = CreatePayoutRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Scope: artist may only request payout for own artistId; label only own labelId.
  // Also enforce pair consistency: if both artistId and labelId are present,
  // they must reference the same tenant subtree.
  const scope = getDataScope(req);
  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null || parsed.data.artistId !== scope.artistId) { res.status(403).json({ error: "Forbidden" }); return; }
      // If a labelId is also passed in by an artist user, it must match their artist's label.
      if (parsed.data.labelId != null) {
        const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, scope.artistId));
        if (!a || a.labelId !== parsed.data.labelId) { res.status(403).json({ error: "labelId mismatch" }); return; }
      }
    } else if (scope.role === "label") {
      if (scope.labelId == null || parsed.data.labelId !== scope.labelId) { res.status(403).json({ error: "Forbidden" }); return; }
      // If an artistId is supplied, it must belong to this label.
      if (parsed.data.artistId != null) {
        const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, parsed.data.artistId));
        if (!a || a.labelId !== scope.labelId) { res.status(403).json({ error: "Artist does not belong to your label" }); return; }
      }
    }
  }

  // ─── KYC + bank-info guard (Task #6, ТЗ §4.4) ────────────────────────────
  // Без подтверждённого KYC и заполненных банк-реквизитов выплата не оформляется.
  // admin/manager пропускаем — они инициируют выплаты от имени артиста/лейбла,
  // и у них может быть свой процесс верификации.
  const sessionUser = req.session.user!;
  if (sessionUser.role === "artist" || sessionUser.role === "label") {
    const [me] = await db.select({
      kycStatus: usersTable.kycStatus,
      bankAccountNumber: usersTable.bankAccountNumber,
      bankSwift: usersTable.bankSwift,
      bankHolderName: usersTable.bankHolderName,
    }).from(usersTable).where(eq(usersTable.id, sessionUser.id));
    if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (me.kycStatus !== "approved") {
      res.status(400).json({
        error: "Сначала пройди KYC-верификацию в профиле",
        code: "kyc_not_approved",
        kycStatus: me.kycStatus,
      });
      return;
    }
    if (!me.bankAccountNumber || !me.bankSwift || !me.bankHolderName) {
      res.status(400).json({
        error: "Заполни банковские реквизиты в профиле перед запросом выплаты",
        code: "bank_info_missing",
      });
      return;
    }
  }

  const [payout] = await db.insert(payoutsTable).values({
    ...parsed.data,
    amount: parsed.data.amount.toString(),
  }).returning();
  void auditMutation(req, { action: "create", entityType: "payout", entityId: payout.id, before: null, after: payout });

  // Уведомляем всех администраторов и менеджеров о новом запросе на выплату.
  const requesterName = req.session.user!.name;
  void notifyAdmins({
    type: "payout_requested",
    title: `💰 Новый запрос на выплату: ${payout.amount} ${payout.currency}`,
    body: `От: ${requesterName}. Метод: ${payout.method ?? "—"}.`,
    entityType: "payout",
    entityId: payout.id,
    link: "/payouts",
  });

  res.status(201).json({
    ...formatPayout(payout),
    artistName: null,
    labelName: null,
  });
});

router.patch("/payouts/:id/approve", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [existing] = await db.select().from(payoutsTable).where(eq(payoutsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Payout not found" }); return; }

  const [payout] = await db.update(payoutsTable)
    .set({ status: "approved", processedAt: new Date() })
    .where(eq(payoutsTable.id, id))
    .returning();

  if (!payout) {
    res.status(404).json({ error: "Payout not found" });
    return;
  }
  void auditMutation(req, { action: "approve", entityType: "payout", entityId: payout.id, before: existing, after: payout });

  // Уведомляем получателя о том, что выплата одобрена.
  const approveTitle = `💸 Выплата на ${payout.amount} ${payout.currency} одобрена`;
  const approveBody = "Средства будут переведены в ближайшее время.";
  if (payout.artistId) void notifyByArtistId(payout.artistId, { type: "payout_approved", title: approveTitle, body: approveBody, entityType: "payout", entityId: payout.id, link: "/payouts" });
  if (payout.labelId)  void notifyByLabelId(payout.labelId,   { type: "payout_approved", title: approveTitle, body: approveBody, entityType: "payout", entityId: payout.id, link: "/payouts" });

  res.json({
    ...formatPayout(payout),
    artistName: null,
    labelName: null,
  });
});

router.patch("/payouts/:id/reject", requireRole("admin", "manager"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = RejectPayoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(payoutsTable).where(eq(payoutsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Payout not found" }); return; }

  const [payout] = await db.update(payoutsTable)
    .set({ status: "rejected", rejectionReason: parsed.data.reason, processedAt: new Date() })
    .where(eq(payoutsTable.id, id))
    .returning();

  if (!payout) {
    res.status(404).json({ error: "Payout not found" });
    return;
  }
  void auditMutation(req, { action: "reject", entityType: "payout", entityId: payout.id, before: existing, after: payout });

  // Уведомляем получателя об отклонении выплаты.
  const rejectTitle = `🚫 Выплата на ${payout.amount} ${payout.currency} отклонена`;
  const rejectBody = parsed.data.reason ? `Причина: ${parsed.data.reason}` : "";
  if (payout.artistId) void notifyByArtistId(payout.artistId, { type: "payout_rejected", title: rejectTitle, body: rejectBody, entityType: "payout", entityId: payout.id, link: "/payouts" });
  if (payout.labelId)  void notifyByLabelId(payout.labelId,   { type: "payout_rejected", title: rejectTitle, body: rejectBody, entityType: "payout", entityId: payout.id, link: "/payouts" });

  res.json({
    ...formatPayout(payout),
    artistName: null,
    labelName: null,
  });
});

export default router;
