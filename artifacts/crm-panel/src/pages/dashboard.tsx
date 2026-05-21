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
import { Users, Disc3, DollarSign, Activity, TrendingUp, TrendingDown, Layers, Headphones, Clock, Wallet, AlertTriangle, ShieldAlert, CheckCircle2, XCircle, Scale, Ban, Hourglass, FileText, BookCheck, ClipboardList, FileX, AlertOctagon, Coins, Library, Search, MoreVertical, ChevronLeft, ChevronRight, Music2, SlidersHorizontal } from "lucide-react";
import {
  TopDspCard, TopTerritoriesCard, LatestReleasesGridCard,
  TopArtistsCard, RoyaltySummaryCard, ArtistsStatsTableCard, UgcSummaryCard,
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

        {(role === "admin" || role === "manager") && <OpsKpiRow />}
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

        {/* ══ Расширенные виджеты (реальные данные из API, scoped по роли в бекенде) ══ */}
        {(role === "admin" || role === "manager" || role === "label") && (
          <>
            {/* Streams donut + Top Territories */}
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <TopDspCard metric="streams" />
              </div>
              <div className="lg:col-span-3">
                <TopTerritoriesCard />
              </div>
            </div>

            <LatestReleasesGridCard />

            {/* Top Tracks + Earnings DSP + Royalty Summary */}
            <div className="grid gap-4 lg:grid-cols-7">
              <div className="lg:col-span-3">
                <TopArtistsCard />
              </div>
              <div className="lg:col-span-2">
                <TopDspCard metric="revenue" title="Top DSP · Earnings" />
              </div>
              <div className="lg:col-span-2">
                <RoyaltySummaryCard />
              </div>
            </div>

            {/* UGC widget — реальные данные из ugc_metrics, scoped по треков-владению */}
            <div className="grid gap-4 lg:grid-cols-2">
              <UgcSummaryCard />
            </div>

            {/* Таблица артистов — только админ/менеджер, лейблу не нужна
                агрегированная сводка по чужим артистам. */}
            {(role === "admin" || role === "manager") && <ArtistsStatsTableCard />}

            {(role === "admin" || role === "manager") && (
              <div className="space-y-4 pt-2">
                <div className="flex items-end justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white tracking-tight">Publishing Catalog</h2>
                    <p className="text-[12px] text-white/55">Регистрация прав, роялти и метаданные произведений</p>
                  </div>
                  <a href="/publishing" className="text-[12px] text-primary hover:underline">Открыть Паблишинг →</a>
                </div>
                <PublishingKpiRow />
                <LatestPublishingWorksCard />
              </div>
            )}
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
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <KpiCard label="Ожидают выплаты" value={`${k.pendingPayouts.count} / ${fmt(k.pendingPayouts.sum)}`} icon={Clock} iconColor="text-amber-400" iconBg="bg-amber-500/12" iconBorder="border-amber-500/20" />
      <KpiCard label="К выплате" value={`${k.readyToPay.count} / ${fmt(k.readyToPay.sum)}`} icon={Wallet} iconColor="text-sky-400" iconBg="bg-sky-500/12" iconBorder="border-sky-500/20" />
      <KpiCard label="Открытых сигналов о мошенничестве" value={k.openFraudAlerts.toLocaleString()} icon={AlertTriangle} iconColor="text-rose-400" iconBg="bg-rose-500/12" iconBorder="border-rose-500/20" />
      <KpiCard label="Открытых претензий" value={k.openClaims.toLocaleString()} icon={ShieldAlert} iconColor="text-orange-400" iconBg="bg-orange-500/12" iconBorder="border-orange-500/20" />
    </div>
  );
}

function OpsKpiRow() {
  const [k, setK] = useState<{
    delivered: number; failed: number; dispute: number; takedown: number;
    reviewPending: number; users: number; contracts: number;
  } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/dashboard/ops-kpis", { credentials: "same-origin" });
        if (r.ok) setK(await r.json());
      } catch {}
    })();
  }, []);
  if (!k) return null;
  const num = (n: number) => n.toLocaleString();
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-7">
      <KpiCard label="Delivered" value={num(k.delivered)} icon={CheckCircle2} iconColor="text-emerald-400" iconBg="bg-emerald-500/12" iconBorder="border-emerald-500/20" />
      <KpiCard label="Failed" value={num(k.failed)} icon={XCircle} iconColor="text-rose-400" iconBg="bg-rose-500/12" iconBorder="border-rose-500/20" />
      <KpiCard label="Dispute" value={num(k.dispute)} icon={Scale} iconColor="text-orange-400" iconBg="bg-orange-500/12" iconBorder="border-orange-500/20" />
      <KpiCard label="Takedown" value={num(k.takedown)} icon={Ban} iconColor="text-red-400" iconBg="bg-red-500/12" iconBorder="border-red-500/20" />
      <KpiCard label="Review Pending" value={num(k.reviewPending)} icon={Hourglass} iconColor="text-amber-400" iconBg="bg-amber-500/12" iconBorder="border-amber-500/20" />
      <KpiCard label="Users" value={num(k.users)} icon={Users} iconColor="text-primary" iconBg="bg-primary/12" iconBorder="border-primary/20" />
      <KpiCard label="Contracts" value={num(k.contracts)} icon={FileText} iconColor="text-sky-400" iconBg="bg-sky-500/12" iconBorder="border-sky-500/20" />
    </div>
  );
}

type DashWriter = { name: string; role: string; share: number };
type DashWork = {
  id: number; title: string;
  iswc: string | null; isrc: string | null;
  status: string;
  writers: DashWriter[];
  publisher: string | null;
  registeredWith: string[];
  mlcSongCode: string | null;
  songtrust: boolean; ascap: boolean; bmi: boolean;
  artistName: string | null;
  artistImageUrl: string | null;
  coverUrl: string | null;
};

function LatestPublishingWorksCard() {
  const [works, setWorks] = useState<DashWork[] | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending" | "rejected" | "draft">("all");

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, perPage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ limit: String(perPage), page: String(page) });
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (statusFilter !== "all") params.set("status", statusFilter);
        const r = await fetch(`/api/publishing/works?${params}`, { credentials: "same-origin" });
        if (!r.ok) { if (!cancelled) { setWorks([]); setTotal(0); } return; }
        const j = await r.json();
        if (cancelled) return;
        setWorks(Array.isArray(j?.data) ? j.data : []);
        setTotal(Number(j?.pagination?.total) || 0);
      } catch { if (!cancelled) { setWorks([]); setTotal(0); } }
    })();
    return () => { cancelled = true; };
  }, [page, perPage, debouncedSearch, statusFilter]);

  const filtered = works ?? [];

  const statusPill: Record<string, { cls: string; dot: string; label: string }> = {
    draft:      { cls: "bg-white/[0.05] text-white/75 border-white/15",          dot: "bg-white/45",     label: "draft" },
    pending:    { cls: "bg-amber-500/12 text-amber-300 border-amber-500/30",      dot: "bg-amber-400",   label: "pending" },
    registered: { cls: "bg-emerald-500/12 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400", label: "Accepted" },
    active:     { cls: "bg-emerald-500/12 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400", label: "Accepted" },
    rejected:   { cls: "bg-rose-500/12 text-rose-300 border-rose-500/30",          dot: "bg-rose-400",    label: "Conflict" },
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  const pageNums: number[] = [];
  const startP = Math.max(1, page - 2);
  const endP = Math.min(totalPages, startP + 4);
  for (let i = startP; i <= endP; i++) pageNums.push(i);

  return (
    <Card className="card-surface border-border/60 overflow-hidden">
      <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between border-b border-border/40">
        <div className="flex items-center gap-2 text-[12px] text-white/70">
          <span className="font-medium text-white">Showing {from}–{to}</span>
          <span className="text-white/40">of {total.toLocaleString()} works</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search works"
              className="h-8 w-56 rounded-md border border-border/50 bg-background/60 pl-8 pr-3 text-[12px] text-white placeholder:text-white/35 focus:outline-none focus:border-primary/60"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border/50 bg-background/60 px-2 h-8">
            <span className="text-[11px] text-white/55">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent text-[12px] text-white focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-background">All</option>
              <option value="active" className="bg-background">Accepted</option>
              <option value="pending" className="bg-background">Pending</option>
              <option value="rejected" className="bg-background">Conflict</option>
              <option value="draft" className="bg-background">Draft</option>
            </select>
          </div>
          <button className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 bg-background/60 text-[12px] text-white/75 hover:bg-accent/20">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          </button>
        </div>
      </div>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border/40 text-left text-[10px] uppercase tracking-wider text-white/45 bg-white/[0.015]">
                <th className="pl-5 pr-2 py-2.5 w-8"><input type="checkbox" className="accent-primary cursor-pointer" /></th>
                <th className="px-3 py-2.5 font-semibold">Work Title</th>
                <th className="px-3 py-2.5 font-semibold">Composer(s)</th>
                <th className="px-3 py-2.5 font-semibold">Lyricist(s)</th>
                <th className="px-3 py-2.5 font-semibold">ISRC / ISWC</th>
                <th className="px-3 py-2.5 font-semibold">PRO</th>
                <th className="px-3 py-2.5 font-semibold text-right">Share</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {works === null ? (
                <tr><td colSpan={9} className="text-center h-32 text-muted-foreground">Загрузка…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center h-32 text-muted-foreground">Произведений не найдено</td></tr>
              ) : filtered.map((w) => {
                const composers = (w.writers ?? []).filter((wr) => wr.role === "composer");
                const lyricists = (w.writers ?? []).filter((wr) => wr.role === "lyricist");
                const totalShare = (w.writers ?? []).reduce((s, x) => s + (Number.isFinite(x.share) ? x.share : 0), 0);
                const pros = [
                  ...(w.ascap ? ["ASCAP"] : []),
                  ...(w.bmi ? ["BMI"] : []),
                  ...(w.songtrust ? ["Songtrust"] : []),
                  ...(w.mlcSongCode ? ["The MLC"] : []),
                  ...(w.registeredWith ?? []),
                ];
                const renderNames = (list: DashWriter[]) => list.length === 0
                  ? <span className="text-white/30">—</span>
                  : <span className="text-white/85">{list.map((p) => p.name).join(", ")}</span>;
                const pill = statusPill[w.status] ?? statusPill.draft;
                return (
                  <tr key={w.id} className="border-b border-border/25 hover:bg-accent/10 transition-colors">
                    <td className="pl-5 pr-2 py-2.5"><input type="checkbox" className="accent-primary cursor-pointer" /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-[220px]">
                        {w.coverUrl ? (
                          <img src={w.coverUrl} alt="" className="h-8 w-8 rounded object-cover border border-border/40 flex-shrink-0" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-white/[0.05] border border-border/40 flex items-center justify-center flex-shrink-0">
                            <Music2 className="h-3.5 w-3.5 text-white/35" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">{w.title}</div>
                          {w.artistName && <div className="text-[11px] text-white/45 truncate">{w.artistName}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{renderNames(composers)}</td>
                    <td className="px-3 py-2.5">{renderNames(lyricists)}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-white/55 tabular-nums">
                      {w.isrc ?? <span className="text-white/30">—</span>}
                      {w.iswc && <div className="text-white/35">{w.iswc}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {pros.length === 0 ? <span className="text-white/30">—</span> : pros.map((p) => {
                          const pl = p.toLowerCase();
                          const cls =
                            pl === "ascap"     ? "bg-blue-500/12 text-blue-300 border-blue-500/30" :
                            pl === "bmi"       ? "bg-rose-500/12 text-rose-300 border-rose-500/30" :
                            pl === "songtrust" ? "bg-violet-500/12 text-violet-300 border-violet-500/30" :
                            pl === "the mlc" || pl === "mlc" ? "bg-emerald-500/12 text-emerald-300 border-emerald-500/30" :
                            "bg-white/[0.05] text-white/70 border-white/15";
                          return (
                            <Badge key={p} variant="outline" className={`text-[9px] px-1.5 py-0 h-4 font-bold ${cls}`}>{p}</Badge>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-white/85">{Math.round(totalShare)}%</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${pill.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-white/40 hover:text-white/80 cursor-pointer">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 px-5 py-3 border-t border-border/40 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-[12px] text-white/55">
            <span>Show</span>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(parseInt(e.target.value, 10)); setPage(1); }}
              className="h-7 rounded-md border border-border/50 bg-background/60 px-2 text-[12px] text-white focus:outline-none cursor-pointer"
            >
              <option value={10} className="bg-background">10</option>
              <option value={25} className="bg-background">25</option>
              <option value={50} className="bg-background">50</option>
            </select>
            <span>per page</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[12px] text-white/55 mr-2">{from}–{to} of {total.toLocaleString()}</span>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/50 bg-background/60 text-white/70 hover:bg-accent/20 disabled:opacity-30 disabled:cursor-not-allowed"
            ><ChevronLeft className="h-3.5 w-3.5" /></button>
            {pageNums.map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`h-7 min-w-7 px-2 inline-flex items-center justify-center rounded-md border text-[12px] ${
                  n === page
                    ? "border-primary/60 bg-primary/15 text-white font-semibold"
                    : "border-border/50 bg-background/60 text-white/70 hover:bg-accent/20"
                }`}
              >{n}</button>
            ))}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/50 bg-background/60 text-white/70 hover:bg-accent/20 disabled:opacity-30 disabled:cursor-not-allowed"
            ><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PublishingKpiRow() {
  const [k, setK] = useState<{
    accepted: number; pendingRegistrations: number; rejected: number;
    overclaims: number; royalties: number; totalWorks: number;
  } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/dashboard/publishing-kpis", { credentials: "same-origin" });
        if (r.ok) setK(await r.json());
      } catch {}
    })();
  }, []);
  if (!k) return null;
  const num = (n: number) => n.toLocaleString();
  const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
      <KpiCard label="Accepted" value={num(k.accepted)} icon={BookCheck} iconColor="text-emerald-400" iconBg="bg-emerald-500/12" iconBorder="border-emerald-500/20" />
      <KpiCard label="Pending Registrations" value={num(k.pendingRegistrations)} icon={ClipboardList} iconColor="text-amber-400" iconBg="bg-amber-500/12" iconBorder="border-amber-500/20" />
      <KpiCard label="Rejected" value={num(k.rejected)} icon={FileX} iconColor="text-rose-400" iconBg="bg-rose-500/12" iconBorder="border-rose-500/20" />
      <KpiCard label="Overclaims Tool" value={num(k.overclaims)} icon={AlertOctagon} iconColor="text-orange-400" iconBg="bg-orange-500/12" iconBorder="border-orange-500/20" />
      <KpiCard label="Publishing Royalties" value={usd(k.royalties)} icon={Coins} iconColor="text-emerald-400" iconBg="bg-emerald-500/12" iconBorder="border-emerald-500/20" />
      <KpiCard label="Total Works" value={num(k.totalWorks)} icon={Library} iconColor="text-primary" iconBg="bg-primary/12" iconBorder="border-primary/20" />
    </div>
  );
}
