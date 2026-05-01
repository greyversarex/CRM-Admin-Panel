/**
 * Finance Export — server-side Excel / CSV generation
 *
 * GET /api/finance/transactions/export?format=xlsx|csv&artist_id=&label_id=&type=&period=
 * GET /api/finance/payouts/export?format=xlsx|csv&artist_id=&label_id=&status=&from=&to=
 *
 * Формат по умолчанию — xlsx. Доступ: те же права, что и у соответствующих LIST-эндпоинтов.
 */
import { Router } from "express";
import * as XLSX from "xlsx";
import { db, transactionsTable, payoutsTable, artistsTable, labelsTable } from "@workspace/db";
import { desc, and, eq, inArray, gte, lte } from "drizzle-orm";
import { getDataScope } from "../lib/auth";

const router = Router();

function scopeFilter(
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
    if (qLabel !== undefined) conditions.push(eq(labelCol, qLabel));
    return conditions;
  }
  if (scope.role === "artist") {
    if (scope.artistId == null) return null;
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

function sendFile(res: any, buf: Buffer, filename: string, format: string) {
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  } else {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  }
}

function buildBuffer(rows: Record<string, unknown>[], sheetName: string, format: string): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const fileType = format === "csv" ? "csv" : "xlsx";
  const buf = XLSX.write(wb, { type: "buffer", bookType: fileType as any });
  return buf;
}

function ts(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ── Transactions export ──────────────────────────────────────────────────────
router.get("/finance/transactions/export", async (req, res): Promise<void> => {
  const format = (req.query.format as string ?? "xlsx").toLowerCase();
  if (format !== "xlsx" && format !== "csv") {
    res.status(400).json({ error: "format must be xlsx or csv" });
    return;
  }

  const scoped = scopeFilter(req, transactionsTable.artistId, transactionsTable.labelId);
  if (scoped === null) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const filters: any[] = [...scoped];
  if (req.query.type !== undefined) {
    filters.push(eq(transactionsTable.type, req.query.type as string));
  }
  if (req.query.period !== undefined) {
    filters.push(eq(transactionsTable.period, req.query.period as string));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const transactions = await db
    .select()
    .from(transactionsTable)
    .where(where)
    .orderBy(desc(transactionsTable.createdAt))
    .limit(10000);

  const artistIds = [...new Set(transactions.map(t => t.artistId).filter(Boolean))] as number[];
  const labelIds  = [...new Set(transactions.map(t => t.labelId).filter(Boolean))]  as number[];

  const artists = artistIds.length > 0
    ? await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable).where(inArray(artistsTable.id, artistIds))
    : [];
  const labels = labelIds.length > 0
    ? await db.select({ id: labelsTable.id, name: labelsTable.name }).from(labelsTable).where(inArray(labelsTable.id, labelIds))
    : [];
  const artistMap = new Map(artists.map(a => [a.id, a.name]));
  const labelMap  = new Map(labels.map(l => [l.id, l.name]));

  const rows = transactions.map(t => ({
    ID: t.id,
    Date: t.createdAt.toISOString().slice(0, 10),
    Type: t.type,
    Artist: t.artistId ? (artistMap.get(t.artistId) ?? t.artistId) : "",
    Label: t.labelId ? (labelMap.get(t.labelId) ?? t.labelId) : "",
    Platform: t.platform ?? "",
    Description: t.description ?? "",
    Period: t.period ?? "",
    Amount: parseFloat(t.amount),
    Currency: t.currency,
  }));

  const buf = buildBuffer(rows, "Transactions", format);
  sendFile(res, buf, `transactions_${ts()}.${format}`, format);
});

// ── Payouts export ───────────────────────────────────────────────────────────
router.get("/finance/payouts/export", async (req, res): Promise<void> => {
  const format = (req.query.format as string ?? "xlsx").toLowerCase();
  if (format !== "xlsx" && format !== "csv") {
    res.status(400).json({ error: "format must be xlsx or csv" });
    return;
  }

  const scoped = scopeFilter(req, payoutsTable.artistId, payoutsTable.labelId);
  if (scoped === null) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const filters: any[] = [...scoped];
  if (req.query.status !== undefined) {
    filters.push(eq(payoutsTable.status, req.query.status as string));
  }
  if (req.query.from !== undefined) {
    const d = new Date(req.query.from as string);
    if (!isNaN(d.getTime())) filters.push(gte(payoutsTable.createdAt, d));
  }
  if (req.query.to !== undefined) {
    const d = new Date(req.query.to as string + "T23:59:59Z");
    if (!isNaN(d.getTime())) filters.push(lte(payoutsTable.createdAt, d));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const payouts = await db
    .select()
    .from(payoutsTable)
    .where(where)
    .orderBy(desc(payoutsTable.createdAt))
    .limit(10000);

  const artistIds = [...new Set(payouts.map(p => p.artistId).filter(Boolean))] as number[];
  const labelIds  = [...new Set(payouts.map(p => p.labelId).filter(Boolean))]  as number[];

  const artists = artistIds.length > 0
    ? await db.select({ id: artistsTable.id, name: artistsTable.name }).from(artistsTable).where(inArray(artistsTable.id, artistIds))
    : [];
  const labels = labelIds.length > 0
    ? await db.select({ id: labelsTable.id, name: labelsTable.name }).from(labelsTable).where(inArray(labelsTable.id, labelIds))
    : [];
  const artistMap = new Map(artists.map(a => [a.id, a.name]));
  const labelMap  = new Map(labels.map(l => [l.id, l.name]));

  const rows = payouts.map(p => ({
    ID: p.id,
    "Requested At": p.createdAt.toISOString().slice(0, 10),
    Status: p.status,
    Artist: p.artistId ? (artistMap.get(p.artistId) ?? p.artistId) : "",
    Label: p.labelId ? (labelMap.get(p.labelId) ?? p.labelId) : "",
    Amount: parseFloat(p.amount),
    Currency: p.currency,
    Method: p.method ?? "",
    "Payment Details": typeof p.paymentDetails === "object" ? JSON.stringify(p.paymentDetails) : (p.paymentDetails ?? ""),
    "Rejection Reason": p.rejectionReason ?? "",
    "Processed At": p.processedAt ? p.processedAt.toISOString().slice(0, 10) : "",
    "Two-step Required": p.twoStepRequired ? "Yes" : "No",
  }));

  const buf = buildBuffer(rows, "Payouts", format);
  sendFile(res, buf, `payouts_${ts()}.${format}`, format);
});

export default router;
