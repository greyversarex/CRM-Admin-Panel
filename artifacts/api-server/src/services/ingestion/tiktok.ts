import { parse } from "csv-parse/sync";
import type { ParsedRow, ParseResult } from "./types";
import { normIsrc, normCountry, parseInteger, parseNumber, normPeriod, dominantValue, MAX_PARSED_ROWS, TooManyRowsError } from "./utils";

// TikTok Sound Performance Report — CSV. Из всех 4 DSP — самый «не-стандартный»:
// колонок мало, иногда нет per-country разбивки.
const COL_ISRC = ["ISRC", "Sound ISRC", "Track ISRC"];
const COL_TITLE = ["Sound Title", "Track Title", "Sound Name", "Title"];
const COL_ARTIST = ["Sound Artist", "Artist", "Track Artist"];
const COL_STREAMS = ["Total Views", "Views", "Plays", "Sound Plays"];
const COL_REVENUE = ["Estimated Revenue", "Revenue", "Royalty", "Estimated Earnings"];
const COL_CURRENCY = ["Currency", "Revenue Currency"];
const COL_COUNTRY = ["Country", "Country Code", "Region"];
const COL_PERIOD = ["Period", "Reporting Month", "Month", "Date"];

function pick(row: Record<string, string>, candidates: string[]): string | undefined {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== "") return row[c];
  }
  return undefined;
}

export function parseTikTok(buffer: Buffer): ParseResult {
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
  if (!detectedPeriod) warnings.push("TikTok report: period not detected — provide manually.");

  return { rows, invalidRows, warnings, detectedPeriod, detectedCurrency };
}
