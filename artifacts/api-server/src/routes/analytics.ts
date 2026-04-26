import { Router } from "express";
import { db, usageReportsTable, tracksTable, artistsTable } from "@workspace/db";
import { sql, eq, gte, desc, inArray, and, between, isNotNull } from "drizzle-orm";

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function periodToDays(period: string | undefined): number {
  switch (period) {
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
    case "180d": return 180;
    case "1y": return 365;
    default: return 30;
  }
}

function startDateFor(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

const COUNTRY_NAMES: Record<string, string> = {
  TJ: "Tajikistan", RU: "Russia", UZ: "Uzbekistan", KZ: "Kazakhstan",
  DE: "Germany", US: "United States", AF: "Afghanistan", TR: "Turkey",
  GB: "United Kingdom", AE: "UAE",
};

// ─── /analytics/streams — daily breakdown ───────────────────────────────────

router.get("/analytics/streams", async (req, res): Promise<void> => {
  const period = (req.query.period as string) ?? "30d";
  const days = periodToDays(period);
  const start = startDateFor(days);

  const rows = await db
    .select({
      date: usageReportsTable.period,
      streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
      revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
    })
    .from(usageReportsTable)
    .where(gte(usageReportsTable.period, start.toISOString().split("T")[0]))
    .groupBy(usageReportsTable.period)
    .orderBy(usageReportsTable.period);

  const byDay = rows.map((r) => ({
    date: r.date,
    streams: Number(r.streams),
    revenue: parseFloat(r.revenue),
  }));
  const totalStreams = byDay.reduce((s, d) => s + d.streams, 0);
  const totalRevenue = parseFloat(byDay.reduce((s, d) => s + d.revenue, 0).toFixed(2));

  res.json({ totalStreams, totalRevenue, byDay });
});

// ─── /analytics/platforms ───────────────────────────────────────────────────

router.get("/analytics/platforms", async (req, res): Promise<void> => {
  const days = periodToDays(req.query.period as string);
  const start = startDateFor(days);

  const rows = await db
    .select({
      platform: usageReportsTable.platform,
      streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
      revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
    })
    .from(usageReportsTable)
    .where(gte(usageReportsTable.period, start.toISOString().split("T")[0]))
    .groupBy(usageReportsTable.platform)
    .orderBy(desc(sql`sum(${usageReportsTable.streams})`));

  const total = rows.reduce((s, r) => s + Number(r.streams), 0) || 1;
  const result = rows.map((r) => {
    const streams = Number(r.streams);
    return {
      platform: r.platform,
      streams,
      revenue: parseFloat(parseFloat(r.revenue).toFixed(2)),
      percentage: parseFloat(((streams / total) * 100).toFixed(1)),
    };
  });
  res.json(result);
});

// ─── /analytics/geography ───────────────────────────────────────────────────

router.get("/analytics/geography", async (req, res): Promise<void> => {
  const days = periodToDays(req.query.period as string);
  const start = startDateFor(days);

  const rows = await db
    .select({
      country: usageReportsTable.countryCode,
      streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
      revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
    })
    .from(usageReportsTable)
    .where(and(
      gte(usageReportsTable.period, start.toISOString().split("T")[0]),
      isNotNull(usageReportsTable.countryCode),
    ))
    .groupBy(usageReportsTable.countryCode)
    .orderBy(desc(sql`sum(${usageReportsTable.streams})`));

  const total = rows.reduce((s, r) => s + Number(r.streams), 0) || 1;
  const result = rows
    .filter((r) => r.country)
    .map((r) => {
      const streams = Number(r.streams);
      const code = r.country!;
      return {
        country: COUNTRY_NAMES[code] ?? code,
        countryCode: code,
        streams,
        revenue: parseFloat(parseFloat(r.revenue).toFixed(2)),
        percentage: parseFloat(((streams / total) * 100).toFixed(1)),
      };
    });
  res.json(result);
});

// ─── /analytics/top-tracks ──────────────────────────────────────────────────

router.get("/analytics/top-tracks", async (req, res): Promise<void> => {
  const days = periodToDays(req.query.period as string);
  const start = startDateFor(days);
  const limit = Math.min(parseInt((req.query.limit as string) ?? "10", 10) || 10, 50);

  const startStr = start.toISOString().split("T")[0];

  const rows = await db
    .select({
      trackId: usageReportsTable.trackId,
      title: tracksTable.title,
      artist: artistsTable.name,
      streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
      revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
    })
    .from(usageReportsTable)
    .leftJoin(tracksTable, eq(tracksTable.id, usageReportsTable.trackId))
    .leftJoin(artistsTable, eq(artistsTable.id, usageReportsTable.artistId))
    .where(gte(usageReportsTable.period, startStr))
    .groupBy(usageReportsTable.trackId, tracksTable.title, artistsTable.name)
    .orderBy(desc(sql`sum(${usageReportsTable.streams})`))
    .limit(limit);

  // Resolve top platform per track in one query (window function pick rank=1).
  const trackIdsForTop = rows.map((r) => r.trackId).filter((x): x is number => x != null);
  const topPlatformMap = new Map<number, string>();
  if (trackIdsForTop.length > 0) {
    const tpRows = await db.execute<{ track_id: number; platform: string }>(sql`
      SELECT track_id, platform FROM (
        SELECT track_id, platform,
               ROW_NUMBER() OVER (PARTITION BY track_id ORDER BY SUM(streams) DESC) AS rn
        FROM ${usageReportsTable}
        WHERE track_id IN (${sql.join(trackIdsForTop.map((id) => sql`${id}`), sql`, `)})
          AND period >= ${startStr}
        GROUP BY track_id, platform
      ) ranked WHERE rn = 1
    `);
    for (const r of tpRows.rows) topPlatformMap.set(r.track_id, r.platform);
  }

  // Compute trend = % change vs prior period of same length.
  const priorStart = new Date(start);
  priorStart.setUTCDate(priorStart.getUTCDate() - days);
  const priorEnd = new Date(start);
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);

  const trackIds = rows.map((r) => r.trackId).filter((x): x is number => x != null);
  let priorMap = new Map<number, number>();
  if (trackIds.length > 0) {
    const priorRows = await db
      .select({
        trackId: usageReportsTable.trackId,
        streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
      })
      .from(usageReportsTable)
      .where(and(
        inArray(usageReportsTable.trackId, trackIds),
        between(usageReportsTable.period, priorStart.toISOString().split("T")[0], priorEnd.toISOString().split("T")[0]),
      ))
      .groupBy(usageReportsTable.trackId);
    priorMap = new Map(priorRows.map((r) => [r.trackId!, Number(r.streams)]));
  }

  const result = rows.map((r, i) => {
    const streams = Number(r.streams);
    const prior = priorMap.get(r.trackId ?? -1) ?? 0;
    const trend = prior > 0 ? parseFloat((((streams - prior) / prior) * 100).toFixed(1)) : 0;
    return {
      rank: i + 1,
      trackId: r.trackId,
      title: r.title ?? "(unknown)",
      artist: r.artist ?? "—",
      streams,
      revenue: parseFloat(parseFloat(r.revenue).toFixed(2)),
      dsp: (r.trackId != null ? topPlatformMap.get(r.trackId) : null) ?? "—",
      trend,
    };
  });
  res.json(result);
});

// ─── /analytics/export — CSV всего отчёта за период ─────────────────────────

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // CSV/Formula injection mitigation (Excel/Sheets): значения, начинающиеся
  // с =, +, -, @, табуляции или CR, могут быть выполнены как формулы при
  // открытии файла. Префиксуем одиночной кавычкой ДО RFC 4180 escaping.
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  // RFC 4180: оборачиваем в кавычки если содержит запятую, кавычку, перевод
  // строки, либо ведущие/конечные пробелы. Внутренние кавычки удваиваются.
  if (/[",\r\n]/.test(s) || s !== s.trim()) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

router.get("/analytics/export", async (req, res): Promise<void> => {
  const period = (req.query.period as string) ?? "30d";
  const days = periodToDays(period);
  const start = startDateFor(days);
  const startStr = start.toISOString().split("T")[0];

  // Параллельно поднимаем все четыре среза.
  const [streamsRows, platformRows, geoRows, topTrackRows] = await Promise.all([
    db.select({
        date:    usageReportsTable.period,
        streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
        revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
      })
      .from(usageReportsTable)
      .where(gte(usageReportsTable.period, startStr))
      .groupBy(usageReportsTable.period)
      .orderBy(usageReportsTable.period),
    db.select({
        platform: usageReportsTable.platform,
        streams:  sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
        revenue:  sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
      })
      .from(usageReportsTable)
      .where(gte(usageReportsTable.period, startStr))
      .groupBy(usageReportsTable.platform)
      .orderBy(desc(sql`sum(${usageReportsTable.streams})`)),
    db.select({
        country: usageReportsTable.countryCode,
        streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
        revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
      })
      .from(usageReportsTable)
      .where(and(
        gte(usageReportsTable.period, startStr),
        isNotNull(usageReportsTable.countryCode),
      ))
      .groupBy(usageReportsTable.countryCode)
      .orderBy(desc(sql`sum(${usageReportsTable.streams})`)),
    db.select({
        trackId: usageReportsTable.trackId,
        title:   tracksTable.title,
        artist:  artistsTable.name,
        streams: sql<string>`coalesce(sum(${usageReportsTable.streams}), 0)`,
        revenue: sql<string>`coalesce(sum(${usageReportsTable.revenue}), 0)`,
      })
      .from(usageReportsTable)
      .leftJoin(tracksTable, eq(tracksTable.id, usageReportsTable.trackId))
      .leftJoin(artistsTable, eq(artistsTable.id, usageReportsTable.artistId))
      .where(gte(usageReportsTable.period, startStr))
      .groupBy(usageReportsTable.trackId, tracksTable.title, artistsTable.name)
      .orderBy(desc(sql`sum(${usageReportsTable.streams})`))
      .limit(50),
  ]);

  const totalStreams = streamsRows.reduce((s, r) => s + Number(r.streams), 0);
  const totalRevenue = streamsRows.reduce((s, r) => s + parseFloat(r.revenue), 0);
  const platformTotal = platformRows.reduce((s, r) => s + Number(r.streams), 0) || 1;
  const geoTotal = geoRows.reduce((s, r) => s + Number(r.streams), 0) || 1;

  const lines: string[] = [];
  lines.push(`# Tajik Music Distribution — Аналитика`);
  lines.push(`# Период: ${period} (с ${startStr})`);
  lines.push(`# Сгенерировано: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Сводка");
  lines.push(csvRow(["Метрика", "Значение"]));
  lines.push(csvRow(["Стримов всего", totalStreams]));
  lines.push(csvRow(["Доход всего (USD)", totalRevenue.toFixed(2)]));
  lines.push(csvRow(["Платформ", platformRows.length]));
  lines.push(csvRow(["Стран", geoRows.length]));
  lines.push("");
  lines.push("## Стримы по дням");
  lines.push(csvRow(["Дата", "Стримы", "Доход (USD)"]));
  for (const r of streamsRows) {
    lines.push(csvRow([r.date, Number(r.streams), parseFloat(r.revenue).toFixed(2)]));
  }
  lines.push("");
  lines.push("## По платформам");
  lines.push(csvRow(["Платформа", "Стримы", "Доход (USD)", "Доля (%)"]));
  for (const r of platformRows) {
    const streams = Number(r.streams);
    lines.push(csvRow([
      r.platform, streams,
      parseFloat(r.revenue).toFixed(2),
      ((streams / platformTotal) * 100).toFixed(1),
    ]));
  }
  lines.push("");
  lines.push("## География");
  lines.push(csvRow(["Код страны", "Страна", "Стримы", "Доход (USD)", "Доля (%)"]));
  for (const r of geoRows) {
    if (!r.country) continue;
    const streams = Number(r.streams);
    lines.push(csvRow([
      r.country,
      COUNTRY_NAMES[r.country] ?? r.country,
      streams,
      parseFloat(r.revenue).toFixed(2),
      ((streams / geoTotal) * 100).toFixed(1),
    ]));
  }
  lines.push("");
  lines.push("## Топ треков");
  lines.push(csvRow(["#", "Название", "Артист", "Стримы", "Доход (USD)"]));
  topTrackRows.forEach((r, i) => {
    lines.push(csvRow([
      i + 1,
      r.title ?? "(unknown)",
      r.artist ?? "—",
      Number(r.streams),
      parseFloat(r.revenue).toFixed(2),
    ]));
  });
  lines.push("");

  // \uFEFF (BOM) → Excel/Numbers корректно подхватывают UTF-8 кириллицу.
  const body = "\uFEFF" + lines.join("\r\n");
  const today = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="analytics-${period}-${today}.csv"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(body);
});

export default router;
