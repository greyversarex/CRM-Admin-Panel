import type { ParsedRow, ParseResult } from "./types";
import { normIsrc, normCountry, parseInteger, parseNumber, normPeriod, dominantValue } from "./utils";
import { streamCsvRecords } from "./streaming";

// YouTube Music Analytics Report — обычно CSV. ISRC в колонке "Asset ISRC"
// или "ISRC".
const COL_ISRC = ["Asset ISRC", "ISRC", "Track ISRC"];
const COL_TITLE = ["Track Name", "Asset Title", "Video Title", "Title"];
const COL_ARTIST = ["Artist Name", "Artist", "Channel Name"];
const COL_STREAMS = ["Estimated Streams", "Streams", "Views", "Estimated Music Video Views"];
const COL_REVENUE = ["Estimated Partner Revenue", "Partner Revenue", "Revenue", "Estimated Revenue"];
const COL_CURRENCY = ["Currency", "Revenue Currency"];
const COL_COUNTRY = ["Country Code", "Country", "Territory"];
const COL_PERIOD = ["Month", "Reporting Period", "Date", "Period"];

function pick(row: Record<string, string>, candidates: string[]): string | undefined {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== "") return row[c];
  }
  return undefined;
}

export async function parseYouTube(filePath: string): Promise<ParseResult> {
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
  if (!detectedPeriod) warnings.push("YouTube report: period not detected — provide manually.");

  return { rows, invalidRows, warnings, detectedPeriod, detectedCurrency };
}
