import { parse } from "csv-parse/sync";
import type { ParsedRow, ParseResult } from "./types";
import { normIsrc, normCountry, parseInteger, parseNumber, normPeriod, dominantValue, MAX_PARSED_ROWS, TooManyRowsError } from "./utils";

// iTunes/Apple Music Sales Report — TSV или CSV. У Apple исторически TSV
// (\t-разделитель), но мы пытаемся auto-detect по первой строке.
const COL_ISRC = ["ISRC", "Isrc"];
const COL_TITLE = ["Title", "Item Title", "Song Title"];
const COL_ARTIST = ["Artist / Show", "Artist", "Track Artist"];
const COL_STREAMS = ["Quantity", "Units", "Streams"];
const COL_REVENUE = ["Partner Share", "Royalty", "Revenue", "Customer Price"];
const COL_CURRENCY = ["Partner Share Currency", "Customer Currency", "Royalty Currency", "Currency"];
const COL_COUNTRY = ["Country Code", "Country Of Sale", "Country"];
const COL_PERIOD = ["Begin Date", "Sales Date", "Provider Country", "Report Period"];

function pick(row: Record<string, string>, candidates: string[]): string | undefined {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== "") return row[c];
  }
  return undefined;
}

export function parseApple(buffer: Buffer): ParseResult {
  // Auto-detect разделителя по первой строке.
  const firstLine = buffer.toString("utf8").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  const records = parse(buffer, {
    columns: true,
    delimiter,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, string>[];
  if (records.length > MAX_PARSED_ROWS) throw new TooManyRowsError(records.length);

  const rows: ParsedRow[] = [];
  let invalidRows = 0;
  const warnings: string[] = [];

  for (const r of records) {
    const isrc = normIsrc(pick(r, COL_ISRC));
    const streams = parseInteger(pick(r, COL_STREAMS));
    const revenue = parseNumber(pick(r, COL_REVENUE));
    if (!isrc && streams === 0 && revenue === 0) { invalidRows++; continue; }

    // Apple даёт период как Begin Date 03/01/2026 → нормализуем в YYYY-MM.
    const rawPeriod = pick(r, COL_PERIOD);
    const period = normPeriod(rawPeriod) ?? (rawPeriod ? normPeriod(rawPeriod.slice(-7)) : null) ?? "";

    rows.push({
      isrc,
      title: pick(r, COL_TITLE) ?? null,
      artist: pick(r, COL_ARTIST) ?? null,
      countryCode: normCountry(pick(r, COL_COUNTRY)),
      streams,
      revenue,
      currency: (pick(r, COL_CURRENCY) ?? "USD").toUpperCase(),
      period,
      raw: r,
    });
  }

  const detectedPeriod = dominantValue(rows, (x) => x.period || null);
  const detectedCurrency = dominantValue(rows, (x) => x.currency);
  if (!detectedPeriod) warnings.push("Apple report: period not detected — provide manually.");

  return { rows, invalidRows, warnings, detectedPeriod, detectedCurrency };
}
