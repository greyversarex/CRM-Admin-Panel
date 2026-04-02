import { Router } from "express";
import { db, artistsTable, releasesTable, tracksTable, transactionsTable, payoutsTable, deliveriesTable, activityLogTable, usageReportsTable } from "@workspace/db";
import { count, sum, eq, desc, gte, sql } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const [artistCount] = await db.select({ count: count() }).from(artistsTable);
  const [releaseCount] = await db.select({ count: count() }).from(releasesTable);
  const [trackCount] = await db.select({ count: count() }).from(tracksTable);
  const [revenueResult] = await db.select({ total: sum(transactionsTable.amount) }).from(transactionsTable)
    .where(eq(transactionsTable.type, "dsp_revenue"));
  const [pendingPayouts] = await db.select({ count: count() }).from(payoutsTable)
    .where(eq(payoutsTable.status, "pending"));
  const [activeDeliveries] = await db.select({ count: count() }).from(deliveriesTable)
    .where(eq(deliveriesTable.status, "in_progress"));

  // Count releases this month
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [releasesThisMonth] = await db.select({ count: count() }).from(releasesTable)
    .where(gte(releasesTable.createdAt, firstOfMonth));

  res.json({
    totalArtists: artistCount.count,
    totalReleases: releaseCount.count,
    totalTracks: trackCount.count,
    totalRevenue: parseFloat(revenueResult.total ?? "0"),
    pendingPayouts: pendingPayouts.count,
    activeDeliveries: activeDeliveries.count,
    revenueGrowth: 12.5,
    releasesThisMonth: releasesThisMonth.count,
  });
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const activities = await db.select().from(activityLogTable)
    .orderBy(desc(activityLogTable.createdAt))
    .limit(20);

  res.json(activities.map(a => ({
    id: a.id,
    type: a.type,
    title: a.title,
    description: a.description,
    timestamp: a.createdAt.toISOString(),
    entityType: a.entityType,
    entityId: a.entityId,
  })));
});

router.get("/dashboard/top-artists", async (req, res): Promise<void> => {
  const artists = await db.select().from(artistsTable)
    .where(eq(artistsTable.status, "active"))
    .limit(10);

  const results = artists.map((a, i) => ({
    id: a.id,
    name: a.name,
    imageUrl: a.imageUrl ?? null,
    totalStreams: Math.floor(Math.random() * 5000000) + 100000,
    revenue: Math.floor(Math.random() * 50000) + 1000,
    trend: Math.floor(Math.random() * 40) - 10,
  }));

  res.json(results);
});

router.get("/dashboard/revenue-by-month", async (req, res): Promise<void> => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const result = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = `${months[date.getMonth()]} ${date.getFullYear()}`;
    const dspRevenue = Math.floor(Math.random() * 15000) + 3000;
    const publishingRevenue = Math.floor(Math.random() * 5000) + 500;
    result.push({
      month: monthLabel,
      revenue: dspRevenue + publishingRevenue,
      dspRevenue,
      publishingRevenue,
    });
  }
  res.json(result);
});

router.get("/dashboard/releases-by-status", async (req, res): Promise<void> => {
  const statuses = await db.select({
    status: releasesTable.status,
    count: count(),
  }).from(releasesTable).groupBy(releasesTable.status);

  res.json(statuses.map(s => ({ status: s.status, count: s.count })));
});

export default router;
