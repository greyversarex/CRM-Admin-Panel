import { parse } from "csv-parse/sync";
import type { ParsedRow, ParseResult } from "./types";
import { normIsrc, normCountry, parseInteger, parseNumber, normPeriod, dominantValue, MAX_PARSED_ROWS, TooManyRowsError } from "./utils";

// Spotify Distribution Statement (CSV).
// Реальные хедеры могут отличаться (Spotify меняет их по версиям)
// поэтому ищем по нескольким вариантам.
const COL_ISRC = ["ISRC", "Isrc", "isrc"];
const COL_TITLE = ["Track Title", "Track", "Title", "Song Title"];
const COL_ARTIST = ["Artist Name", "Artist", "Track Artist"];
const COL_STREAMS = ["Streams", "Quantity", "Stream Count", "Plays"];
const COL_REVENUE = ["Net Revenue (USD)", "Net Revenue in USD", "Revenue", "Net Revenue", "Royalty"];
const COL_CURRENCY = ["Currency", "Reporting Currency", "Royalty Currency"];
const COL_COUNTRY = ["Country", "Territory", "Country Code", "Country of Sale"];
const COL_PERIOD = ["Reporting Period", "Period", "Sales Month", "Reporting Month"];

function pick(row: Record<string, string>, candidates: string[]): string | undefined {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== "") return row[c];
  }
  return undefined;
}

export function parseSpotify(buffer: Buffer): ParseResult {
  const records = parse(buffer, {
    columns: true,
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

    rows.push({
      isrc,
      title: pick(r, COL_TITLE) ?? null,
      artist: pick(r, COL_ARTIST) ?? null,
      countryCode: normCountry(pick(r, COL_COUNTRY)),
      streams,
      revenue,
      currency: (pick(r, COL_CURRENCY) ?? "USD").toUpperCase(),
      period: normPeriod(pick(r, COL_PERIOD)) ?? "",
      raw: r,
    });
  }

  const detectedPeriod = dominantValue(rows, (x) => x.period || null);
  const detectedCurrency = dominantValue(rows, (x) => x.currency);
  if (!detectedPeriod) warnings.push("Spotify CSV: Period column not found — provide period manually.");

  return { rows, invalidRows, warnings, detectedPeriod, detectedCurrency };
}
