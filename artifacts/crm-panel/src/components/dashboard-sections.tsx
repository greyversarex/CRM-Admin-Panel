import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Globe2, Film, TrendingUp, TrendingDown, Music2, Disc3, Award, Users as UsersIcon } from "lucide-react";
import { assetHref } from "@/components/asset-uploader";
import { ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
          <Skeleton className="h-[200px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-[11px] text-muted-foreground">Нет данных</div>
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

/* ───── Royalty Summary ───── */

type RoyaltySummary = {
  totalRoyalties: number;
  dspRoyalties: number;
  publishingRoyalties: number;
  mtd: number;
  topArtists: { id: number; name: string; revenue: number; share: number }[];
  topReleases: { id: number; title: string; coverUrl: string | null; revenue: number; share: number }[];
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
            <div className="grid gap-4 md:grid-cols-2">
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
