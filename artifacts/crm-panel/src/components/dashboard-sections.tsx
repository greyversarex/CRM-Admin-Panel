import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Globe2, Film, TrendingUp, TrendingDown, Music2, Disc3, Award, Users as UsersIcon, Video, ListMusic, PlaySquare, Database, BarChart3, Info } from "lucide-react";
import { assetHref } from "@/components/asset-uploader";
import { ResponsiveContainer, Tooltip, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/* ───── DSP display names + colours (incl. regional: Yandex / VK / Zvuk / Deezer) ───── */

const DSP_META: Record<string, { label: string; color: string }> = {
  spotify:        { label: "Spotify",         color: "#1db954" },
  apple_music:    { label: "Apple Music",     color: "#fa243c" },
  apple:          { label: "Apple Music",     color: "#fa243c" },
  itunes:         { label: "iTunes",          color: "#ea4cc0" },
  youtube_music:  { label: "YouTube Music",   color: "#ff0000" },
  youtube:        { label: "YouTube",         color: "#ff0000" },
  youtube_cms:    { label: "YouTube CMS",     color: "#ff4d4d" },
  yandex:         { label: "Яндекс Музыка",   color: "#ffcc00" },
  yandex_music:   { label: "Яндекс Музыка",   color: "#ffcc00" },
  vk:             { label: "VK Музыка",       color: "#0077ff" },
  vk_music:       { label: "VK Музыка",       color: "#0077ff" },
  zvuk:           { label: "Звук",            color: "#7c3aed" },
  sber_zvuk:      { label: "СберЗвук",        color: "#21a038" },
  deezer:         { label: "Deezer",          color: "#a238ff" },
  amazon:         { label: "Amazon Music",    color: "#00a8e1" },
  amazon_music:   { label: "Amazon Music",    color: "#00a8e1" },
  tidal:          { label: "TIDAL",           color: "#0a7cff" },
  tiktok:         { label: "TikTok",          color: "#ff0050" },
  meta:           { label: "Meta (Reels)",    color: "#0866ff" },
  instagram:      { label: "Instagram",       color: "#e1306c" },
  deezer_hifi:    { label: "Deezer HiFi",     color: "#a238ff" },
  boomplay:       { label: "Boomplay",        color: "#f5a623" },
  anghami:        { label: "Anghami",         color: "#8b5cf6" },
};

function dspDisplay(platform: string): { label: string; color: string } {
  const key = (platform ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (DSP_META[key]) return DSP_META[key];
  // Stable fallback colour derived from the raw name — never filtered out.
  let h = 0;
  for (let i = 0; i < platform.length; i++) h = (h * 31 + platform.charCodeAt(i)) >>> 0;
  return { label: platform || "—", color: DSP_COLORS[h % DSP_COLORS.length] };
}

/* ───── helpers ───── */

function flagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed: ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

/* ───── Top DSP Donut (streams + revenue pair) ───── */

const DSP_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#64748b"];

type TopDspRow = { platform: string; revenue: number; streams: number; share: number };

export function TopDspCard({ metric = "streams", title }: { metric?: "streams" | "revenue"; title?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.top-dsp"],
    queryFn: () => fetchJson<TopDspRow[]>("/api/dashboard/top-dsp"),
  });

  const chartData = (data ?? []).slice(0, 6).map((r, i) => ({
    name: r.platform,
    value: metric === "streams" ? r.streams : r.revenue,
    fill: DSP_COLORS[i % DSP_COLORS.length],
  }));

  const total = chartData.reduce((s, r) => s + r.value, 0);

  return (
    <Card className="card-surface border-border/60 h-full flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Disc3 className="h-3.5 w-3.5 text-primary" />
          {title ?? (metric === "streams" ? "Top DSP · Streams" : "Top DSP · Earnings")}
        </CardTitle>
        <CardDescription className="text-[11px]">
          {metric === "streams" ? "Распределение стримов по платформам" : "Распределение доходов по платформам"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <Skeleton className="h-[60px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-[60px] flex items-center justify-center text-[11px] text-muted-foreground">Нет данных</div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-[180px] w-[180px] shrink-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => [metric === "streams" ? `${(v / 1000).toFixed(1)}K` : `$${v.toLocaleString()}`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">Total</p>
                <p className="text-sm font-bold tabular-nums">
                  {metric === "streams" ? `${(total / 1000).toFixed(0)}K` : `$${(total / 1000).toFixed(1)}k`}
                </p>
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              {chartData.map((row, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.fill }} />
                  <span className="flex-1 truncate">{row.name}</span>
                  <span className="font-semibold tabular-nums text-muted-foreground">
                    {metric === "streams"
                      ? `${(row.value / 1000).toFixed(0)}K`
                      : `$${row.value.toLocaleString()}`}
                  </span>
                  <span className="w-10 text-right text-muted-foreground/70 tabular-nums">
                    {total > 0 ? `${((row.value / total) * 100).toFixed(0)}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Top Territories Card ───── */

type TerritoryRow = { country: string; countryCode: string; streams: number; revenue: number; artistCount: number };

export function TopTerritoriesCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.top-territories"],
    queryFn: () => fetchJson<TerritoryRow[]>("/api/dashboard/top-territories"),
  });

  const maxStreams = Math.max(1, ...(data ?? []).map(r => r.streams));

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-primary" />
          Top Territories
        </CardTitle>
        <CardDescription className="text-[12px]">Топ стран по стримам и доходам</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-6">Нет данных по территориям</p>
        ) : (
          <div className="space-y-2">
            {data.slice(0, 10).map((c, i) => (
              <div key={(c.countryCode || c.country) + i} className="flex items-center gap-3 py-1.5 border-b border-border/25 last:border-0">
                <span className="text-[11px] font-bold text-muted-foreground/40 w-4 text-right shrink-0">{i + 1}</span>
                <span className="text-lg shrink-0 leading-none">{flagEmoji(c.countryCode)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium">{c.country}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {(c.streams / 1000).toFixed(0)}K streams
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary"
                      style={{ width: `${Math.max(4, (c.streams / maxStreams) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0 w-20">
                  <p className="text-[11px] font-semibold text-emerald-400 tabular-nums">${c.revenue.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground">{c.artistCount} артистов</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Latest Releases Grid ───── */

type LatestRelease = {
  id: number;
  title: string;
  coverUrl: string | null;
  status: string;
  releaseType: string;
  releaseDate: string | null;
  createdAt: string;
  artist: { id: number; name: string; imageUrl: string | null };
};

export function LatestReleasesGridCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.latest-releases"],
    queryFn: () => fetchJson<LatestRelease[]>("/api/dashboard/latest-releases"),
  });

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            Latest Releases
          </CardTitle>
          <CardDescription className="text-[12px]">Недавно добавленные релизы каталога</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-8">Нет релизов</p>
        ) : (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {data.map((r) => (
              <div key={r.id} className="group cursor-pointer">
                <div className="aspect-square rounded-lg overflow-hidden border border-border/50 bg-gradient-to-br from-primary/15 to-violet-500/10 flex items-center justify-center relative">
                  {r.coverUrl ? (
                    <img src={assetHref(r.coverUrl)} alt={r.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <Music2 className="h-8 w-8 text-primary/50" />
                  )}
                  <div className="absolute top-1.5 right-1.5">
                    <StatusBadge status={r.status} />
                  </div>
                </div>
                <div className="mt-1.5 px-0.5">
                  <p className="text-[12px] font-medium truncate group-hover:text-primary transition-colors">{r.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{r.artist.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Top Tracks Card ───── */

type TopTrack = {
  id: number;
  title: string;
  coverUrl: string | null;
  artist: { id: number; name: string; imageUrl: string | null };
  release: { id: number | null; title: string | null };
  streams: number;
  revenue: number;
  trend: number;
};

export function TopTracksCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.top-tracks"],
    queryFn: () => fetchJson<TopTrack[]>("/api/dashboard/top-tracks"),
  });

  return (
    <Card className="card-surface border-border/60 flex flex-col h-full">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Music2 className="h-4 w-4 text-violet-400" />
          Top Tracks
        </CardTitle>
        <CardDescription className="text-[12px]">Самые прослушиваемые треки</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 px-4 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-6">Нет треков</p>
        ) : (
          <div className="space-y-1">
            {data.slice(0, 6).map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 py-2 border-b border-border/25 last:border-0 hover:bg-white/[0.025] rounded-lg px-1 transition-colors cursor-default">
                <span className="text-[11px] font-bold text-muted-foreground/35 w-4 text-right shrink-0">{i + 1}</span>
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                  {t.coverUrl ? <img src={assetHref(t.coverUrl)} alt={t.title} className="w-full h-full object-cover" /> : <Music2 className="h-3.5 w-3.5 text-violet-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate">{t.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{t.artist.name}{t.release.title ? ` · ${t.release.title}` : ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-semibold tabular-nums">{(t.streams / 1000).toFixed(0)}K</p>
                  <p className={`text-[10px] font-medium flex items-center justify-end gap-0.5 ${t.trend >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {t.trend >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                    {t.trend >= 0 ? "+" : ""}{t.trend}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type TopArtist = {
  id: number;
  name: string;
  imageUrl: string | null;
  country: string | null;
  totalStreams: number;
  revenue: number;
  trend: number;
};

export function TopArtistsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.top-artists"],
    queryFn: () => fetchJson<TopArtist[]>("/api/dashboard/top-artists"),
  });

  return (
    <Card className="card-surface border-border/60 flex flex-col h-full">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <UsersIcon className="h-4 w-4 text-violet-400" />
          Top Artists
        </CardTitle>
        <CardDescription className="text-[12px]">Лидеры по прослушиваниям и доходу</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 px-4 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-6">Нет данных</p>
        ) : (
          <div className="space-y-1">
            {data.slice(0, 6).map((a, i) => (
              <div key={a.id} className="flex items-center gap-3 py-2 border-b border-border/25 last:border-0 hover:bg-white/[0.025] rounded-lg px-1 transition-colors cursor-default">
                <span className="text-[11px] font-bold text-muted-foreground/35 w-4 text-right shrink-0">{i + 1}</span>
                <div className="w-8 h-8 rounded-full overflow-hidden bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                  {a.imageUrl ? <img src={assetHref(a.imageUrl)} alt={a.name} className="w-full h-full object-cover" /> : <UsersIcon className="h-3.5 w-3.5 text-violet-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate">{a.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {(a.totalStreams / 1000).toFixed(0)}K streams{a.country ? ` · ${a.country}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-semibold tabular-nums text-emerald-400">${a.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  <p className={`text-[10px] font-medium flex items-center justify-end gap-0.5 ${a.trend >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {a.trend >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                    {a.trend >= 0 ? "+" : ""}{a.trend}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Royalty Summary ───── */

type RoyaltySummary = {
  totalRoyalties: number;
  dspRoyalties: number;
  publishingRoyalties: number;
  mtd: number;
  topArtists: { id: number; name: string; revenue: number; share: number }[];
  topReleases: { id: number; title: string; coverUrl: string | null; revenue: number; share: number }[];
  topLabels: { id: number; name: string; logoUrl: string | null; revenue: number; share: number }[];
};

export function RoyaltySummaryCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.royalty-summary"],
    queryFn: () => fetchJson<RoyaltySummary>("/api/dashboard/royalty-summary"),
  });

  return (
    <Card className="card-surface border-border/60 h-full flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Award className="h-4 w-4 text-amber-400" />
          Royalty Summary
        </CardTitle>
        <CardDescription className="text-[12px]">Общий доход и лидеры по выплатам</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !data ? (
          <p className="text-[11px] text-muted-foreground text-center py-6">Нет данных</p>
        ) : (
          <div className="space-y-4">
            {/* Hero totals */}
            <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Royalties</p>
              <p className="text-3xl font-bold mt-1 tabular-nums">${data.totalRoyalties.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <div className="flex items-center gap-4 mt-2 text-[11px]">
                <span className="text-muted-foreground">DSP: <span className="text-foreground font-semibold tabular-nums">${data.dspRoyalties.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                <span className="text-muted-foreground">Publishing: <span className="text-foreground font-semibold tabular-nums">${data.publishingRoyalties.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                <span className="text-muted-foreground">MTD: <span className="text-emerald-400 font-semibold tabular-nums">${data.mtd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
              </div>
            </div>
            {/* Top Earners grid */}
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Top Earning Artists</p>
                <div className="space-y-1.5">
                  {data.topArtists.length === 0 && <p className="text-[11px] text-muted-foreground">Нет данных</p>}
                  {data.topArtists.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-2 text-[11px]">
                      <span className="w-4 text-right text-muted-foreground/40 font-bold shrink-0">{i + 1}</span>
                      <span className="flex-1 truncate">{a.name}</span>
                      <span className="font-semibold tabular-nums text-emerald-400">${a.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span className="text-muted-foreground/70 w-10 text-right tabular-nums">{a.share}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Top Labels Earnings</p>
                <div className="space-y-1.5">
                  {(!data.topLabels || data.topLabels.length === 0) && <p className="text-[11px] text-muted-foreground">Нет данных</p>}
                  {(data.topLabels ?? []).map((l, i) => (
                    <div key={l.id} className="flex items-center gap-2 text-[11px]">
                      <span className="w-4 text-right text-muted-foreground/40 font-bold shrink-0">{i + 1}</span>
                      <span className="flex-1 truncate">{l.name}</span>
                      <span className="font-semibold tabular-nums text-emerald-400">${l.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span className="text-muted-foreground/70 w-10 text-right tabular-nums">{l.share}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Top Earning Releases</p>
                <div className="space-y-1.5">
                  {data.topReleases.length === 0 && <p className="text-[11px] text-muted-foreground">Нет данных</p>}
                  {data.topReleases.map((r, i) => (
                    <div key={r.id} className="flex items-center gap-2 text-[11px]">
                      <span className="w-4 text-right text-muted-foreground/40 font-bold shrink-0">{i + 1}</span>
                      <span className="flex-1 truncate">{r.title}</span>
                      <span className="font-semibold tabular-nums text-emerald-400">${r.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span className="text-muted-foreground/70 w-10 text-right tabular-nums">{r.share}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Artists Stats Table ───── */

type ArtistTableRow = {
  id: number;
  name: string;
  imageUrl: string | null;
  genre: string | null;
  country: string | null;
  status: string;
  hasSpotify: boolean;
  hasApple: boolean;
  releaseCount: number;
  streams: number;
  revenue: number;
};

/* ───── UGC Summary (Reels / Shorts / TikTok) ───── */

type UgcSummary = {
  totals: { views: number; likes: number; shares: number; videos: number; revenueCents: number };
  byPlatform: { platform: string; views: number; likes: number; shares: number; videos: number; revenueCents: number }[];
};

const PLATFORM_LABEL: Record<string, string> = {
  youtube_cms: "YouTube",
  tiktok: "TikTok",
  meta: "Meta",
  instagram: "Instagram",
};

function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function UgcSummaryCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.ugc-summary"],
    queryFn: () => fetchJson<UgcSummary>("/api/dashboard/ugc-summary"),
  });

  const totals = data?.totals ?? { views: 0, likes: 0, shares: 0, videos: 0, revenueCents: 0 };
  const byPlatform = data?.byPlatform ?? [];
  const revenue = totals.revenueCents / 100;

  return (
    <Card className="card-surface border-border/60 h-full flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Video className="h-3.5 w-3.5 text-primary" />
          UGC · Reels / Shorts / TikTok
        </CardTitle>
        <CardDescription className="text-[11px]">
          Совокупные просмотры/лайки и доход от пользовательского контента
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <Skeleton className="h-[180px] w-full" />
        ) : totals.videos === 0 && totals.views === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-[11px] text-muted-foreground">
            Нет данных за период
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border/40 bg-white/[0.02] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Просмотры</div>
                <div className="text-lg font-bold tabular-nums">{fmtCompact(totals.views)}</div>
              </div>
              <div className="rounded-md border border-border/40 bg-white/[0.02] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Видео</div>
                <div className="text-lg font-bold tabular-nums">{fmtCompact(totals.videos)}</div>
              </div>
              <div className="rounded-md border border-border/40 bg-white/[0.02] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Лайки</div>
                <div className="text-base font-semibold tabular-nums">{fmtCompact(totals.likes)}</div>
              </div>
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-emerald-300/80">Доход</div>
                <div className="text-base font-semibold tabular-nums text-emerald-300">
                  ${revenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            {byPlatform.length > 0 && (
              <div className="space-y-1 pt-1">
                {byPlatform.map((p) => (
                  <div key={p.platform} className="flex items-center justify-between text-[11px] border-b border-border/25 last:border-0 py-1">
                    <span className="font-medium">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {fmtCompact(p.views)} просм. · ${(p.revenueCents / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ArtistsStatsTableCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.artists-table"],
    queryFn: () => fetchJson<ArtistTableRow[]>("/api/dashboard/artists-table"),
  });

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-primary" />
            Artists Stats
          </CardTitle>
          <CardDescription className="text-[12px]">Полная таблица артистов с доходами и стримами</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-8">Нет артистов</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-background/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wider">Artist</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Genre</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Country</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">DSPs</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Releases</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Streams</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-right">Revenue</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((a) => (
                  <TableRow key={a.id} className="hover:bg-accent/20">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7 border border-border/50 shrink-0">
                          <AvatarImage src={a.imageUrl ?? ""} alt={a.name} />
                          <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-bold">
                            {a.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[12px] font-medium">{a.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {a.genre ? <Badge variant="outline" className="text-[10px]">{a.genre}</Badge> : <span className="text-muted-foreground/50 text-[11px]">—</span>}
                    </TableCell>
                    <TableCell className="text-[12px]">
                      {a.country ? <span className="flex items-center gap-1.5"><span className="text-sm">{flagEmoji(a.country)}</span>{a.country}</span> : <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {a.hasSpotify && <Badge variant="outline" className="text-[9px] px-1 py-0 text-emerald-400 bg-emerald-500/10 border-emerald-500/20">Spotify</Badge>}
                        {a.hasApple && <Badge variant="outline" className="text-[9px] px-1 py-0 text-rose-300 bg-rose-500/10 border-rose-500/20">Apple</Badge>}
                        {!a.hasSpotify && !a.hasApple && <span className="text-muted-foreground/50 text-[11px]">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-[12px] tabular-nums">{a.releaseCount}</TableCell>
                    <TableCell className="text-right text-[12px] tabular-nums">{(a.streams / 1000).toFixed(0)}K</TableCell>
                    <TableCell className="text-right text-[12px] font-semibold text-emerald-400 tabular-nums">
                      {a.revenue > 0 ? `$${a.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : <span className="text-muted-foreground/50 font-normal">—</span>}
                    </TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Performance Overview — главный график (Стримы / Доход) + список DSP ───── */

type StreamsByMonthRow = { month: string; streams: number; revenue: number };

export function PerformanceOverviewCard() {
  const [metric, setMetric] = useState<"streams" | "revenue">("streams");

  const { data: series, isLoading } = useQuery({
    queryKey: ["dashboard.streams-by-month"],
    queryFn: () => fetchJson<StreamsByMonthRow[]>("/api/dashboard/streams-by-month"),
  });
  const { data: dspData } = useQuery({
    queryKey: ["dashboard.top-dsp"],
    queryFn: () => fetchJson<TopDspRow[]>("/api/dashboard/top-dsp"),
  });

  const chart = series ?? [];
  const dspRows = dspData ?? [];
  const hasData = chart.some((r) => (metric === "streams" ? r.streams : r.revenue) > 0);
  const totalDspStreams = dspRows.reduce((s, r) => s + r.streams, 0);

  const isStreams = metric === "streams";
  const stroke = isStreams ? "hsl(var(--primary))" : "hsl(var(--chart-2))";
  const gradId = isStreams ? "perfStreams" : "perfRevenue";

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            {isStreams ? "Обзор стримов" : "Обзор дохода"}
          </CardTitle>
          <CardDescription className="text-[12px]">
            {isStreams ? "Стримы по месяцам (данные DSP)" : "Доход по месяцам (данные DSP)"}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex rounded-md border border-border/60 bg-background/40 p-0.5">
            <button
              type="button"
              onClick={() => setMetric("streams")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded ${isStreams ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Стримы
            </button>
            <button
              type="button"
              onClick={() => setMetric("revenue")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded ${!isStreams ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Доход
            </button>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
              >
                <Info className="h-3 w-3" /> Источники
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 text-[11px] space-y-2">
              <p className="font-semibold text-[12px] flex items-center gap-1.5"><Database className="h-3.5 w-3.5 text-primary" /> Источники данных</p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li>• Broma16 / ROD — стримы и доход по площадкам</li>
                <li>• Импорт CSV-отчётов DSP (Spotify, Apple, YouTube, TikTok)</li>
                <li>• UGC-платформы (Reels / Shorts / TikTok)</li>
              </ul>
              <p className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border/40">
                Данные появляются автоматически после выхода релизов на площадках.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Chart */}
          <div className="lg:col-span-2">
            <div className="h-[280px] w-full">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : !hasData ? (
                <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground/60">Нет данных</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={stroke} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={stroke} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} dy={8} />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      tickFormatter={(v: number) => isStreams ? `${(v / 1000).toFixed(0)}K` : `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "10px", fontSize: "12px", boxShadow: "0 8px 20px rgba(0,0,0,0.4)" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(v: number) => [isStreams ? `${v.toLocaleString()} стримов` : `$${v.toLocaleString()}`, ""]}
                    />
                    <Area type="monotone" dataKey={metric} name={isStreams ? "Стримы" : "Доход"} stroke={stroke} strokeWidth={2} fillOpacity={1} fill={`url(#${gradId})`} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          {/* DSP list beside chart */}
          <div className="lg:col-span-1 lg:border-l lg:border-border/40 lg:pl-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">Площадки (по стримам)</p>
            {dspRows.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-[11px] text-muted-foreground/60">Нет данных</div>
            ) : (
              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {dspRows.map((r) => {
                  const meta = dspDisplay(r.platform);
                  const share = totalDspStreams > 0 ? (r.streams / totalDspStreams) * 100 : 0;
                  return (
                    <div key={r.platform} className="space-y-1">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                        <span className="flex-1 truncate font-medium">{meta.label}</span>
                        <span className="tabular-nums text-muted-foreground">{fmtCompact(r.streams)}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(share, 2)}%`, backgroundColor: meta.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ───── Playlist Placements — плейлисты, куда попали релизы (для лейбла/артиста) ───── */

type PlaylistRow = {
  id: number; playlistName: string; dsp: string;
  followers: number; streams: number; trendPct: number; lastUpdated: string;
};

export function PlaylistPlacementsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.playlist-placements"],
    queryFn: () => fetchJson<PlaylistRow[]>("/api/dashboard/playlist-placements"),
  });
  const rows = data ?? [];

  return (
    <Card className="card-surface border-border/60 h-full flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ListMusic className="h-3.5 w-3.5 text-primary" />
          Плейлисты
        </CardTitle>
        <CardDescription className="text-[11px]">Попадания релизов в плейлисты площадок</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <Skeleton className="h-[180px] w-full" />
        ) : rows.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-[11px] text-muted-foreground">Нет данных</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((p) => {
              const meta = dspDisplay(p.dsp);
              return (
                <div key={p.id} className="flex items-center gap-2.5 py-1.5 border-b border-border/25 last:border-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate">{p.playlistName}</p>
                    <p className="text-[10px] text-muted-foreground">{meta.label} · {fmtCompact(p.followers)} подписчиков</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[12px] font-semibold tabular-nums">{fmtCompact(p.streams)}</p>
                    <p className={`text-[10px] font-medium flex items-center justify-end gap-0.5 ${p.trendPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {p.trendPct >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                      {p.trendPct >= 0 ? "+" : ""}{p.trendPct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── UGC Map — динамика (просмотры / видео / вовлечённость) + платформы ───── */

type UgcSeriesPoint = { day: string; views: number; videos: number; likes: number };
type UgcPlatformRow = { platform: string; views: number; videos: number; likes: number; shares: number };
type UgcTimeseries = { series: UgcSeriesPoint[]; byPlatform: UgcPlatformRow[] };

function UgcMiniChart({ data, dataKey, label, color }: { data: UgcSeriesPoint[]; dataKey: "views" | "videos" | "likes"; label: string; color: string }) {
  const gradId = `ugc_${dataKey}`;
  return (
    <div className="rounded-md border border-border/40 bg-white/[0.02] p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <div className="h-[90px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" hide />
            <YAxis hide />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [v.toLocaleString(), label]}
              labelFormatter={(l) => new Date(l).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
            />
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fillOpacity={1} fill={`url(#${gradId})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function UgcMapCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.ugc-timeseries"],
    queryFn: () => fetchJson<UgcTimeseries>("/api/dashboard/ugc-timeseries"),
  });
  const series = data?.series ?? [];
  const byPlatform = data?.byPlatform ?? [];
  const hasData = series.length > 0;
  const maxViews = Math.max(1, ...byPlatform.map((p) => p.views));

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Video className="h-3.5 w-3.5 text-primary" />
          UGC · карта активности
        </CardTitle>
        <CardDescription className="text-[11px]">Динамика по дням и разбивка по платформам (TikTok / YouTube / Reels)</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : !hasData ? (
          <div className="h-[200px] flex items-center justify-center text-[12px] text-muted-foreground/60">Нет данных</div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <UgcMiniChart data={series} dataKey="views" label="Просмотры" color="#6366f1" />
              <UgcMiniChart data={series} dataKey="videos" label="Видео" color="#06b6d4" />
              <UgcMiniChart data={series} dataKey="likes" label="Вовлечённость (лайки)" color="#ec4899" />
            </div>
            {byPlatform.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Платформы</p>
                {byPlatform.map((p) => {
                  const meta = dspDisplay(p.platform);
                  const share = (p.views / maxViews) * 100;
                  return (
                    <div key={p.platform} className="space-y-1">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                        <span className="flex-1 truncate font-medium">{meta.label}</span>
                        <span className="tabular-nums text-muted-foreground">{fmtCompact(p.views)} просм. · {fmtCompact(p.videos)} видео</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(share, 2)}%`, backgroundColor: meta.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Users Ranking — таблица пользователей (только админ/менеджер) ───── */

type UserRankRow = {
  id: number; name: string; email: string; role: string; status: string;
  avatarUrl: string | null; country: string | null; lastLoginAt: string | null; createdAt: string;
};

const ROLE_RU: Record<string, string> = {
  admin: "Администратор", manager: "Менеджер", label: "Лейбл", artist: "Артист",
};

export function UsersRankingCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard.users-ranking"],
    queryFn: () => fetchJson<UserRankRow[]>("/api/dashboard/users-ranking"),
  });
  const rows = data ?? [];

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" }) : "—";

  return (
    <Card className="card-surface border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <UsersIcon className="h-4 w-4 text-primary" />
          Пользователи
        </CardTitle>
        <CardDescription className="text-[12px]">Рейтинг по активности и дате регистрации</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-8">Нет данных</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-background/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wider w-8">#</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Пользователь</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Роль</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Статус</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Регистрация</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Последний вход</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u, i) => (
                  <TableRow key={u.id} className="hover:bg-accent/20">
                    <TableCell className="text-[11px] font-bold text-muted-foreground/40">{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7 border border-border/50 shrink-0">
                          <AvatarImage src={u.avatarUrl ? assetHref(u.avatarUrl) : ""} alt={u.name} />
                          <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-bold">
                            {u.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium truncate">{u.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{ROLE_RU[u.role] ?? u.role}</Badge>
                    </TableCell>
                    <TableCell><StatusBadge status={u.status} /></TableCell>
                    <TableCell className="text-[12px] tabular-nums text-muted-foreground">{fmtDate(u.createdAt)}</TableCell>
                    <TableCell className="text-[12px] tabular-nums text-muted-foreground">{fmtDate(u.lastLoginAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
