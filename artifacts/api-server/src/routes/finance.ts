import { Router } from "express";
import { db, transactionsTable, artistsTable, labelsTable, releasesTable, payoutsTable } from "@workspace/db";
import { count, eq, desc } from "drizzle-orm";
import {
  CreateTransactionBody,
  CreatePayoutRequestBody,
  RejectPayoutBody,
} from "@workspace/api-zod";

const router = Router();

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

  const transactions = await db.select().from(transactionsTable).limit(limit).offset(offset).orderBy(desc(transactionsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(transactionsTable);

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

router.post("/finance/transactions", async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [transaction] = await db.insert(transactionsTable).values({
    ...parsed.data,
    amount: parsed.data.amount.toString(),
  }).returning();
  res.status(201).json({
    ...formatTransaction(transaction),
    artistName: null,
    labelName: null,
    releaseName: null,
  });
});

// Balances
router.get("/finance/balances", async (req, res): Promise<void> => {
  const artists = await db.select().from(artistsTable).where(eq(artistsTable.status, "active"));

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

  const payouts = await db.select().from(payoutsTable).limit(limit).offset(offset).orderBy(desc(payoutsTable.createdAt));
  const [totalResult] = await db.select({ count: count() }).from(payoutsTable);

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

  const [payout] = await db.insert(payoutsTable).values({
    ...parsed.data,
    amount: parsed.data.amount.toString(),
  }).returning();
  res.status(201).json({
    ...formatPayout(payout),
    artistName: null,
    labelName: null,
  });
});

router.patch("/payouts/:id/approve", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [payout] = await db.update(payoutsTable)
    .set({ status: "approved", processedAt: new Date() })
    .where(eq(payoutsTable.id, id))
    .returning();

  if (!payout) {
    res.status(404).json({ error: "Payout not found" });
    return;
  }

  res.json({
    ...formatPayout(payout),
    artistName: null,
    labelName: null,
  });
});

router.patch("/payouts/:id/reject", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const parsed = RejectPayoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [payout] = await db.update(payoutsTable)
    .set({ status: "rejected", rejectionReason: parsed.data.reason, processedAt: new Date() })
    .where(eq(payoutsTable.id, id))
    .returning();

  if (!payout) {
    res.status(404).json({ error: "Payout not found" });
    return;
  }

  res.json({
    ...formatPayout(payout),
    artistName: null,
    labelName: null,
  });
});

export default router;
