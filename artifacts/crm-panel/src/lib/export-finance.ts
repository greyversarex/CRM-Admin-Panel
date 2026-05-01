export type ExportFormat = "xlsx" | "csv";

function buildQs(params: Record<string, string | number | undefined>): string {
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return pairs.length > 0 ? "?" + pairs.join("&") : "";
}

function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.click();
}

export function exportTransactions(params: {
  format: ExportFormat;
  artist_id?: number;
  label_id?: number;
  type?: string;
  period?: string;
}) {
  const qs = buildQs({
    format: params.format,
    artist_id: params.artist_id,
    label_id: params.label_id,
    type: params.type,
    period: params.period,
  });
  triggerDownload(`/api/finance/transactions/export${qs}`);
}

export function exportPayouts(params: {
  format: ExportFormat;
  artist_id?: number;
  label_id?: number;
  status?: string;
  from?: string;
  to?: string;
}) {
  const qs = buildQs({
    format: params.format,
    artist_id: params.artist_id,
    label_id: params.label_id,
    status: params.status,
    from: params.from,
    to: params.to,
  });
  triggerDownload(`/api/finance/payouts/export${qs}`);
}
