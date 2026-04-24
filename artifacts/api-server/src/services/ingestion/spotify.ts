import type { ParsedRow, ParseResult } from "./types";
import { normIsrc, normCountry, parseInteger, parseNumber, normPeriod, dominantValue } from "./utils";
import { streamCsvRecords } from "./streaming";

// Spotify Distribution Statement (CSV).
// Реальные хедеры могут отличаться (Spotify меняет их по версиям) — ищем
// по нескольким вариантам.
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

export async function parseSpotify(filePath: string): Promise<ParseResult> {
  const records = await streamCsvRecords(filePath);

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
