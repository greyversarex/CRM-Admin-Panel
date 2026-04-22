import { Layout } from "@/components/layout";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Play, Music, Youtube, Radio, DollarSign } from "lucide-react";
import { useGetDashboardRevenueByMonth } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

/* ── Role-specific analytics data ── */
const ANALYTICS = {
  admin: {
    kpi: { streams: "3.34M", streamTrend: "+15.2%", revenue: "$24,180", revTrend: "+9.4%", tracks: "1,247", trackChange: "+32", ugc: "21,400", ugcTrend: "+17.6%" },
    streamsByDSP: [
      { name: "Spotify", streams: 1840000, color: "#1DB954", share: 42 },
      { name: "Apple Music", streams: 920000, color: "#FC3C44", share: 21 },
      { name: "YouTube Music", streams: 680000, color: "#FF0000", share: 16 },
      { name: "TikTok", streams: 430000, color: "#69C9D0", share: 10 },
      { name: "Yandex", streams: 290000, color: "#FFCC00", share: 7 },
      { name: "Other", streams: 180000, color: "#6B7280", share: 4 },
    ],
    streamsTrend: [
      { month: "Nov", streams: 2100000 }, { month: "Dec", streams: 2450000 },
      { month: "Jan", streams: 2280000 }, { month: "Feb", streams: 2650000 },
      { month: "Mar", streams: 2900000 }, { month: "Apr", streams: 3340000 },
    ],
    topTracks: [
      { rank: 1, title: "Дилам мехохад",  artist: "Давлатмандов Ш.",  streams: 482000, trend: 12.4, dsp: "Spotify" },
      { rank: 2, title: "Бахор омад",      artist: "Рустам Назаров",   streams: 364000, trend:  8.1, dsp: "Apple Music" },
      { rank: 3, title: "Ишки ман",        artist: "Зарина Саидова",   streams: 298000, trend: -2.3, dsp: "Spotify" },
      { rank: 4, title: "Шаби нав",        artist: "Камол Хасанов",    streams: 241000, trend:  5.7, dsp: "TikTok" },
      { rank: 5, title: "Модари азиз",     artist: "Ансамбл Бахор",    streams: 198000, trend:  3.2, dsp: "YouTube" },
    ],
    geoData: [
      { country: "Таджикистан", streams: 1240000, flag: "🇹🇯", share: 37 },
      { country: "Россия",      streams:  890000, flag: "🇷🇺", share: 27 },
      { country: "Афганистан",  streams:  340000, flag: "🇦🇫", share: 10 },
      { country: "Узбекистан",  streams:  280000, flag: "🇺🇿", share: 8  },
      { country: "Германия",    streams:  190000, flag: "🇩🇪", share: 6  },
      { country: "Другие",      streams:  400000, flag: "🌍",  share: 12 },
    ],
    ugcData: [
      { month: "Nov", claims: 12400 }, { month: "Dec", claims: 14200 },
      { month: "Jan", claims: 11800 }, { month: "Feb", claims: 15600 },
      { month: "Mar", claims: 18200 }, { month: "Apr", claims: 21400 },
    ],
    tiktokData: [
      { month: "Nov", videos: 3200 }, { month: "Dec", videos: 4800 },
      { month: "Jan", videos: 3900 }, { month: "Feb", videos: 5600 },
      { month: "Mar", videos: 7200 }, { month: "Apr", videos: 9400 },
    ],
    playlists: [
      { playlist: "Tajik Hits",           dsp: "Spotify",     tracks: 8, followers: "42K",  type: "Editorial" },
      { playlist: "Central Asian Pop",    dsp: "Apple Music", tracks: 5, followers: "28K",  type: "Editorial" },
      { playlist: "Discover Weekly",      dsp: "Spotify",     tracks: 12, followers: "—",   type: "Algorithmic" },
      { playlist: "Чарты Таджикистана",   dsp: "Yandex",      tracks: 6, followers: "19K",  type: "Editorial" },
      { playlist: "New Music Friday",     dsp: "Apple Music", tracks: 3, followers: "180K", type: "Editorial" },
      { playlist: "Made for You",         dsp: "Spotify",     tracks: 9, followers: "—",    type: "Algorithmic" },
    ],
  },
  label: {
    kpi: { streams: "1.62M", streamTrend: "+9.4%", revenue: "$12,400", revTrend: "+7.1%", tracks: "186", trackChange: "+8", ugc: "8,240", ugcTrend: "+12.1%" },
    streamsByDSP: [
      { name: "Spotify", streams: 680000, color: "#1DB954", share: 42 },
      { name: "Apple Music", streams: 340000, color: "#FC3C44", share: 21 },
      { name: "YouTube Music", streams: 260000, color: "#FF0000", share: 16 },
      { name: "TikTok", streams: 160000, color: "#69C9D0", share: 10 },
      { name: "Yandex", streams: 110000, color: "#FFCC00", share: 7 },
      { name: "Other", streams:  70000, color: "#6B7280", share: 4 },
    ],
    streamsTrend: [
      { month: "Nov", streams: 900000 }, { month: "Dec", streams: 1080000 },
      { month: "Jan", streams: 980000 }, { month: "Feb", streams: 1190000 },
      { month: "Mar", streams: 1360000 }, { month: "Apr", streams: 1620000 },
    ],
    topTracks: [
      { rank: 1, title: "Дилам мехохад",  artist: "Ансамбли Бахор", streams: 482000, trend: 12.4, dsp: "Spotify" },
      { rank: 2, title: "Модари азиз",    artist: "Ансамбли Бахор", streams: 198000, trend:  3.2, dsp: "YouTube" },
      { rank: 3, title: "Шаби нав",       artist: "Камол Хасанов",  streams: 241000, trend:  5.7, dsp: "TikTok" },
      { rank: 4, title: "Гули сафед",     artist: "Нилуфар Рашид",  streams:  94000, trend:  8.1, dsp: "Apple Music" },
    ],
    geoData: [
      { country: "Таджикистан", streams: 600000, flag: "🇹🇯", share: 40 },
      { country: "Россия",      streams: 400000, flag: "🇷🇺", share: 26 },
      { country: "Афганистан",  streams: 130000, flag: "🇦🇫", share: 9 },
      { country: "Узбекистан",  streams: 120000, flag: "🇺🇿", share: 8 },
      { country: "Германия",    streams:  80000, flag: "🇩🇪", share: 5 },
      { country: "Другие",      streams: 180000, flag: "🌍",  share: 12 },
    ],
    ugcData: [
      { month: "Nov", claims: 4800 }, { month: "Dec", claims: 5400 },
      { month: "Jan", claims: 4600 }, { month: "Feb", claims: 6100 },
      { month: "Mar", claims: 7100 }, { month: "Apr", claims: 8240 },
    ],
    tiktokData: [
      { month: "Nov", videos: 1200 }, { month: "Dec", videos: 1800 },
      { month: "Jan", videos: 1500 }, { month: "Feb", videos: 2100 },
      { month: "Mar", videos: 2800 }, { month: "Apr", videos: 3600 },
    ],
    playlists: [
      { playlist: "Tajik Hits",         dsp: "Spotify",     tracks: 4, followers: "42K", type: "Editorial" },
      { playlist: "Discover Weekly",    dsp: "Spotify",     tracks: 5, followers: "—",   type: "Algorithmic" },
      { playlist: "Чарты Таджикистана", dsp: "Yandex",      tracks: 3, followers: "19K", type: "Editorial" },
      { playlist: "Made for You",       dsp: "Spotify",     tracks: 4, followers: "—",   type: "Algorithmic" },
    ],
  },
  artist: {
    kpi: { streams: "1.24M", streamTrend: "+14.2%", revenue: "$5,820", revTrend: "+8.3%", tracks: "12", trackChange: "+1", ugc: "3,120", ugcTrend: "+21.4%" },
    streamsByDSP: [
      { name: "Spotify",      streams: 520000, color: "#1DB954", share: 42 },
      { name: "Apple Music",  streams: 260000, color: "#FC3C44", share: 21 },
      { name: "YouTube Music",streams: 198000, color: "#FF0000", share: 16 },
      { name: "TikTok",       streams: 124000, color: "#69C9D0", share: 10 },
      { name: "Yandex",       streams:  87000, color: "#FFCC00", share: 7  },
      { name: "Other",        streams:  51000, color: "#6B7280", share: 4  },
    ],
    streamsTrend: [
      { month: "Nov", streams: 720000 }, { month: "Dec", streams: 860000 },
      { month: "Jan", streams: 800000 }, { month: "Feb", streams: 960000 },
      { month: "Mar", streams: 1090000 }, { month: "Apr", streams: 1240000 },
    ],
    topTracks: [
      { rank: 1, title: "Дилам мехохад",  artist: "Ансамбли Бахор", streams: 482000, trend: 12.4, dsp: "Spotify" },
      { rank: 2, title: "Бахор омад",     artist: "Ансамбли Бахор", streams: 364000, trend:  8.1, dsp: "Apple Music" },
      { rank: 3, title: "Модари азиз",    artist: "Ансамбли Бахор", streams: 198000, trend:  3.2, dsp: "YouTube" },
      { rank: 4, title: "Дустони ман",    artist: "Ансамбли Бахор", streams: 124000, trend:  5.9, dsp: "TikTok" },
      { rank: 5, title: "Шаби тирамох",   artist: "Ансамбли Бахор", streams:  72000, trend: -1.4, dsp: "Yandex" },
    ],
    geoData: [
      { country: "Таджикистан", streams: 480000, flag: "🇹🇯", share: 42 },
      { country: "Россия",      streams: 297000, flag: "🇷🇺", share: 26 },
      { country: "Афганистан",  streams: 103000, flag: "🇦🇫", share: 9 },
      { country: "Узбекистан",  streams:  91000, flag: "🇺🇿", share: 8 },
      { country: "Германия",    streams:  57000, flag: "🇩🇪", share: 5 },
      { country: "Другие",      streams: 112000, flag: "🌍",  share: 10 },
    ],
    ugcData: [
      { month: "Nov", claims: 840 },  { month: "Dec", claims: 1020 },
      { month: "Jan", claims: 870 },  { month: "Feb", claims: 1340 },
      { month: "Mar", claims: 1980 }, { month: "Apr", claims: 3120 },
    ],
    tiktokData: [
      { month: "Nov", videos: 420 }, { month: "Dec", videos: 680 },
      { month: "Jan", videos: 540 }, { month: "Feb", videos: 920 },
      { month: "Mar", videos: 1340 }, { month: "Apr", videos: 1980 },
    ],
    playlists: [
      { playlist: "Tajik Hits",       dsp: "Spotify",  tracks: 3, followers: "42K", type: "Editorial" },
      { playlist: "Discover Weekly",  dsp: "Spotify",  tracks: 4, followers: "—",   type: "Algorithmic" },
      { playlist: "Made for You",     dsp: "Spotify",  tracks: 3, followers: "—",   type: "Algorithmic" },
    ],
  },
};

export default function Analytics() {
  const [period, setPeriod] = useState("6m");
  const { data: revenueDataRaw, isLoading: revenueLoading } = useGetDashboardRevenueByMonth();
  const { t } = useLang();
  const a = t.analytics;
  const { user } = useAuth();
  const role = user?.role ?? "admin";
  const D = role === "artist" ? ANALYTICS.artist : role === "label" ? ANALYTICS.label : ANALYTICS.admin;

  const scopeBadge = role === "label"
    ? (user?.orgName ?? "Лейбл")
    : role === "artist" ? (user?.orgName ?? user?.name ?? "Артист")
    : null;

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{a.title}</h1>
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
              {role === "artist" ? "Ваша персональная аналитика стримов и доходов"
               : role === "label" ? "Аналитика по каталогу вашего лейбла"
               : a.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-36 bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">{t.common.period["1m"]}</SelectItem>
                <SelectItem value="3m">{t.common.period["3m"]}</SelectItem>
                <SelectItem value="6m">{t.common.period["6m"]}</SelectItem>
                <SelectItem value="1y">{t.common.period["1y"]}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="bg-card">
              <Download className="mr-2 h-4 w-4" />
              {t.common.export}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label={role === "artist" ? "Мои стримы" : role === "label" ? "Стримы лейбла" : a.total_streams}
            value={D.kpi.streams}
            icon={Play}
            iconColor="text-primary"
            iconBg="bg-primary/12"
            iconBorder="border-primary/20"
            trend={{ value: D.kpi.streamTrend, up: true, label: "vs last period" }}
          />
          <KpiCard
            label={role === "artist" ? "Мой доход" : role === "label" ? "Доход лейбла" : a.total_revenue}
            value={D.kpi.revenue}
            icon={DollarSign}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/12"
            iconBorder="border-emerald-500/20"
            trend={{ value: D.kpi.revTrend, up: true, label: "vs last period" }}
          />
          <KpiCard
            label={role === "artist" ? "Мои треки" : a.active_tracks}
            value={D.kpi.tracks}
            icon={Music}
            iconColor="text-violet-400"
            iconBg="bg-violet-500/12"
            iconBorder="border-violet-500/20"
            trend={{ value: `${D.kpi.trackChange} this month`, up: true }}
          />
          <KpiCard
            label={a.ugc_claims}
            value={D.kpi.ugc}
            icon={Youtube}
            iconColor="text-red-400"
            iconBg="bg-red-500/12"
            iconBorder="border-red-500/20"
            trend={{ value: D.kpi.ugcTrend, up: true, label: "vs last period" }}
          />
        </div>

        <Tabs defaultValue="streams" className="w-full">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1 flex flex-wrap">
            <TabsTrigger value="streams" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{a.tabs.streams}</TabsTrigger>
            <TabsTrigger value="revenue" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{a.tabs.revenue}</TabsTrigger>
            <TabsTrigger value="geo" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{a.tabs.geo}</TabsTrigger>
            <TabsTrigger value="ugc" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{a.tabs.ugc}</TabsTrigger>
            <TabsTrigger value="tiktok" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{a.tabs.tiktok}</TabsTrigger>
            <TabsTrigger value="playlist" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{a.tabs.playlist}</TabsTrigger>
            <TabsTrigger value="alerts" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Real-time Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="streams" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-7">
              <Card className="col-span-4 bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle>{role === "artist" ? "Мои стримы по месяцам" : "Стримы по времени"}</CardTitle>
                  <CardDescription>{role === "artist" ? "Ваши персональные стримы" : "Общие стримы по всем платформам"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={D.streamsTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="streamGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}K`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                          formatter={(v: number) => [v.toLocaleString(), "Стримы"]}
                        />
                        <Area type="monotone" dataKey="streams" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#streamGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="col-span-3 bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle>По платформам</CardTitle>
                  <CardDescription>Доля стримов по DSP</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[180px] mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={D.streamsByDSP} dataKey="streams" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                          {D.streamsByDSP.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                          formatter={(v: number) => [v.toLocaleString(), "Стримы"]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {D.streamsByDSP.map((dsp) => (
                      <div key={dsp.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dsp.color }} />
                          <span className="text-muted-foreground">{dsp.name}</span>
                        </div>
                        <span className="font-medium">{dsp.share}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="card-surface border-border/60">
              <CardHeader>
                <CardTitle>{role === "artist" ? "Мои треки" : "Топ треки"}</CardTitle>
                <CardDescription>Наиболее стримингуемые треки за период</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-background/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3 w-8">#</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Трек</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Платформа</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Стримы</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-6 py-3">Тренд</th>
                    </tr>
                  </thead>
                  <tbody>
                    {D.topTracks.map((track) => (
                      <tr key={track.rank} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                        <td className="px-6 py-3 text-sm text-muted-foreground font-mono">{track.rank}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm">{track.title}</div>
                          <div className="text-xs text-muted-foreground">{track.artist}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs">{track.dsp}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium tabular-nums">{track.streams.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right">
                          <span className={`text-xs font-medium flex items-center justify-end gap-0.5 ${track.trend > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            {track.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {Math.abs(track.trend)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revenue" className="mt-4">
            <Card className="card-surface border-border/60">
              <CardHeader>
                <CardTitle>{role === "artist" ? "Мои доходы" : role === "label" ? "Доходы лейбла" : "Revenue Overview"}</CardTitle>
                <CardDescription>DSP-доходы vs Publishing по месяцам</CardDescription>
              </CardHeader>
              <CardContent>
                {revenueLoading ? (
                  <Skeleton className="h-[300px] w-full rounded-md" />
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenueDataRaw && revenueDataRaw.length > 0 ? revenueDataRaw : D.streamsTrend.map((_, i) => ({ month: D.streamsTrend[i].month, dspRevenue: Math.round(D.streamsTrend[i].streams * 0.0045), publishingRevenue: Math.round(D.streamsTrend[i].streams * 0.0006) }))} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colDsp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colPub" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                        <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                        <Area type="monotone" dataKey="dspRevenue" name="DSP Revenue" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colDsp)" />
                        <Area type="monotone" dataKey="publishingRevenue" name="Publishing Revenue" stroke="hsl(var(--chart-2))" fillOpacity={1} fill="url(#colPub)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="geo" className="mt-4">
            <Card className="card-surface border-border/60">
              <CardHeader>
                <CardTitle>География</CardTitle>
                <CardDescription>Топ стран по объёму стримов</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {D.geoData.map((item, i) => (
                    <div key={item.country} className="flex items-center gap-4">
                      <span className="text-muted-foreground text-xs font-mono w-4 shrink-0">{i + 1}</span>
                      <span className="text-lg shrink-0">{item.flag}</span>
                      <span className="text-sm font-medium w-28 shrink-0">{item.country}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-700"
                          style={{ width: `${item.share}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground tabular-nums w-20 text-right shrink-0">
                        {(item.streams / 1000).toFixed(0)}K
                      </span>
                      <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{item.share}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ugc" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: "UGC-видео", value: D.kpi.ugc, change: D.kpi.ugcTrend },
                { label: "UGC-просмотры", value: role === "artist" ? "312K" : role === "label" ? "824K" : "1.58M", change: "+18.2%" },
                { label: "Content ID доход", value: role === "artist" ? "$1,240" : role === "label" ? "$2,100" : "$4,320", change: "+11.4%" },
              ].map((kpi) => (
                <Card key={kpi.label} className="card-surface border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{kpi.value}</div>
                    <p className="text-xs text-emerald-500 mt-1">{kpi.change}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="card-surface border-border/60">
              <CardHeader>
                <CardTitle>YouTube UGC Тренд</CardTitle>
                <CardDescription>Клеймы с пользовательского контента</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={D.ugcData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                      <Bar dataKey="claims" name="UGC Видео" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tiktok" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: "TikTok Видео",      value: role === "artist" ? "1,980" : role === "label" ? "3,600" : "9,400",  change: "+30.6%" },
                { label: "TikTok Просмотры",  value: role === "artist" ? "8.4M"  : role === "label" ? "20M"    : "54M",    change: "+31.7%" },
                { label: "Уникальных звуков", value: role === "artist" ? "12"    : role === "label" ? "48"      : "124",    change: "+8 this month" },
              ].map((kpi) => (
                <Card key={kpi.label} className="card-surface border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{kpi.value}</div>
                    <p className="text-xs text-emerald-500 mt-1">{kpi.change}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="card-surface border-border/60">
              <CardHeader>
                <CardTitle>TikTok Рост</CardTitle>
                <CardDescription>Видео, созданные с использованием ваших треков</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={D.tiktokData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                      <Line type="monotone" dataKey="videos" name="Видео создано" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="playlist" className="mt-4">
            <Card className="card-surface border-border/60">
              <CardHeader>
                <CardTitle>Плейлисты</CardTitle>
                <CardDescription>Ваши треки в редакционных и алгоритмических плейлистах</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {D.playlists.map((pl, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-4 border-b border-border/50 hover:bg-accent/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded bg-primary/10 flex items-center justify-center">
                        <Radio className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{pl.playlist}</p>
                        <p className="text-xs text-muted-foreground">{pl.dsp}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <p className="font-medium">{pl.tracks}</p>
                        <p className="text-xs text-muted-foreground">Tracks</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium">{pl.followers}</p>
                        <p className="text-xs text-muted-foreground">Followers</p>
                      </div>
                      <Badge variant="outline" className={pl.type === "Editorial" ? "text-violet-400 border-violet-500/20 bg-violet-500/10" : "text-blue-400 border-blue-500/20 bg-blue-500/10"}>
                        {pl.type}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Card className="card-surface no-lift border-rose-500/30 bg-rose-500/[0.03]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    Stream Spike Detection
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">«Шаби нав» получил +840% стримов за 6 часов</p>
                  <p className="text-[10px] text-muted-foreground/70">2026-04-11 13:42 · Spotify · возможный буст или фрод</p>
                  <Button size="sm" variant="outline" className="w-full mt-2 text-xs h-7">Investigate</Button>
                </CardContent>
              </Card>
              <Card className="card-surface no-lift border-amber-500/30 bg-amber-500/[0.03]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Skip Rate Threshold
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">«Unknown 882» — skip rate 78% за последние 24ч</p>
                  <p className="text-[10px] text-muted-foreground/70">2026-04-11 09:15 · Apple Music · ниже среднего по каталогу</p>
                  <Button size="sm" variant="outline" className="w-full mt-2 text-xs h-7">Review Track</Button>
                </CardContent>
              </Card>
              <Card className="card-surface no-lift border-emerald-500/30 bg-emerald-500/[0.03]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Editorial Playlist Add
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">«Дилам мехохад» добавлен в Tajik Hits (Spotify Editorial)</p>
                  <p className="text-[10px] text-muted-foreground/70">2026-04-10 18:30 · 1.2M followers · ожидаемый прирост +180K</p>
                  <Button size="sm" variant="outline" className="w-full mt-2 text-xs h-7">View Playlist</Button>
                </CardContent>
              </Card>
            </div>

            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Alert Rules</CardTitle>
                  <CardDescription>Триггеры мониторинга — настраиваются в Automation</CardDescription>
                </div>
                <Button size="sm" variant="outline">+ New Rule</Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {[
                    { rule: "Stream spike > 500% за 24ч", channel: "Email + Telegram", enabled: true },
                    { rule: "Skip rate > 60% по треку", channel: "In-app + Email", enabled: true },
                    { rule: "Editorial playlist add", channel: "Push + Email", enabled: true },
                    { rule: "DSP delivery failure", channel: "Email + Telegram", enabled: true },
                    { rule: "Daily revenue drop > 30%", channel: "Email", enabled: false },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-6 py-3">
                      <div>
                        <p className="text-sm font-medium">{r.rule}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">via {r.channel}</p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${r.enabled ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-muted-foreground bg-muted/50"}`}>
                        {r.enabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
