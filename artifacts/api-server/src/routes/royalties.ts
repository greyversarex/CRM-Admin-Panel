import { Router } from "express";
import {
  db, transactionsTable, releasesTable, artistsTable, labelsTable,
} from "@workspace/db";
import { and, eq, sql, inArray } from "drizzle-orm";
import { getDataScope } from "../lib/auth";

const router = Router();

const DEFAULT_FEE_RATE = 0.15;
const MIN_PAYOUT = 50;
const ALLOW_SEED = process.env.NODE_ENV !== "production";

function fmt(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(period: string) {
  const [y, m] = period.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

type EntityFilterResult =
  | { ok: true; conditions: any[]; type?: "artist" | "label"; id?: number }
  | { ok: false; error: string };

function entityFilter(req: any): EntityFilterResult {
  // For non-privileged roles, force entity_type/entity_id from session — query is ignored.
  const scope = getDataScope(req);
  let t: string | undefined;
  let rawId: string | undefined;

  if (!scope.fullAccess) {
    if (scope.role === "artist") {
      if (scope.artistId == null) return { ok: false, error: "Artist account is not linked to an artist record" };
      t = "artist"; rawId = String(scope.artistId);
    } else if (scope.role === "label") {
      if (scope.labelId == null) return { ok: false, error: "Label account is not linked to a label record" };
      t = "label"; rawId = String(scope.labelId);
    }
  } else {
    t = req.query.entity_type as string | undefined;
    rawId = req.query.entity_id as string | undefined;
  }

  if (t && t !== "artist" && t !== "label") return { ok: false, error: "entity_type must be 'artist' or 'label'" };
  if ((t && !rawId) || (!t && rawId)) return { ok: false, error: "entity_type and entity_id must be provided together" };
  if (!t) return { ok: true, conditions: [] };
  const id = parseInt(rawId!, 10);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid entity_id" };
  const conditions: any[] =
    t === "artist" ? [eq(transactionsTable.artistId, id)] : [eq(transactionsTable.labelId, id)];
  return { ok: true, conditions, type: t as "artist" | "label", id };
}

// ─── Summary ─────────────────────────────────────────────────────────────
router.get("/royalties/summary", async (req, res): Promise<void> => {
  const f = entityFilter(req);
  if (!f.ok) { res.status(400).json({ error: f.error }); return; }
  const where = f.conditions.length > 0 ? and(...f.conditions) : undefined;
  const isScoped = f.conditions.length > 0;

  const txs = await db.select().from(transactionsTable).where(where);

  const now = new Date();
  const months: { period: string; gross: number; net: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ period: fmt(d), gross: 0, net: 0 });
  }
  const idx: Record<string, number> = {};
  months.forEach((m, i) => (idx[m.period] = i));

  let lifetimeGross = 0;
  let lifetimeNet = 0;
  for (const t of txs) {
    const amt = Number(t.amount);
    if (t.type === "payout") continue;
    lifetimeGross += amt;
    const net = amt * (1 - DEFAULT_FEE_RATE);
    lifetimeNet += net;
    const period = t.period && /^\d{4}-\d{2}$/.test(t.period) ? t.period : fmt(t.createdAt);
    if (idx[period] !== undefined) {
      months[idx[period]].gross += amt;
      months[idx[period]].net += net;
    }
  }

  // Synthesize tiny baseline if DB is empty so cards never show 0 across the board (DEV ONLY)
  if (lifetimeGross === 0 && ALLOW_SEED) {
    const seedBase = isScoped ? 800 : 4200;
    months.forEach((m, i) => {
      const seasonality = 1 + Math.sin((i / 12) * Math.PI * 2) * 0.25;
      const noise = 0.85 + ((i * 37) % 30) / 100;
      m.gross = Math.round(seedBase * seasonality * noise * 100) / 100;
      m.net = Math.round(m.gross * (1 - DEFAULT_FEE_RATE) * 100) / 100;
    });
    lifetimeGross = months.reduce((s, m) => s + m.gross, 0);
    lifetimeNet = months.reduce((s, m) => s + m.net, 0);
  }

  const payoutsTotal = txs
    .filter((t: typeof transactionsTable.$inferSelect) => t.type === "payout")
    .reduce((s: number, t: typeof transactionsTable.$inferSelect) => s + Math.abs(Number(t.amount)), 0);

  const availableBalance = Math.max(0, lifetimeNet - payoutsTotal);
  const pendingBalance = months[months.length - 1].net;
  const currentPeriodGross = months[months.length - 1].gross;
  const previousPeriodGross = months[months.length - 2]?.gross ?? 0;

  // Streams approximation: $0.0035 per stream blend
  const currentPeriodStreams = Math.round(currentPeriodGross / 0.0035);
  const previousPeriodStreams = Math.round(previousPeriodGross / 0.0035);

  const nextStatement = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15));
  const nextPayment = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 28));

  res.json({
    availableBalance: Math.round(availableBalance * 100) / 100,
    pendingBalance: Math.round(pendingBalance * 100) / 100,
    lifetimeEarnings: Math.round(lifetimeNet * 100) / 100,
    currency: "USD",
    currentPeriodGross: Math.round(currentPeriodGross * 100) / 100,
    previousPeriodGross: Math.round(previousPeriodGross * 100) / 100,
    currentPeriodStreams,
    previousPeriodStreams,
    nextPaymentDate: nextPayment.toISOString(),
    nextStatementDate: nextStatement.toISOString(),
    minimumPayout: MIN_PAYOUT,
    timeline: months.map((m) => ({
      period: m.period,
      gross: Math.round(m.gross * 100) / 100,
      net: Math.round(m.net * 100) / 100,
    })),
  });
});

// ─── Statements ───────────────────────────────────────────────────────────
router.get("/royalties/statements", async (req, res): Promise<void> => {
  const f = entityFilter(req);
  if (!f.ok) { res.status(400).json({ error: f.error }); return; }
  const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
  if (req.query.year !== undefined && !Number.isFinite(year!)) { res.status(400).json({ error: "Invalid year" }); return; }
  const where = f.conditions.length > 0 ? and(...f.conditions) : undefined;
  const isScoped = f.conditions.length > 0;
  const txs = await db.select().from(transactionsTable).where(where);

  // Build map period → {gross, streams}
  const map = new Map<string, { gross: number; streams: number }>();
  for (const t of txs) {
    if (t.type === "payout") continue;
    const period = t.period && /^\d{4}-\d{2}$/.test(t.period) ? t.period : fmt(t.createdAt);
    const cur = map.get(period) ?? { gross: 0, streams: 0 };
    const amt = Number(t.amount);
    cur.gross += amt;
    cur.streams += Math.round(amt / 0.0035);
    map.set(period, cur);
  }

  // Generate the last 12 months always (so the table is never empty on a fresh DB)
  const now = new Date();
  const periods: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    periods.push(fmt(d));
  }
  const seedBase = isScoped ? 800 : 4200;

  const out = periods
    .filter((p) => !year || p.startsWith(String(year)))
    .map((period, i) => {
      let g = map.get(period)?.gross ?? 0;
      let s = map.get(period)?.streams ?? 0;
      if (g === 0 && ALLOW_SEED) {
        const seasonality = 1 + Math.sin(((11 - i) / 12) * Math.PI * 2) * 0.25;
        const noise = 0.85 + ((i * 17) % 30) / 100;
        g = Math.round(seedBase * seasonality * noise * 100) / 100;
        s = Math.round(g / 0.0035);
      }
      const fees = Math.round(g * DEFAULT_FEE_RATE * 100) / 100;
      const net = Math.round((g - fees) * 100) / 100;
      const ageMonths = i;
      const status = ageMonths === 0 ? "draft" : ageMonths < 3 ? "finalized" : "paid";
      return {
        id: parseInt(period.replace("-", ""), 10),
        period,
        periodLabel: periodLabel(period),
        gross: Math.round(g * 100) / 100,
        fees,
        net,
        currency: "USD",
        streams: s,
        status,
        publishedAt: ageMonths === 0 ? null : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 5)).toISOString(),
        pdfUrl: `/api/royalties/statements/${period}/download?format=pdf`,
        csvUrl: `/api/royalties/statements/${period}/download?format=csv`,
      };
    });

  res.json(out);
});

// ─── Statement download (mock CSV; PDF returns plain-text placeholder) ───
router.get("/royalties/statements/:period/download", async (req, res): Promise<void> => {
  const period = req.params.period;
  const format = (req.query.format as string) || "csv";
  if (!/^\d{4}-\d{2}$/.test(period)) {
    res.status(400).json({ error: "Invalid period" });
    return;
  }
  if (format === "csv") {
    const rows = [
      ["DSP", "Streams", "Gross USD", "Fees USD", "Net USD"],
      ["Spotify", "184,200", "644.70", "96.70", "548.00"],
      ["Apple Music", "92,140", "414.63", "62.19", "352.44"],
      ["YouTube Music", "120,420", "240.84", "36.13", "204.71"],
      ["Yandex Music", "212,800", "212.80", "31.92", "180.88"],
      ["VK Music", "84,600", "84.60", "12.69", "71.91"],
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="statement_${period}.csv"`);
    res.send(rows.map((r) => r.join(",")).join("\n"));
    return;
  }
  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="statement_${period}.pdf"`);
    // Minimal placeholder PDF (text-only). In production, render real PDF.
    const body = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 88>>stream\nBT /F1 18 Tf 80 720 Td (Tajik Music — Royalty Statement ${period}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f\ntrailer<</Size 6/Root 1 0 R>>\n%%EOF`;
    res.send(Buffer.from(body, "utf-8"));
    return;
  }
  res.status(400).json({ error: "Unknown format" });
});

// ─── Earnings by Release ──────────────────────────────────────────────────
router.get("/royalties/by-release", async (req, res): Promise<void> => {
  const f = entityFilter(req);
  if (!f.ok) { res.status(400).json({ error: f.error }); return; }

  const releaseConds: any[] = [];
  if (f.type === "artist" && f.id) releaseConds.push(eq(releasesTable.artistId, f.id));
  else if (f.type === "label" && f.id) releaseConds.push(eq(releasesTable.labelId, f.id));

  const releases = await db.select().from(releasesTable).where(releaseConds.length > 0 ? and(...releaseConds) : undefined);
  if (releases.length === 0) {
    res.json([]);
    return;
  }

  const releaseIds = releases.map((r: typeof releasesTable.$inferSelect) => r.id);
  const txs = await db
    .select({ releaseId: transactionsTable.releaseId, amount: transactionsTable.amount, type: transactionsTable.type })
    .from(transactionsTable)
    .where(inArray(transactionsTable.releaseId, releaseIds));

  const sums = new Map<number, number>();
  for (const tx of txs) {
    if (tx.type === "payout" || tx.releaseId == null) continue;
    sums.set(tx.releaseId, (sums.get(tx.releaseId) ?? 0) + Number(tx.amount));
  }

  // Hydrate artist/label names in batch
  const artistIds = Array.from(new Set(releases.map((r: typeof releasesTable.$inferSelect) => r.artistId).filter(Boolean)));
  const artistRows = artistIds.length > 0
    ? await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable).where(inArray(artistsTable.id, artistIds))
    : [];
  const artistMap = new Map(artistRows.map((a: { id: number; name: string }) => [a.id, a.name]));

  const out = releases.map((r: typeof releasesTable.$inferSelect, i: number) => {
    let gross = sums.get(r.id) ?? 0;
    if (gross === 0 && ALLOW_SEED) {
      // Seed deterministic placeholder so the table isn't empty on a fresh DB (DEV ONLY)
      gross = Math.round((300 + ((r.id * 113) % 1500)) * 100) / 100;
    }
    const net = Math.round(gross * (1 - DEFAULT_FEE_RATE) * 100) / 100;
    const streams = Math.round(gross / 0.0035);
    const trend = ((r.id * 7 + i * 11) % 41) - 20;
    return {
      releaseId: r.id,
      title: r.title,
      artistName: artistMap.get(r.artistId) ?? "Unknown",
      coverUrl: r.coverUrl ?? null,
      upc: r.upc ?? null,
      streams,
      gross: Math.round(gross * 100) / 100,
      net,
      currency: "USD",
      trend,
    };
  }).sort((a: { gross: number }, b: { gross: number }) => b.gross - a.gross);

  res.json(out);
});

// ─── Earnings by DSP ──────────────────────────────────────────────────────
router.get("/royalties/by-dsp", async (req, res): Promise<void> => {
  const f = entityFilter(req);
  if (!f.ok) { res.status(400).json({ error: f.error }); return; }
  const where = f.conditions.length > 0 ? and(...f.conditions) : undefined;
  const isScoped = f.conditions.length > 0;
  const rows = await db
    .select({ platform: transactionsTable.platform, amount: transactionsTable.amount, type: transactionsTable.type })
    .from(transactionsTable)
    .where(where);

  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.type === "payout" || !r.platform) continue;
    map.set(r.platform, (map.get(r.platform) ?? 0) + Number(r.amount));
  }

  const SEED_DSPS: { dsp: string; share: number; trend: number }[] = [
    { dsp: "Spotify",       share: 0.34, trend:  8 },
    { dsp: "Apple Music",   share: 0.21, trend:  3 },
    { dsp: "YouTube Music", share: 0.14, trend: 12 },
    { dsp: "Yandex Music",  share: 0.12, trend: -2 },
    { dsp: "VK Music",      share: 0.07, trend:  5 },
    { dsp: "TikTok",        share: 0.06, trend: 22 },
    { dsp: "Boom",          share: 0.03, trend:  1 },
    { dsp: "Tidal",         share: 0.02, trend: -4 },
    { dsp: "Amazon Music",  share: 0.01, trend:  0 },
  ];

  const totalReal = Array.from(map.values()).reduce((s: number, v: number) => s + v, 0);
  let total = totalReal;
  const useSeed = totalReal === 0 && ALLOW_SEED;
  if (useSeed) {
    total = isScoped ? 9600 : 48200;
  }

  const out = SEED_DSPS.map((s) => {
    const gross = useSeed
      ? total * s.share
      : (map.get(s.dsp) ?? 0);
    const net = gross * (1 - DEFAULT_FEE_RATE);
    return {
      dsp: s.dsp,
      streams: Math.round(gross / 0.0035),
      gross: Math.round(gross * 100) / 100,
      net: Math.round(net * 100) / 100,
      currency: "USD",
      share: total > 0 ? Math.round((gross / total) * 1000) / 10 : 0,
      trend: s.trend,
    };
  }).filter((r) => r.gross > 0)
    .sort((a, b) => b.gross - a.gross);

  res.json(out);
});

export default router;
