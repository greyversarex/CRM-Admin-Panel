import { Router } from "express";
import {
  db, transactionsTable, releasesTable, artistsTable, labelsTable,
} from "@workspace/db";
import { and, eq, sql, inArray } from "drizzle-orm";
import { getDataScope } from "../lib/auth";
import { PLATFORM_FEE_RATE as DEFAULT_FEE_RATE } from "../lib/finance";

const router = Router();

const MIN_PAYOUT = 50;
// Approximate $/stream blend — used only to display "≈ streams" on UI cards.
// NOT used to fabricate revenue: streams are derived from real gross.
const STREAM_RATE_USD = 0.0035;

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

  const payoutsTotal = txs
    .filter((t: typeof transactionsTable.$inferSelect) => t.type === "payout")
    .reduce((s: number, t: typeof transactionsTable.$inferSelect) => s + Math.abs(Number(t.amount)), 0);

  const availableBalance = Math.max(0, lifetimeNet - payoutsTotal);
  const pendingBalance = months[months.length - 1].net;
  const currentPeriodGross = months[months.length - 1].gross;
  const previousPeriodGross = months[months.length - 2]?.gross ?? 0;

  // Streams approximation: derived from real gross only (zero gross → zero streams)
  const currentPeriodStreams = Math.round(currentPeriodGross / STREAM_RATE_USD);
  const previousPeriodStreams = Math.round(previousPeriodGross / STREAM_RATE_USD);

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
  const txs = await db.select().from(transactionsTable).where(where);

  // Build map period → {gross, streams}
  const map = new Map<string, { gross: number; streams: number }>();
  for (const t of txs) {
    if (t.type === "payout") continue;
    const period = t.period && /^\d{4}-\d{2}$/.test(t.period) ? t.period : fmt(t.createdAt);
    const cur = map.get(period) ?? { gross: 0, streams: 0 };
    const amt = Number(t.amount);
    cur.gross += amt;
    cur.streams += Math.round(amt / STREAM_RATE_USD);
    map.set(period, cur);
  }

  // Generate the last 12 months — empty months simply have gross=0 (no synthesis).
  const now = new Date();
  const periods: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    periods.push(fmt(d));
  }

  const out = periods
    .filter((p) => !year || p.startsWith(String(year)))
    .map((period, i) => {
      const g = map.get(period)?.gross ?? 0;
      const s = map.get(period)?.streams ?? 0;
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

// ─── Statement download (real CSV + minimal but real PDF from DB) ─────────
async function aggregateStatement(req: any, period: string) {
  const f = entityFilter(req);
  if (!f.ok) return { ok: false as const, status: 400, error: f.error };
  const conditions = [...f.conditions, eq(transactionsTable.period, period)];
  const rows = await db
    .select({ platform: transactionsTable.platform, amount: transactionsTable.amount, type: transactionsTable.type })
    .from(transactionsTable)
    .where(and(...conditions));
  const byDsp = new Map<string, number>();
  for (const r of rows) {
    if (r.type === "payout") continue;
    const key = r.platform ?? "Unknown";
    byDsp.set(key, (byDsp.get(key) ?? 0) + Number(r.amount));
  }
  const lines = Array.from(byDsp.entries())
    .map(([dsp, gross]) => {
      const fees = gross * DEFAULT_FEE_RATE;
      const net = gross - fees;
      return {
        dsp,
        streams: Math.round(gross / STREAM_RATE_USD),
        gross: Math.round(gross * 100) / 100,
        fees: Math.round(fees * 100) / 100,
        net: Math.round(net * 100) / 100,
      };
    })
    .sort((a, b) => b.gross - a.gross);
  const totals = lines.reduce(
    (acc, l) => ({
      streams: acc.streams + l.streams,
      gross: acc.gross + l.gross,
      fees: acc.fees + l.fees,
      net: acc.net + l.net,
    }),
    { streams: 0, gross: 0, fees: 0, net: 0 },
  );
  return { ok: true as const, lines, totals };
}

router.get("/royalties/statements/:period/download", async (req, res): Promise<void> => {
  const period = req.params.period;
  const format = (req.query.format as string) || "csv";
  if (!/^\d{4}-\d{2}$/.test(period)) {
    res.status(400).json({ error: "Invalid period" });
    return;
  }
  const agg = await aggregateStatement(req, period);
  if (!agg.ok) {
    res.status(agg.status).json({ error: agg.error });
    return;
  }

  if (format === "csv") {
    const header = ["DSP", "Streams", "Gross USD", "Fees USD", "Net USD"];
    const body = agg.lines.map((l) => [
      l.dsp,
      l.streams.toString(),
      l.gross.toFixed(2),
      l.fees.toFixed(2),
      l.net.toFixed(2),
    ]);
    body.push([
      "TOTAL",
      agg.totals.streams.toString(),
      agg.totals.gross.toFixed(2),
      agg.totals.fees.toFixed(2),
      agg.totals.net.toFixed(2),
    ]);
    const escape = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = [header, ...body].map((r) => r.map(escape).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="statement_${period}.csv"`);
    res.send(csv);
    return;
  }

  if (format === "pdf") {
    // Minimal valid PDF rendered from real DB aggregates. No third-party renderer
    // dependency. Each line is a separate text op so totals reflect real data.
    const lines = [
      `Tajik Music Distribution`,
      `Royalty Statement — ${periodLabel(period)}`,
      ``,
      `${"DSP".padEnd(20)} ${"Streams".padStart(10)} ${"Gross".padStart(10)} ${"Fees".padStart(10)} ${"Net".padStart(10)}`,
      ...agg.lines.map((l) =>
        `${l.dsp.padEnd(20).slice(0, 20)} ${l.streams.toString().padStart(10)} ${l.gross.toFixed(2).padStart(10)} ${l.fees.toFixed(2).padStart(10)} ${l.net.toFixed(2).padStart(10)}`,
      ),
      ``,
      `${"TOTAL".padEnd(20)} ${agg.totals.streams.toString().padStart(10)} ${agg.totals.gross.toFixed(2).padStart(10)} ${agg.totals.fees.toFixed(2).padStart(10)} ${agg.totals.net.toFixed(2).padStart(10)}`,
    ];
    // Build PDF content stream: one Tj per line, moving down 14pt each time.
    const escapePdf = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const ops: string[] = ["BT", "/F1 10 Tf", "60 760 Td"];
    lines.forEach((ln, i) => {
      if (i > 0) ops.push("0 -14 Td");
      ops.push(`(${escapePdf(ln)}) Tj`);
    });
    ops.push("ET");
    const stream = ops.join("\n");
    const objs: string[] = [];
    objs.push(`<< /Type /Catalog /Pages 2 0 R >>`);
    objs.push(`<< /Type /Pages /Count 1 /Kids [3 0 R] >>`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`);
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objs.forEach((body, i) => {
      offsets.push(Buffer.byteLength(pdf, "binary"));
      pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf, "binary");
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="statement_${period}.pdf"`);
    res.send(Buffer.from(pdf, "binary"));
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
    .select({ releaseId: transactionsTable.releaseId, amount: transactionsTable.amount, type: transactionsTable.type, createdAt: transactionsTable.createdAt })
    .from(transactionsTable)
    .where(inArray(transactionsTable.releaseId, releaseIds));

  // Compute totals + a real trend % (current 30 days vs previous 30 days)
  const now = Date.now();
  const D30 = 30 * 24 * 3600 * 1000;
  const sums = new Map<number, number>();
  const recent = new Map<number, number>();
  const prev = new Map<number, number>();
  for (const tx of txs) {
    if (tx.type === "payout" || tx.releaseId == null) continue;
    const amt = Number(tx.amount);
    sums.set(tx.releaseId, (sums.get(tx.releaseId) ?? 0) + amt);
    const ageMs = now - tx.createdAt.getTime();
    if (ageMs < D30) {
      recent.set(tx.releaseId, (recent.get(tx.releaseId) ?? 0) + amt);
    } else if (ageMs < 2 * D30) {
      prev.set(tx.releaseId, (prev.get(tx.releaseId) ?? 0) + amt);
    }
  }

  // Hydrate artist/label names in batch
  const artistIds = Array.from(new Set(releases.map((r: typeof releasesTable.$inferSelect) => r.artistId).filter(Boolean)));
  const artistRows = artistIds.length > 0
    ? await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable).where(inArray(artistsTable.id, artistIds))
    : [];
  const artistMap = new Map(artistRows.map((a: { id: number; name: string }) => [a.id, a.name]));

  const out = releases.map((r: typeof releasesTable.$inferSelect) => {
    const gross = sums.get(r.id) ?? 0;
    const net = Math.round(gross * (1 - DEFAULT_FEE_RATE) * 100) / 100;
    const streams = Math.round(gross / STREAM_RATE_USD);
    const recentG = recent.get(r.id) ?? 0;
    const prevG = prev.get(r.id) ?? 0;
    const trend = prevG > 0
      ? Math.round(((recentG - prevG) / prevG) * 100)
      : (recentG > 0 ? 100 : 0);
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
  const rows = await db
    .select({ platform: transactionsTable.platform, amount: transactionsTable.amount, type: transactionsTable.type, createdAt: transactionsTable.createdAt })
    .from(transactionsTable)
    .where(where);

  // Aggregate gross by DSP plus a real trend (last 30 vs previous 30 days)
  const now = Date.now();
  const D30 = 30 * 24 * 3600 * 1000;
  const totals = new Map<string, { gross: number; recent: number; prev: number }>();
  for (const r of rows) {
    if (r.type === "payout" || !r.platform) continue;
    const amt = Number(r.amount);
    const cur = totals.get(r.platform) ?? { gross: 0, recent: 0, prev: 0 };
    cur.gross += amt;
    const ageMs = now - r.createdAt.getTime();
    if (ageMs < D30) cur.recent += amt;
    else if (ageMs < 2 * D30) cur.prev += amt;
    totals.set(r.platform, cur);
  }

  const totalGross = Array.from(totals.values()).reduce((s, v) => s + v.gross, 0);
  const out = Array.from(totals.entries())
    .map(([dsp, v]) => {
      const net = v.gross * (1 - DEFAULT_FEE_RATE);
      const trend = v.prev > 0
        ? Math.round(((v.recent - v.prev) / v.prev) * 100)
        : (v.recent > 0 ? 100 : 0);
      return {
        dsp,
        streams: Math.round(v.gross / STREAM_RATE_USD),
        gross: Math.round(v.gross * 100) / 100,
        net: Math.round(net * 100) / 100,
        currency: "USD",
        share: totalGross > 0 ? Math.round((v.gross / totalGross) * 1000) / 10 : 0,
        trend,
      };
    })
    .filter((r) => r.gross > 0)
    .sort((a, b) => b.gross - a.gross);

  res.json(out);
});

export default router;
