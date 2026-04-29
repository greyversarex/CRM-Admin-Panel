import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  useGetDashboardSummary,
  useGetDashboardRevenueByMonth,
  useGetDashboardRecentActivity,
  useGetDashboardTopArtists,
  useGetDashboardReleasesByStatus
} from "@workspace/api-client-react";
import { Users, Disc3, DollarSign, Activity, TrendingUp, TrendingDown, Layers, Headphones, Clock, Wallet, AlertTriangle, ShieldAlert } from "lucide-react";
import {
  TopDspCard, TopTerritoriesCard, LatestReleasesGridCard,
  TopTracksCard, RoyaltySummaryCard, ArtistsStatsTableCard,
} from "@/components/dashboard-sections";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-[12px] text-muted-foreground/60">
      {message}
    </div>
  );
}

export default function Dashboard() {
  const { data: summary } = useGetDashboardSummary();
  const { data: revenueData } = useGetDashboardRevenueByMonth();
  const { data: activityData } = useGetDashboardRecentActivity();
  const { data: topArtistsData } = useGetDashboardTopArtists();
  const { data: statusData } = useGetDashboardReleasesByStatus();
  const { t } = useLang();
  const d = t.dashboard;
  const { user } = useAuth();
  const role = user?.role ?? "admin";

  const revenue = revenueData ?? [];
  const status = statusData ?? [];
  const activity = activityData ?? [];
  const topArtists = topArtistsData ?? [];

  const totalRevenue = summary?.totalRevenue ?? 0;
  const totalStreams = summary?.totalStreams ?? 0;
  const totalArtists = summary?.totalArtists ?? 0;
  const totalReleases = summary?.totalReleases ?? 0;
  const activeDeliveries = summary?.activeDeliveries ?? 0;
  const revenueGrowth = summary?.revenueGrowth ?? 0;
  const releasesThisMonth = summary?.releasesThisMonth ?? 0;

  const formatStreams = (n: number): string => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const scopeBadge = role === "label"
    ? (user?.orgName ?? d.role_label)
    : role === "artist"
    ? (user?.orgName ?? user?.name ?? d.role_artist)
    : null;

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* ── Page Header ── */}
        <div className="flex items-start justify-between">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{d.title}</h1>
              {scopeBadge && (
                <Badge variant="outline" className="text-[11px] font-semibold border-primary/30 text-primary bg-primary/8 px-2 py-0.5">
                  {scopeBadge}
                </Badge>
              )}
              {role !== "admin" && role !== "manager" && (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-amber-500/30 text-amber-400 bg-amber-500/8 px-2 py-0.5">
                  {ROLE_LABELS[role]} · {d.my_data_only}
                </Badge>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {role === "artist"
                ? d.subtitle_artist
                : role === "label"
                ? d.subtitle_label
                : d.subtitle}
            </p>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            label={role === "artist" ? d.my_revenue : role === "label" ? d.label_revenue : d.total_revenue}
            value={`$${totalRevenue.toLocaleString()}`}
            icon={DollarSign}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/12"
            iconBorder="border-emerald-500/20"
            trend={{ value: `${revenueGrowth >= 0 ? "+" : ""}${revenueGrowth}%`, up: revenueGrowth >= 0, label: "vs last period" }}
          />
          <KpiCard
            label={d.total_streams}
            value={formatStreams(totalStreams)}
            icon={Headphones}
            iconColor="text-fuchsia-400"
            iconBg="bg-fuchsia-500/12"
            iconBorder="border-fuchsia-500/20"
            trend={{ value: totalStreams > 0 ? `${totalStreams.toLocaleString()} ${d.streams_suffix}` : d.no_data, up: undefined }}
          />
          <KpiCard
            label={role === "label" ? d.label_artists : d.total_artists}
            value={totalArtists.toLocaleString()}
            icon={Users}
            iconColor="text-primary"
            iconBg="bg-primary/12"
            iconBorder="border-primary/20"
            trend={{ value: `${totalArtists} ${d.active_suffix}`, up: undefined }}
          />
          <KpiCard
            label={role === "artist" ? d.my_releases : role === "label" ? d.label_releases : d.total_releases}
            value={totalReleases.toLocaleString()}
            icon={Disc3}
            iconColor="text-violet-400"
            iconBg="bg-violet-500/12"
            iconBorder="border-violet-500/20"
            trend={{ value: `+${releasesThisMonth}`, up: releasesThisMonth > 0, label: "this month" }}
          />
          <KpiCard
            label={d.active_deliveries}
            value={activeDeliveries.toLocaleString()}
            icon={Activity}
            iconColor="text-sky-400"
            iconBg="bg-sky-500/12"
            iconBorder="border-sky-500/20"
            trend={{ value: d.processing, up: undefined }}
          />
        </div>

        {(role === "admin" || role === "manager") && <FinanceKpiRow />}

        {/* ── Charts row ── */}
        <div className="grid gap-4 lg:grid-cols-7">
          <Card className="col-span-4 card-surface border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{d.revenue_overview}</CardTitle>
              <CardDescription className="text-[12px]">{d.revenue_subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="pl-1">
              <div className="h-[280px] w-full">
                {revenue.length === 0 ? (
                  <EmptyChart message={d.empty_revenue} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenue} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorDsp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorPub" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} dy={8} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "10px", fontSize: "12px", boxShadow: "0 8px 20px rgba(0,0,0,0.4)" }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                        formatter={(v: number) => [`$${v.toLocaleString()}`, ""]}
                      />
                      <Area type="monotone" dataKey="dspRevenue" name="DSP Revenue" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorDsp)" dot={false} />
                      <Area type="monotone" dataKey="publishingRevenue" name="Publishing" stroke="hsl(var(--chart-2))" strokeWidth={2} fillOpacity={1} fill="url(#colorPub)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Artists */}
          <Card className="col-span-3 card-surface border-border/60 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{d.top_artists}</CardTitle>
              <CardDescription className="text-[12px]">{d.top_artists_subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto px-4">
              {topArtists.length === 0 ? (
                <EmptyChart message={d.empty_top_artists} />
              ) : (
                <div className="space-y-1">
                  {topArtists.map((artist, i) => (
                    <div key={artist.id} className="flex items-center gap-3 py-2 border-b border-border/25 last:border-0 hover:bg-white/[0.025] rounded-lg px-1 transition-colors cursor-default">
                      <span className="text-[11px] font-bold text-muted-foreground/35 w-4 text-right shrink-0">{i + 1}</span>
                      <Avatar className="h-8 w-8 border border-border/50 shrink-0">
                        <AvatarImage src={artist.imageUrl || ""} alt={artist.name} />
                        <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-bold">
                          {artist.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate">{artist.name}</p>
                        <p className="text-[10px] text-muted-foreground">{(artist.totalStreams / 1000).toFixed(0)}K streams</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[12px] font-semibold">${artist.revenue.toLocaleString()}</p>
                        <p className={`text-[10px] font-medium flex items-center justify-end gap-0.5 ${artist.trend > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {artist.trend > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                          {artist.trend > 0 ? "+" : ""}{artist.trend}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Bottom row ── */}
        <div className="grid gap-4 lg:grid-cols-7">
          <Card className="col-span-3 card-surface border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{d.recent_releases}</CardTitle>
              <CardDescription className="text-[12px]">{d.recent_releases_subtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] w-full">
                {status.length === 0 ? (
                  <EmptyChart message={d.empty_releases} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={status} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="hsl(var(--border) / 0.4)" />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="status"
                        type="category"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "10px", fontSize: "12px" }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 5, 5, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-4 card-surface border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground/60" />
                <CardTitle className="text-base font-semibold">
                  {role === "artist" ? d.my_activity : role === "label" ? d.label_activity : d.recent_activity}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-[12px] text-muted-foreground/60 py-8 text-center">{d.empty_activity}</p>
              ) : (
                <div className="space-y-0">
                  {activity.map((item) => (
                    <div key={item.id} className="flex gap-3 items-start py-3 border-b border-border/25 last:border-0">
                      <div className="mt-1.5 shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.6)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[12px] font-medium leading-snug">{item.title}</p>
                          <time className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">
                            {new Date(item.timestamp).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                          </time>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ══ Admin/Manager-only widgets (реальные данные из API) ══ */}
        {(role === "admin" || role === "manager") && (
          <>
            {/* Streams donut + Latest Releases */}
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <TopDspCard metric="streams" />
              </div>
              <div className="lg:col-span-3">
                <TopTerritoriesCard />
              </div>
            </div>

            <LatestReleasesGridCard />

            {/* Top Tracks + Earnings + Royalty Summary */}
            <div className="grid gap-4 lg:grid-cols-7">
              <div className="lg:col-span-3">
                <TopTracksCard />
              </div>
              <div className="lg:col-span-2">
                <TopDspCard metric="revenue" title="Top DSP · Earnings" />
              </div>
              <div className="lg:col-span-2">
                <RoyaltySummaryCard />
              </div>
            </div>

            <ArtistsStatsTableCard />
          </>
        )}
      </div>
    </Layout>
  );
}

function FinanceKpiRow() {
  const [k, setK] = useState<{
    revenueToday: number; revenueThisMonth: number;
    pendingPayouts: { count: number; sum: number };
    readyToPay: { count: number; sum: number };
    openFraudAlerts: number; openClaims: number;
  } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/dashboard/finance-kpis", { credentials: "same-origin" });
        if (r.ok) setK(await r.json());
      } catch {}
    })();
  }, []);
  if (!k) return null;
  const fmt = (d: number) => `$${d.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
      <KpiCard label="Доход сегодня" value={fmt(k.revenueToday)} icon={DollarSign} iconColor="text-emerald-400" iconBg="bg-emerald-500/12" iconBorder="border-emerald-500/20" />
      <KpiCard label="Доход за месяц" value={fmt(k.revenueThisMonth)} icon={TrendingUp} iconColor="text-emerald-400" iconBg="bg-emerald-500/12" iconBorder="border-emerald-500/20" />
      <KpiCard label="Ожидают выплаты" value={`${k.pendingPayouts.count} / ${fmt(k.pendingPayouts.sum)}`} icon={Clock} iconColor="text-amber-400" iconBg="bg-amber-500/12" iconBorder="border-amber-500/20" />
      <KpiCard label="К выплате" value={`${k.readyToPay.count} / ${fmt(k.readyToPay.sum)}`} icon={Wallet} iconColor="text-sky-400" iconBg="bg-sky-500/12" iconBorder="border-sky-500/20" />
      <KpiCard label="Открытых сигналов о мошенничестве" value={k.openFraudAlerts.toLocaleString()} icon={AlertTriangle} iconColor="text-rose-400" iconBg="bg-rose-500/12" iconBorder="border-rose-500/20" />
      <KpiCard label="Открытых претензий" value={k.openClaims.toLocaleString()} icon={ShieldAlert} iconColor="text-orange-400" iconBg="bg-orange-500/12" iconBorder="border-orange-500/20" />
    </div>
  );
}
