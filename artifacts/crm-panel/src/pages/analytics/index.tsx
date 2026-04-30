import { Layout } from "@/components/layout";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/i18n";
import { UgcTab } from "./ugc-tab";
import { RealtimeTab } from "./realtime-tab";
import { useAuth } from "@/lib/auth";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Play, Music, Globe2, DollarSign, Lock } from "lucide-react";

// ─── API helper ─────────────────────────────────────────────────────────────

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Period = "7d" | "30d" | "90d" | "180d" | "1y";

interface StreamsResp {
  totalStreams: number;
  totalRevenue: number;
  byDay: { date: string; streams: number; revenue: number }[];
}
interface PlatformRow { platform: string; streams: number; revenue: number; percentage: number; }
interface GeoRow { country: string; countryCode: string; streams: number; revenue: number; percentage: number; }
interface TopTrack { rank: number; trackId: number | null; title: string; artist: string; streams: number; revenue: number; dsp: string; trend: number; }

const PLATFORM_COLORS: Record<string, string> = {
  Spotify: "#1DB954",
  "Apple Music": "#FC3C44",
  "YouTube Music": "#FF0000",
  "Yandex Music": "#FFCC00",
  "VK Music": "#0077FF",
  Deezer: "#A238FF",
};
const colorFor = (name: string) => PLATFORM_COLORS[name] ?? "#6B7280";

const COUNTRY_FLAGS: Record<string, string> = {
  TJ: "🇹🇯", RU: "🇷🇺", UZ: "🇺🇿", KZ: "🇰🇿",
  DE: "🇩🇪", US: "🇺🇸", AF: "🇦🇫", TR: "🇹🇷",
  GB: "🇬🇧", AE: "🇦🇪",
};

const fmtInt = (n: number) => n.toLocaleString("en-US");
const fmtCompact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
  : String(n);
const fmtMoney = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Aggregate daily byDay → monthly bins for nicer chart on long periods.
function bucketByMonth(byDay: StreamsResp["byDay"]) {
  const map = new Map<string, { label: string; streams: number; revenue: number }>();
  for (const d of byDay) {
    const dt = new Date(d.date);
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const cur = map.get(key) ?? { label, streams: 0, revenue: 0 };
    cur.streams += d.streams;
    cur.revenue += d.revenue;
    map.set(key, cur);
  }
  return Array.from(map.values());
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { t } = useLang();
  const { user, isLoading } = useAuth();
  const role = user?.role;
  const isAdminOrManager = role === "admin" || role === "manager";

  const [period, setPeriod] = useState<Period>("30d");
  const [streams, setStreams] = useState<StreamsResp | null>(null);
  const [platforms, setPlatforms] = useState<PlatformRow[] | null>(null);
  const [geo, setGeo] = useState<GeoRow[] | null>(null);
  const [tracks, setTracks] = useState<TopTrack[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdminOrManager) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api<StreamsResp>(`/api/analytics/streams?period=${period}`),
      api<PlatformRow[]>(`/api/analytics/platforms?period=${period}`),
      api<GeoRow[]>(`/api/analytics/geography?period=${period}`),
      api<TopTrack[]>(`/api/analytics/top-tracks?period=${period}&limit=10`),
    ]).then(([s, p, g, tr]) => {
      if (cancelled) return;
      setStreams(s); setPlatforms(p); setGeo(g); setTracks(tr);
    }).catch((e) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period, isAdminOrManager]);

  const monthlyStreams = useMemo(() => streams ? bucketByMonth(streams.byDay) : [], [streams]);

  // Daily chart on short periods, monthly on long ones.
  const chartData = useMemo(() => {
    if (!streams) return [];
    if (period === "7d" || period === "30d") {
      return streams.byDay.map((d) => ({
        label: new Date(d.date).toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
        streams: d.streams,
        revenue: parseFloat(d.revenue.toFixed(2)),
      }));
    }
    return monthlyStreams.map((m) => ({ label: m.label, streams: m.streams, revenue: parseFloat(m.revenue.toFixed(2)) }));
  }, [streams, monthlyStreams, period]);

  // ── Permission gate ──
  if (isLoading) {
    return <Layout><div className="p-6"><Skeleton className="h-32 w-full" /></div></Layout>;
  }
  if (!isAdminOrManager) {
    return (
      <Layout>
        <div className="flex flex-col gap-6">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <h1 className="text-2xl font-bold tracking-tight">{t.analytics.title}</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Статистика плейлистов и TikTok</p>
          </div>
          <Tabs defaultValue="playlists" className="w-full">
            <TabsList className="bg-card border border-border h-auto p-1 gap-1">
              <TabsTrigger value="playlists" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Плейлисты</TabsTrigger>
              <TabsTrigger value="tiktok" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">TikTok</TabsTrigger>
            </TabsList>
            <TabsContent value="playlists" className="mt-4"><PlaylistAnalyticsTab /></TabsContent>
            <TabsContent value="tiktok" className="mt-4"><TikTokAnalyticsTab /></TabsContent>
          </Tabs>
        </div>
      </Layout>
    );
  }

  const isShortPeriod = period === "7d" || period === "30d";

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <h1 className="text-2xl font-bold tracking-tight">{t.analytics.title}</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {t.analytics.real_data_subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-40 bg-card border-border" aria-label={t.analytics.title}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">{t.analytics.period_7d}</SelectItem>
                <SelectItem value="30d">{t.analytics.period_30d}</SelectItem>
                <SelectItem value="90d">{t.analytics.period_90d}</SelectItem>
                <SelectItem value="180d">{t.analytics.period_180d}</SelectItem>
                <SelectItem value="1y">{t.analytics.period_1y}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="bg-card"
              onClick={() => {
                window.location.href = `/api/analytics/export?period=${encodeURIComponent(period)}`;
              }}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {t.common.export}
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-rose-500/30 bg-rose-500/5">
            <CardContent className="py-3 text-sm text-rose-400">{t.analytics.load_error}: {error}</CardContent>
          </Card>
        )}

        {/* KPIs */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label={t.analytics.kpi.streams_period}
            value={loading || !streams ? "—" : fmtCompact(streams.totalStreams)}
            icon={Play}
            iconColor="text-primary"
            iconBg="bg-primary/12"
            iconBorder="border-primary/20"
          />
          <KpiCard
            label={t.analytics.kpi.revenue_period}
            value={loading || !streams ? "—" : fmtMoney(streams.totalRevenue)}
            icon={DollarSign}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/12"
            iconBorder="border-emerald-500/20"
          />
          <KpiCard
            label={t.analytics.kpi.active_platforms}
            value={loading || !platforms ? "—" : String(platforms.length)}
            icon={Music}
            iconColor="text-violet-400"
            iconBg="bg-violet-500/12"
            iconBorder="border-violet-500/20"
          />
          <KpiCard
            label={t.analytics.kpi.countries}
            value={loading || !geo ? "—" : String(geo.length)}
            icon={Globe2}
            iconColor="text-sky-400"
            iconBg="bg-sky-500/12"
            iconBorder="border-sky-500/20"
          />
        </div>

        <Tabs defaultValue="streams" className="w-full">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1 flex flex-wrap">
            <TabsTrigger value="streams" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{t.analytics.tabs.streams}</TabsTrigger>
            <TabsTrigger value="revenue" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{t.analytics.tabs.revenue}</TabsTrigger>
            <TabsTrigger value="geo" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{t.analytics.tabs.geo}</TabsTrigger>
            <TabsTrigger value="tracks" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{t.analytics.tabs.tracks}</TabsTrigger>
            <TabsTrigger value="ugc" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">UGC</TabsTrigger>
            <TabsTrigger value="realtime" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Алерты</TabsTrigger>
            <TabsTrigger value="playlists" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Плейлисты</TabsTrigger>
            <TabsTrigger value="tiktok" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">TikTok</TabsTrigger>
          </TabsList>

          {/* ─── Streams ─── */}
          <TabsContent value="streams" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-7">
              <Card className="col-span-7 lg:col-span-4 bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle>{t.analytics.chart.stream_dynamics}</CardTitle>
                  <CardDescription>{isShortPeriod ? t.analytics.chart.by_day : t.analytics.chart.by_month}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    {loading ? <Skeleton className="h-full w-full" /> : chartData.length === 0 ? (
                      <EmptyChart label={t.analytics.chart.no_data} />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="streamGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={fmtCompact} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                            formatter={(v: number) => [fmtInt(v), t.analytics.chart.streams_label]}
                          />
                          <Area type="monotone" dataKey="streams" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#streamGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="col-span-7 lg:col-span-3 bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle>{t.analytics.chart.by_platform}</CardTitle>
                  <CardDescription>{t.analytics.chart.stream_share}</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-[180px] w-full" /> : !platforms || platforms.length === 0 ? (
                    <EmptyChart label={t.analytics.chart.no_data} />
                  ) : (
                    <>
                      <div className="h-[180px] mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={platforms} dataKey="streams" nameKey="platform" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                              {platforms.map((entry) => (<Cell key={entry.platform} fill={colorFor(entry.platform)} />))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                              formatter={(v: number) => [fmtInt(v), t.analytics.chart.streams_label]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2">
                        {platforms.map((dsp) => (
                          <div key={dsp.platform} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(dsp.platform) }} aria-hidden="true" />
                              <span className="text-muted-foreground">{dsp.platform}</span>
                            </div>
                            <span className="font-medium tabular-nums">{dsp.percentage}%</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── Revenue ─── */}
          <TabsContent value="revenue" className="mt-4 space-y-4">
            <Card className="card-surface border-border/60">
              <CardHeader>
                <CardTitle>{isShortPeriod ? t.analytics.chart.revenue_days : t.analytics.chart.revenue_months}</CardTitle>
                <CardDescription>{t.analytics.chart.revenue_calc_desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {loading ? <Skeleton className="h-full w-full" /> : chartData.length === 0 ? (
                    <EmptyChart label={t.analytics.chart.no_data} />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} formatter={(v: number) => [fmtMoney(v), t.analytics.chart.revenue_label]} />
                        <Bar dataKey="revenue" name={t.analytics.chart.revenue_label} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="card-surface border-border/60">
              <CardHeader>
                <CardTitle>{t.analytics.chart.revenue_by_platform}</CardTitle>
                <CardDescription>{t.analytics.chart.for_period}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? <div className="p-6"><Skeleton className="h-32 w-full" /></div> : !platforms || platforms.length === 0 ? (
                  <div className="p-6"><EmptyChart label={t.analytics.chart.no_data} /></div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50 bg-background/30">
                        <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">{t.analytics.chart.platform}</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">{t.analytics.chart.streams}</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">{t.analytics.chart.share}</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-6 py-3">{t.analytics.chart.revenue}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {platforms.map((p) => (
                        <tr key={p.platform} className="border-b border-border/50 hover:bg-accent/20">
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(p.platform) }} aria-hidden="true" />
                              <span className="font-medium text-sm">{p.platform}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums">{fmtInt(p.streams)}</td>
                          <td className="px-4 py-3 text-right text-sm text-muted-foreground tabular-nums">{p.percentage}%</td>
                          <td className="px-6 py-3 text-right text-sm font-medium tabular-nums">{fmtMoney(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Geography ─── */}
          <TabsContent value="geo" className="mt-4">
            <Card className="card-surface border-border/60">
              <CardHeader>
                <CardTitle>{t.analytics.chart.geo}</CardTitle>
                <CardDescription>{t.analytics.chart.geo_desc}</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-48 w-full" /> : !geo || geo.length === 0 ? (
                  <EmptyChart label={t.analytics.chart.no_data} />
                ) : (
                  <div className="space-y-3">
                    {geo.map((item, i) => (
                      <div key={item.countryCode} className="flex items-center gap-4">
                        <span className="text-muted-foreground text-xs font-mono w-4 shrink-0">{i + 1}</span>
                        <span className="text-lg shrink-0" aria-hidden="true">{COUNTRY_FLAGS[item.countryCode] ?? "🌍"}</span>
                        <span className="text-sm font-medium w-32 shrink-0">{item.country}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={item.percentage} aria-valuemin={0} aria-valuemax={100}>
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-700"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground tabular-nums w-20 text-right shrink-0">
                          {fmtCompact(item.streams)}
                        </span>
                        <span className="text-xs text-muted-foreground w-12 text-right shrink-0 tabular-nums">{item.percentage}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Top Tracks ─── */}
          <TabsContent value="tracks" className="mt-4">
            <Card className="card-surface border-border/60">
              <CardHeader>
                <CardTitle>{t.analytics.chart.top_tracks}</CardTitle>
                <CardDescription>{t.analytics.chart.top_tracks_desc}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? <div className="p-6"><Skeleton className="h-48 w-full" /></div> : !tracks || tracks.length === 0 ? (
                  <div className="p-6"><EmptyChart label={t.analytics.chart.no_data} /></div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50 bg-background/30">
                        <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3 w-8">#</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{t.analytics.chart.track}</th>
                        <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{t.analytics.chart.top_platform}</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">{t.analytics.chart.streams}</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">{t.analytics.chart.revenue}</th>
                        <th className="text-right text-xs font-medium text-muted-foreground px-6 py-3">{t.analytics.chart.trend}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tracks.map((tr) => (
                        <tr key={tr.trackId ?? tr.rank} className="border-b border-border/50 hover:bg-accent/20">
                          <td className="px-6 py-3 text-sm text-muted-foreground font-mono">{tr.rank}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-sm">{tr.title}</div>
                            <div className="text-xs text-muted-foreground">{tr.artist}</div>
                          </td>
                          <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{tr.dsp}</Badge></td>
                          <td className="px-4 py-3 text-right text-sm font-medium tabular-nums">{fmtInt(tr.streams)}</td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums">{fmtMoney(tr.revenue)}</td>
                          <td className="px-6 py-3 text-right">
                            {tr.trend === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <span className={`text-xs font-medium flex items-center justify-end gap-0.5 ${tr.trend > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                {tr.trend > 0 ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
                                {Math.abs(tr.trend)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ugc" className="mt-4"><UgcTab /></TabsContent>
          <TabsContent value="realtime" className="mt-4"><RealtimeTab /></TabsContent>

          {/* ─── Playlist Analytics ─── */}
          <TabsContent value="playlists" className="mt-4">
            <PlaylistAnalyticsTab />
          </TabsContent>

          {/* ─── TikTok ─── */}
          <TabsContent value="tiktok" className="mt-4">
            <TikTokAnalyticsTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// ─── Playlist Analytics Tab ──────────────────────────────────────────────────

interface PlaylistRow {
  id: number; playlistName: string; dsp: string;
  followers: number; streams: number; trendPct: number; lastUpdated: string;
}

function PlaylistAnalyticsTab() {
  const [rows, setRows]       = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<PlaylistRow[]>("/api/analytics/playlists")
      .then(setRows)
      .catch(() => { /* silent — will show empty */ })
      .finally(() => setLoading(false));
  }, []);

  const totalStreams   = rows.reduce((s, p) => s + p.streams, 0);
  const totalFollowers = rows.reduce((s, p) => s + p.followers, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10"><Play className="w-4 h-4 text-green-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Плейлистов</p>
              <p className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-8 inline-block" /> : rows.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10"><Music className="w-4 h-4 text-blue-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Стримов с плейлистов</p>
              <p className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-16 inline-block" /> : fmtCompact(totalStreams)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/10"><Globe2 className="w-4 h-4 text-violet-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Подписчиков (всего)</p>
              <p className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-16 inline-block" /> : fmtCompact(totalFollowers)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Плейлисты с вашими треками</CardTitle>
          <CardDescription>Список плейлистов на всех платформах, включающих ваши релизы</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">Нет данных о плейлистах</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-background/30">
                  <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Плейлист</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Платформа</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Подписчики</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Стримов</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Обновлён</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-6 py-3">Тренд</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-accent/20">
                    <td className="px-6 py-3 text-sm font-medium">{p.playlistName}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{p.dsp}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">{fmtCompact(p.followers)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">{fmtCompact(p.streams)}</td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">{new Date(p.lastUpdated).toLocaleDateString("ru-RU")}</td>
                    <td className="px-6 py-3 text-right">
                      {p.trendPct === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className={`text-xs font-medium flex items-center justify-end gap-0.5 ${p.trendPct > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                          {p.trendPct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {Math.abs(p.trendPct)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── TikTok Analytics Tab ────────────────────────────────────────────────────

interface TikTokRow {
  id: number; trackTitle: string; artistName: string;
  uses: number; videoViews: number; likes: number; reposts: number;
}

const fmtK = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n);

function TikTokAnalyticsTab() {
  const [rows, setRows]       = useState<TikTokRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<TikTokRow[]>("/api/analytics/tiktok")
      .then(setRows)
      .catch(() => { /* silent */ })
      .finally(() => setLoading(false));
  }, []);

  const totalUses  = rows.reduce((s, t) => s + t.uses, 0);
  const totalViews = rows.reduce((s, t) => s + t.videoViews, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-pink-500/10"><Music className="w-4 h-4 text-pink-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Использований треков</p>
              <p className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-16 inline-block" /> : fmtK(totalUses)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10"><Play className="w-4 h-4 text-blue-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Просмотров видео</p>
              <p className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-16 inline-block" /> : fmtK(totalViews)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10"><TrendingUp className="w-4 h-4 text-emerald-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Треков с данными</p>
              <p className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-8 inline-block" /> : rows.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">TikTok — Использование треков</CardTitle>
          <CardDescription>Статистика видео, созданных с вашими треками на TikTok</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">Нет данных TikTok</p>
          ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 bg-background/30">
                <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Трек</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Использований</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Просмотров</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Лайков</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-6 py-3">Репостов</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(tr => (
                <tr key={tr.id} className="border-b border-border/50 hover:bg-accent/20">
                  <td className="px-6 py-3">
                    <div className="text-sm font-medium">{tr.trackTitle}</div>
                    <div className="text-xs text-muted-foreground">{tr.artistName}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums">{fmtK(tr.uses)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums">{fmtK(tr.videoViews)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums">{fmtK(tr.likes)}</td>
                  <td className="px-6 py-3 text-right text-sm tabular-nums">{fmtK(tr.reposts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
