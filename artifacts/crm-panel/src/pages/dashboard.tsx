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
import { Users, Disc3, DollarSign, Activity, TrendingUp, TrendingDown, Layers } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLang } from "@/lib/i18n";

const FALLBACK_SUMMARY = {
  totalRevenue: 24180,
  revenueGrowth: 9.4,
  totalArtists: 47,
  totalReleases: 183,
  releasesThisMonth: 6,
  activeDeliveries: 12,
};

const FALLBACK_REVENUE: Array<{ month: string; dspRevenue: number; publishingRevenue: number }> = [
  { month: "Jun '25", dspRevenue: 8200, publishingRevenue: 1100 },
  { month: "Jul '25", dspRevenue: 11400, publishingRevenue: 1400 },
  { month: "Aug '25", dspRevenue: 17200, publishingRevenue: 2100 },
  { month: "Sep '25", dspRevenue: 15800, publishingRevenue: 2800 },
  { month: "Oct '25", dspRevenue: 17900, publishingRevenue: 3200 },
  { month: "Nov '25", dspRevenue: 16400, publishingRevenue: 3800 },
  { month: "Dec '25", dspRevenue: 14200, publishingRevenue: 4100 },
  { month: "Jan '26", dspRevenue: 13600, publishingRevenue: 3700 },
  { month: "Feb '26", dspRevenue: 15100, publishingRevenue: 4200 },
  { month: "Mar '26", dspRevenue: 16800, publishingRevenue: 4600 },
  { month: "Apr '26", dspRevenue: 15600, publishingRevenue: 4900 },
];

const FALLBACK_TOP_ARTISTS = [
  { id: "1", name: "Ансамбли Бахор", totalStreams: 1240000, revenue: 5820, trend: 14.2, imageUrl: "" },
  { id: "2", name: "Зарина Саидова", totalStreams: 980000, revenue: 4110, trend: 8.7, imageUrl: "" },
  { id: "3", name: "Рустам Назаров", totalStreams: 740000, revenue: 3290, trend: -2.1, imageUrl: "" },
  { id: "4", name: "Камол Хасанов", totalStreams: 620000, revenue: 2760, trend: 22.5, imageUrl: "" },
  { id: "5", name: "Дилнавоз Юсупова", totalStreams: 510000, revenue: 2200, trend: 5.3, imageUrl: "" },
];

const FALLBACK_STATUS_DATA = [
  { status: "Delivered", count: 94 },
  { status: "Pending", count: 31 },
  { status: "Draft", count: 28 },
  { status: "Failed", count: 8 },
  { status: "Takedown", count: 4 },
];

const FALLBACK_ACTIVITY = [
  { id: "1", title: "Дилам мехохад — доставлен в Spotify", description: "DDEX ERN 4.1 · 9 треков", timestamp: "2026-04-13T10:22:00Z" },
  { id: "2", title: "Новый артист: Камол Хасанов", description: "Добавлен в каталог", timestamp: "2026-04-12T16:45:00Z" },
  { id: "3", title: "Royhati Avval EP — на модерации", description: "Ожидает проверки QC", timestamp: "2026-04-11T09:10:00Z" },
  { id: "4", title: "Выплата $3,290 — Март 2026", description: "Обработана и отправлена", timestamp: "2026-04-10T14:30:00Z" },
];

export default function Dashboard() {
  const { data: summaryRaw } = useGetDashboardSummary();
  const { data: revenueRaw } = useGetDashboardRevenueByMonth();
  const { data: activityRaw } = useGetDashboardRecentActivity();
  const { data: topArtistsRaw } = useGetDashboardTopArtists();
  const { data: statusRaw } = useGetDashboardReleasesByStatus();
  const { t } = useLang();
  const d = t.dashboard;

  const summary = summaryRaw ?? FALLBACK_SUMMARY;
  const revenueData = (revenueRaw && revenueRaw.length > 0) ? revenueRaw : FALLBACK_REVENUE;
  const topArtistsData = (topArtistsRaw && topArtistsRaw.length > 0) ? topArtistsRaw : FALLBACK_TOP_ARTISTS;
  const statusData = (statusRaw && statusRaw.length > 0) ? statusRaw : FALLBACK_STATUS_DATA;
  const activityData = (activityRaw && activityRaw.length > 0) ? activityRaw : FALLBACK_ACTIVITY;

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* ── Page Header ── */}
        <div className="flex items-start justify-between">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <h1 className="text-2xl font-bold tracking-tight">{d.title}</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">{d.subtitle}</p>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label={d.total_revenue}
            value={`$${summary.totalRevenue.toLocaleString()}`}
            icon={DollarSign}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/12"
            iconBorder="border-emerald-500/20"
            trend={{ value: `+${summary.revenueGrowth}%`, up: true, label: "vs last period" }}
          />
          <KpiCard
            label={d.total_artists}
            value={summary.totalArtists.toLocaleString()}
            icon={Users}
            iconColor="text-primary"
            iconBg="bg-primary/12"
            iconBorder="border-primary/20"
            trend={{ value: "47 active", up: undefined }}
          />
          <KpiCard
            label={d.total_releases}
            value={summary.totalReleases.toLocaleString()}
            icon={Disc3}
            iconColor="text-violet-400"
            iconBg="bg-violet-500/12"
            iconBorder="border-violet-500/20"
            trend={{ value: `+${summary.releasesThisMonth}`, up: true, label: "this month" }}
          />
          <KpiCard
            label={d.active_deliveries}
            value={summary.activeDeliveries.toLocaleString()}
            icon={Activity}
            iconColor="text-sky-400"
            iconBg="bg-sky-500/12"
            iconBorder="border-sky-500/20"
            trend={{ value: "9/10 DSPs", up: undefined }}
          />
        </div>

        {/* ── Charts row ── */}
        <div className="grid gap-4 lg:grid-cols-7">
          <Card className="col-span-4 card-surface border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{d.revenue_overview}</CardTitle>
              <CardDescription className="text-[12px]">{d.revenue_subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="pl-1">
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-3 card-surface border-border/60 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{d.top_artists}</CardTitle>
              <CardDescription className="text-[12px]">{d.top_artists_subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto px-4">
              <div className="space-y-1">
                {topArtistsData.map((artist, i) => (
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
                        {artist.trend > 0
                          ? <TrendingUp className="h-2.5 w-2.5" />
                          : <TrendingDown className="h-2.5 w-2.5" />}
                        {artist.trend > 0 ? "+" : ""}{artist.trend}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
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
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="hsl(var(--border) / 0.4)" />
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="status"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      tickFormatter={(v) => v.replace(/_/g, " ")}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "10px", fontSize: "12px" }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 5, 5, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-4 card-surface border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground/60" />
                <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {activityData.map((item) => (
                  <div key={item.id} className="flex gap-3 items-start py-3 border-b border-border/25 last:border-0">
                    <div className="mt-1.5 shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.6)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[12px] font-medium leading-snug">{item.title}</p>
                        <time className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">
                          {new Date(item.timestamp).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
                        </time>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
