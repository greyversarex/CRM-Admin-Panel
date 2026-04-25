import { listPayouts } from "@workspace/api-client-react";

export type PayoutsExportProgress = {
  loaded: number;
  total: number | null;
};

export type PayoutsExportFilter = {
  artist_id?: number;
  label_id?: number;
  status?: "pending" | "approved" | "rejected";
  fromDate?: string; // YYYY-MM-DD inclusive (compared to createdAt)
  toDate?: string; // YYYY-MM-DD inclusive
};

const CSV_COLUMNS = [
  "payout_id",
  "status",
  "amount",
  "currency",
  "method",
  "artist_id",
  "artist_name",
  "label_id",
  "label_name",
  "payment_details",
  "rejection_reason",
  "requested_at",
  "processed_at",
  "updated_at",
] as const;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "boolean") s = v ? "true" : "false";
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: Record<string, unknown>[]): string {
  const header = CSV_COLUMNS.join(",");
  const body = rows
    .map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(","))
    .join("\n");
  return header + "\n" + body + "\n";
}

async function fetchAllPayouts(
  filter: PayoutsExportFilter,
  onProgress?: (p: PayoutsExportProgress) => void,
): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  const limit = 200;
  let total: number | null = null;
  const maxPages = 500;
  const baseParams: any = {};
  if (filter.artist_id) baseParams.artist_id = filter.artist_id;
  if (filter.label_id) baseParams.label_id = filter.label_id;
  if (filter.status) baseParams.status = filter.status;

  while (page <= maxPages) {
    const res: any = await listPayouts({ ...baseParams, page, limit });
    const items: any[] = res?.data ?? [];
    total = res?.pagination?.total ?? total;
    all.push(...items);
    onProgress?.({ loaded: all.length, total });
    const totalPages: number | undefined = res?.pagination?.totalPages;
    if (items.length === 0) break;
    if (totalPages && page >= totalPages) break;
    if (items.length < limit) break;
    page++;
  }
  return all;
}

function inDateRange(iso: string | null | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const d = iso.slice(0, 10); // YYYY-MM-DD
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export async function exportPayoutsCsv(
  filter: PayoutsExportFilter,
  onProgress?: (p: PayoutsExportProgress) => void,
): Promise<{ count: number; totalAmountByCurrency: Record<string, number> }> {
  const payouts = await fetchAllPayouts(filter, onProgress);
  const filtered = payouts.filter((p) =>
    inDateRange(p.createdAt, filter.fromDate, filter.toDate),
  );

  const rows = filtered.map((p) => ({
    payout_id: p.id,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    method: p.method,
    artist_id: p.artistId ?? "",
    artist_name: p.artistName ?? "",
    label_id: p.labelId ?? "",
    label_name: p.labelName ?? "",
    payment_details: p.paymentDetails ?? "",
    rejection_reason: p.rejectionReason ?? "",
    requested_at: p.createdAt ?? "",
    processed_at: p.processedAt ?? "",
    updated_at: p.updatedAt ?? "",
  }));

  const csv = buildCsv(rows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const range =
    filter.fromDate || filter.toDate
      ? `_${filter.fromDate ?? "start"}_${filter.toDate ?? "end"}`
      : "";
  a.href = url;
  a.download = `payouts${range}-${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  const totalAmountByCurrency: Record<string, number> = {};
  for (const p of filtered) {
    const cur = String(p.currency ?? "").toUpperCase() || "—";
    const amt = Number(p.amount) || 0;
    totalAmountByCurrency[cur] = (totalAmountByCurrency[cur] ?? 0) + amt;
  }

  return { count: filtered.length, totalAmountByCurrency };
}
