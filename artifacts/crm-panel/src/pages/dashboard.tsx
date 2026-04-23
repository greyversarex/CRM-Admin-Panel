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
import { Users, Disc3, DollarSign, Activity, TrendingUp, TrendingDown, Layers, Headphones, Music2, BookMarked } from "lucide-react";
import {
  GeoStreamsCard, UgcOverviewCard, SocialViewsCard,
  TopDspCard, TopTerritoriesCard, LatestReleasesGridCard,
  TopTracksCard, RoyaltySummaryCard, ArtistsStatsTableCard,
} from "@/components/dashboard-sections";
import { getGeoStreams, getUgcOverview, getSocialBlocks, getPublishingKpis } from "@/data/dashboard-extras";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";

/* ─────────────────────────────────────────
   ROLE-SPECIFIC MOCK DATA
───────────────────────────────────────── */

// Admin / Manager — полная картина
const DATA_ADMIN = {
  summary: { totalRevenue: 24180, revenueGrowth: 9.4, totalArtists: 47, totalReleases: 183, releasesThisMonth: 6, activeDeliveries: 12 },
  kpi2Label: "Всего артистов", kpi2Value: "47", kpi2Sub: "47 активных",
  kpi3Label: "Релизы", kpi4Label: "Активных доставок",
  revenue: [
    { month: "Jun '25", dspRevenue: 8200,  publishingRevenue: 1100 },
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
  ],
  topArtists: [
    { id: "1", name: "Ансамбли Бахор",      totalStreams: 1240000, revenue: 5820, trend: 14.2 },
    { id: "2", name: "Зарина Саидова",       totalStreams: 980000,  revenue: 4110, trend:  8.7 },
    { id: "3", name: "Рустам Назаров",       totalStreams: 740000,  revenue: 3290, trend: -2.1 },
    { id: "4", name: "Камол Хасанов",        totalStreams: 620000,  revenue: 2760, trend: 22.5 },
    { id: "5", name: "Дилнавоз Юсупова",     totalStreams: 510000,  revenue: 2200, trend:  5.3 },
  ],
  statusData: [
    { status: "Delivered", count: 94 },
    { status: "Pending",   count: 31 },
    { status: "Draft",     count: 28 },
    { status: "Failed",    count:  8 },
    { status: "Takedown",  count:  4 },
  ],
  activity: [
    { id: "1", title: "Дилам мехохад — доставлен в Spotify",     description: "DDEX ERN 4.1 · 9 треков",         timestamp: "2026-04-13T10:22:00Z" },
    { id: "2", title: "Новый артист: Камол Хасанов",             description: "Добавлен в каталог",              timestamp: "2026-04-12T16:45:00Z" },
    { id: "3", title: "Royhati Avval EP — на модерации",         description: "Ожидает проверки QC",             timestamp: "2026-04-11T09:10:00Z" },
    { id: "4", title: "Выплата $3,290 — Март 2026",              description: "Обработана и отправлена",         timestamp: "2026-04-10T14:30:00Z" },
    { id: "5", title: "Новый лейбл: Садо Records",               description: "Подписан договор с лейблом",      timestamp: "2026-04-09T11:00:00Z" },
  ],
};

// Label (Звук Азии Records) — только своё
const DATA_LABEL = {
  summary: { totalRevenue: 12400, revenueGrowth: 7.1, totalArtists: 8, totalReleases: 42, releasesThisMonth: 2, activeDeliveries: 5, totalStreams: 2840000, streamsGrowth: 11.3 },
  kpi2Label: "Стримы лейбла", kpi2Value: "2.84M", kpi2Sub: "+11.3% за месяц",
  kpi3Label: "Мои релизы", kpi4Label: "Доставок (мои)",
  labelTracks: [
    { id: "1", title: "Дилам мехохад",  artist: "Ансамбли Бахор", streams: 482000, revenue: 1820, trend: 12.4, dsp: "Spotify" },
    { id: "2", title: "Бахор омад",     artist: "Ансамбли Бахор", streams: 364000, revenue: 1410, trend:  8.1, dsp: "Apple Music" },
    { id: "3", title: "Шаби нав",       artist: "Камол Хасанов",  streams: 287000, revenue: 1090, trend: 22.5, dsp: "YouTube Music" },
    { id: "4", title: "Гулҳои сурх",    artist: "Нилуфар Рашид",  streams: 198000, revenue:  760, trend:  3.2, dsp: "Spotify" },
    { id: "5", title: "Дустони ман",    artist: "Ансамбли Бахор", streams: 124000, revenue:  470, trend:  5.9, dsp: "TikTok" },
  ],
  playlists: [
    { id: "1", name: "Tajik Hits 2026",       curator: "Spotify Editorial", reach: 845000, addedTracks: 4, type: "Editorial",  delta: "+2 на этой неделе" },
    { id: "2", name: "Central Asia Top",      curator: "Apple Music",       reach: 412000, addedTracks: 2, type: "Editorial",  delta: "+1 новая" },
    { id: "3", name: "Yangi Tojikiston",      curator: "Yandex Music",      reach: 198000, addedTracks: 3, type: "Algorithmic", delta: "—" },
    { id: "4", name: "Discover Weekly TJ",    curator: "Spotify",           reach: 156000, addedTracks: 1, type: "Algorithmic", delta: "Новый" },
  ],
  trends: [
    { label: "Рост стримов",        value: "+11.3%", up: true,  hint: "за последние 30 дней" },
    { label: "Новые слушатели",     value: "+18.7%", up: true,  hint: "уник. за месяц" },
    { label: "Save Rate",           value: "12.4%",  up: true,  hint: "выше среднего по жанру" },
    { label: "Skip Rate",           value: "21.8%",  up: false, hint: "ниже = лучше" },
  ],
  revenue: [
    { month: "Jun '25", dspRevenue: 3800, publishingRevenue: 500 },
    { month: "Jul '25", dspRevenue: 5200, publishingRevenue: 620 },
    { month: "Aug '25", dspRevenue: 8100, publishingRevenue: 940 },
    { month: "Sep '25", dspRevenue: 7400, publishingRevenue: 1100 },
    { month: "Oct '25", dspRevenue: 8600, publishingRevenue: 1350 },
    { month: "Nov '25", dspRevenue: 7900, publishingRevenue: 1600 },
    { month: "Dec '25", dspRevenue: 6800, publishingRevenue: 1750 },
    { month: "Jan '26", dspRevenue: 6300, publishingRevenue: 1600 },
    { month: "Feb '26", dspRevenue: 7100, publishingRevenue: 1800 },
    { month: "Mar '26", dspRevenue: 7900, publishingRevenue: 2000 },
    { month: "Apr '26", dspRevenue: 7400, publishingRevenue: 2100 },
  ],
  topArtists: [
    { id: "1", name: "Ансамбли Бахор",  totalStreams: 1240000, revenue: 5820, trend: 14.2 },
    { id: "2", name: "Камол Хасанов",   totalStreams: 620000,  revenue: 2760, trend: 22.5 },
    { id: "3", name: "Нилуфар Рашид",   totalStreams: 310000,  revenue: 1380, trend:  3.8 },
  ],
  statusData: [
    { status: "Delivered", count: 22 },
    { status: "Pending",   count: 10 },
    { status: "Draft",     count:  7 },
    { status: "Failed",    count:  2 },
    { status: "Takedown",  count:  1 },
  ],
  activity: [
    { id: "1", title: "Ансамбли Бахор — доставлен в Apple Music", description: "ERN 4.1 · 7 треков",            timestamp: "2026-04-13T10:22:00Z" },
    { id: "2", title: "Новый релиз: Камол Хасанов — «Шаби нав»", description: "На рассмотрении",               timestamp: "2026-04-11T14:00:00Z" },
    { id: "3", title: "Выплата $2,100 — Март 2026",               description: "Отправлена на ваш счёт",        timestamp: "2026-04-10T09:30:00Z" },
    { id: "4", title: "Нилуфар Рашид — первый релиз",             description: "Добавлен в каталог лейбла",     timestamp: "2026-04-08T12:00:00Z" },
  ],
};

// Artist (Ансамбли Бахор) — только свои данные
const DATA_ARTIST = {
  summary: { totalRevenue: 5820, revenueGrowth: 14.2, totalArtists: 1, totalReleases: 12, releasesThisMonth: 1, activeDeliveries: 3 },
  kpi2Label: "Мои стримы", kpi2Value: "1.24M", kpi2Sub: "+8.3% за месяц",
  kpi3Label: "Мои релизы", kpi4Label: "Активных доставок",
  revenue: [
    { month: "Jun '25", dspRevenue: 480,  publishingRevenue: 60 },
    { month: "Jul '25", dspRevenue: 620,  publishingRevenue: 80 },
    { month: "Aug '25", dspRevenue: 910,  publishingRevenue: 120 },
    { month: "Sep '25", dspRevenue: 840,  publishingRevenue: 180 },
    { month: "Oct '25", dspRevenue: 970,  publishingRevenue: 210 },
    { month: "Nov '25", dspRevenue: 890,  publishingRevenue: 250 },
    { month: "Dec '25", dspRevenue: 760,  publishingRevenue: 280 },
    { month: "Jan '26", dspRevenue: 720,  publishingRevenue: 260 },
    { month: "Feb '26", dspRevenue: 810,  publishingRevenue: 290 },
    { month: "Mar '26", dspRevenue: 920,  publishingRevenue: 320 },
    { month: "Apr '26", dspRevenue: 860,  publishingRevenue: 340 },
  ],
  myTracks: [
    { id: "1", title: "Дилам мехохад",  streams: 482000, trend: 12.4, dsp: "Spotify" },
    { id: "2", title: "Бахор омад",     streams: 364000, trend:  8.1, dsp: "Apple Music" },
    { id: "3", title: "Модари азиз",    streams: 198000, trend:  3.2, dsp: "YouTube Music" },
    { id: "4", title: "Дустони ман",    streams: 124000, trend:  5.9, dsp: "TikTok" },
    { id: "5", title: "Шаби тирамох",   streams:  72000, trend: -1.4, dsp: "Yandex" },
  ],
  statusData: [
    { status: "Delivered", count: 7 },
    { status: "Pending",   count: 3 },
    { status: "Draft",     count: 1 },
    { status: "Failed",    count: 1 },
  ],
  activity: [
    { id: "1", title: "«Дилам мехохад» достиг 482K стримов",   description: "Рост +12.4% за неделю",          timestamp: "2026-04-13T10:22:00Z" },
    { id: "2", title: "«Бахор омад» добавлен в Apple плейлист", description: "Таджикская музыка — Топ 50",     timestamp: "2026-04-11T16:00:00Z" },
    { id: "3", title: "Выплата $920 — Март 2026",               description: "Зачислена на ваш счёт",          timestamp: "2026-04-10T09:30:00Z" },
    { id: "4", title: "Новый сингл одобрен",                   description: "«Шаби тирамох» — на доставке",   timestamp: "2026-04-08T12:00:00Z" },
  ],
};

export default function Dashboard() {
  const { data: summaryRaw } = useGetDashboardSummary();
  const { data: revenueRaw } = useGetDashboardRevenueByMonth();
  const { data: activityRaw } = useGetDashboardRecentActivity();
  const { data: topArtistsRaw } = useGetDashboardTopArtists();
  const { data: statusRaw } = useGetDashboardReleasesByStatus();
  const { t } = useLang();
  const d = t.dashboard;
  const { user } = useAuth();
  const role = user?.role ?? "admin";

  // Select role-specific dataset
  const roleData = role === "artist" ? DATA_ARTIST : role === "label" ? DATA_LABEL : DATA_ADMIN;

  const summary    = summaryRaw ?? roleData.summary;
  const revenueData = (revenueRaw && revenueRaw.length > 0) ? revenueRaw : roleData.revenue;
  const statusData  = (statusRaw  && statusRaw.length  > 0) ? statusRaw  : roleData.statusData;
  const activityData = (activityRaw && activityRaw.length > 0) ? activityRaw : roleData.activity;
  const topArtistsData = role === "artist"
    ? []
    : (topArtistsRaw && topArtistsRaw.length > 0) ? topArtistsRaw : (roleData as typeof DATA_ADMIN).topArtists;
  const myTracks = role === "artist" ? DATA_ARTIST.myTracks : [];

  // Scope badge shown for label / artist
  const scopeBadge = role === "label"
    ? (user?.orgName ?? "Лейбл")
    : role === "artist"
    ? (user?.orgName ?? user?.name ?? "Артист")
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
                  {ROLE_LABELS[role]} · только мои данные
                </Badge>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {role === "artist"
                ? "Ваш персональный обзор релизов и доходов"
                : role === "label"
                ? "Обзор каталога и доходов вашего лейбла"
                : d.subtitle}
            </p>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            label={role === "artist" ? "Мой доход" : role === "label" ? "Доход лейбла" : d.total_revenue}
            value={`$${(summaryRaw?.totalRevenue ?? roleData.summary.totalRevenue).toLocaleString()}`}
            icon={DollarSign}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/12"
            iconBorder="border-emerald-500/20"
            trend={{ value: `+${roleData.summary.revenueGrowth}%`, up: true, label: "vs last period" }}
          />
          <KpiCard
            label={roleData.kpi2Label}
            value={roleData.kpi2Value}
            icon={role === "artist" ? Headphones : Users}
            iconColor="text-primary"
            iconBg="bg-primary/12"
            iconBorder="border-primary/20"
            trend={{ value: roleData.kpi2Sub, up: undefined }}
          />
          <KpiCard
            label={roleData.kpi3Label}
            value={(summaryRaw?.totalReleases ?? roleData.summary.totalReleases).toLocaleString()}
            icon={role === "artist" ? Music2 : Disc3}
            iconColor="text-violet-400"
            iconBg="bg-violet-500/12"
            iconBorder="border-violet-500/20"
            trend={{ value: `+${roleData.summary.releasesThisMonth}`, up: true, label: "this month" }}
          />
          <KpiCard
            label={roleData.kpi4Label}
            value={(summaryRaw?.activeDeliveries ?? roleData.summary.activeDeliveries).toLocaleString()}
            icon={Activity}
            iconColor="text-sky-400"
            iconBg="bg-sky-500/12"
            iconBorder="border-sky-500/20"
            trend={{ value: role === "admin" || role === "manager" ? "9/10 DSPs" : "В обработке", up: undefined }}
          />
          <KpiCard
            label="Publishing"
            value={getPublishingKpis(role).totalWorks.toLocaleString()}
            icon={BookMarked}
            iconColor="text-cyan-400"
            iconBg="bg-cyan-500/12"
            iconBorder="border-cyan-500/20"
            trend={{ value: `$${getPublishingKpis(role).publishingRoyalties.toLocaleString()}`, up: true, label: "роялти" }}
          />
        </div>

        {/* ── Charts row ── */}
        <div className="grid gap-4 lg:grid-cols-7">
          <Card className="col-span-4 card-surface border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                {role === "artist" ? "Мои доходы по месяцам" : d.revenue_overview}
              </CardTitle>
              <CardDescription className="text-[12px]">
                {role === "artist" ? "DSP-доходы vs Publishing-доходы" : d.revenue_subtitle}
              </CardDescription>
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

          {/* Right panel: Top Artists (admin/manager/label) or My Tracks (artist) */}
          <Card className="col-span-3 card-surface border-border/60 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                {role === "artist" ? "Мои треки" : d.top_artists}
              </CardTitle>
              <CardDescription className="text-[12px]">
                {role === "artist" ? "По стримам за этот месяц" : d.top_artists_subtitle}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto px-4">
              {role === "artist" ? (
                <div className="space-y-1">
                  {myTracks.map((track, i) => (
                    <div key={track.id} className="flex items-center gap-3 py-2 border-b border-border/25 last:border-0 hover:bg-white/[0.025] rounded-lg px-1 transition-colors cursor-default">
                      <span className="text-[11px] font-bold text-muted-foreground/35 w-4 text-right shrink-0">{i + 1}</span>
                      <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                        <Music2 className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate">{track.title}</p>
                        <p className="text-[10px] text-muted-foreground">{(track.streams / 1000).toFixed(0)}K стримов · {track.dsp}</p>
                      </div>
                      <p className={`text-[11px] font-semibold flex items-center gap-0.5 ${track.trend > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {track.trend > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                        {track.trend > 0 ? "+" : ""}{track.trend}%
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
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
              <CardTitle className="text-base font-semibold">
                {role === "artist" ? "Мои релизы по статусу" : d.recent_releases}
              </CardTitle>
              <CardDescription className="text-[12px]">
                {role === "artist" ? "Статистика ваших релизов" : d.recent_releases_subtitle}
              </CardDescription>
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
                <CardTitle className="text-base font-semibold">
                  {role === "artist" ? "Моя активность" : role === "label" ? "Активность лейбла" : "Recent Activity"}
                </CardTitle>
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

        {/* ── Label-only sections ── */}
        {role === "label" && (
          <>
            {/* Trends */}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {DATA_LABEL.trends.map((tr) => (
                <Card key={tr.label} className="card-surface border-border/60">
                  <CardContent className="p-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{tr.label}</p>
                    <div className="flex items-baseline gap-2 mt-1.5">
                      <p className={`text-2xl font-bold ${tr.up ? "text-emerald-400" : "text-rose-400"}`}>{tr.value}</p>
                      {tr.up ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-rose-400" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{tr.hint}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-7">
              {/* Tracks of the label */}
              <Card className="col-span-4 card-surface border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Треки лейбла</CardTitle>
                  <CardDescription className="text-[12px]">Топ по стримам за этот месяц</CardDescription>
                </CardHeader>
                <CardContent className="px-4">
                  <div className="space-y-1">
                    {DATA_LABEL.labelTracks.map((tr, i) => (
                      <div key={tr.id} className="flex items-center gap-3 py-2 border-b border-border/25 last:border-0 hover:bg-white/[0.025] rounded-lg px-1">
                        <span className="text-[11px] font-bold text-muted-foreground/35 w-4 text-right shrink-0">{i + 1}</span>
                        <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                          <Music2 className="h-3.5 w-3.5 text-violet-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate">{tr.title}</p>
                          <p className="text-[10px] text-muted-foreground">{tr.artist} · {tr.dsp}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[12px] font-semibold">{(tr.streams / 1000).toFixed(0)}K</p>
                          <p className={`text-[10px] font-medium flex items-center justify-end gap-0.5 ${tr.trend > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {tr.trend > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                            {tr.trend > 0 ? "+" : ""}{tr.trend}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Playlists */}
              <Card className="col-span-3 card-surface border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Плейлисты</CardTitle>
                  <CardDescription className="text-[12px]">Куда попали треки лейбла</CardDescription>
                </CardHeader>
                <CardContent className="px-4">
                  <div className="space-y-1">
                    {DATA_LABEL.playlists.map((pl) => (
                      <div key={pl.id} className="flex items-start gap-3 py-2.5 border-b border-border/25 last:border-0 hover:bg-white/[0.025] rounded-lg px-1">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-violet-500/15 border border-primary/20 flex items-center justify-center shrink-0">
                          <Headphones className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[12px] font-medium truncate">{pl.name}</p>
                            <Badge variant="outline" className={`text-[9px] px-1 py-0 ${pl.type === "Editorial" ? "border-amber-500/30 text-amber-400 bg-amber-500/10" : "border-cyan-500/30 text-cyan-400 bg-cyan-500/10"}`}>
                              {pl.type}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{pl.curator} · охват {(pl.reach / 1000).toFixed(0)}K</p>
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                            <span className="text-primary font-semibold">{pl.addedTracks} трек(ов)</span> · {pl.delta}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

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

            {/* Top Tracks + Royalty Summary + Earnings donut */}
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

        {/* ── Гео-распределение (все роли) ── */}
        <GeoStreamsCard data={getGeoStreams(role)} />

        {/* ── UGC обзор ── */}
        <UgcOverviewCard data={getUgcOverview(role)} />

        {/* ── Соцсети ── */}
        <SocialViewsCard blocks={getSocialBlocks(role)} />
      </div>
    </Layout>
  );
}
