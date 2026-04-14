import { Layout } from "@/components/layout";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLang } from "@/lib/i18n";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Play, Globe, Music, Youtube, Radio } from "lucide-react";
import { useGetDashboardRevenueByMonth } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

const streamsByDSP = [
  { name: "Spotify", streams: 1840000, color: "#1DB954", share: 42 },
  { name: "Apple Music", streams: 920000, color: "#FC3C44", share: 21 },
  { name: "YouTube Music", streams: 680000, color: "#FF0000", share: 16 },
  { name: "TikTok", streams: 430000, color: "#69C9D0", share: 10 },
  { name: "Yandex", streams: 290000, color: "#FFCC00", share: 7 },
  { name: "Other", streams: 180000, color: "#6B7280", share: 4 },
];

const streamsTrend = [
  { month: "Nov", streams: 2100000 },
  { month: "Dec", streams: 2450000 },
  { month: "Jan", streams: 2280000 },
  { month: "Feb", streams: 2650000 },
  { month: "Mar", streams: 2900000 },
  { month: "Apr", streams: 3340000 },
];

const topTracks = [
  { rank: 1, title: "Дилам мехохад", artist: "Давлатмандов Ш.", streams: 482000, trend: 12.4, dsp: "Spotify" },
  { rank: 2, title: "Бахор омад", artist: "Рустам Назаров", streams: 364000, trend: 8.1, dsp: "Apple Music" },
  { rank: 3, title: "Ишки ман", artist: "Зарина Саидова", streams: 298000, trend: -2.3, dsp: "Spotify" },
  { rank: 4, title: "Шаби нав", artist: "Камол Хасанов", streams: 241000, trend: 5.7, dsp: "TikTok" },
  { rank: 5, title: "Модари азиз", artist: "Ансамбл Бахор", streams: 198000, trend: 3.2, dsp: "YouTube" },
];

const geoData = [
  { country: "Таджикистан", streams: 1240000, flag: "🇹🇯", share: 37 },
  { country: "Россия", streams: 890000, flag: "🇷🇺", share: 27 },
  { country: "Афганистан", streams: 340000, flag: "🇦🇫", share: 10 },
  { country: "Узбекистан", streams: 280000, flag: "🇺🇿", share: 8 },
  { country: "Германия", streams: 190000, flag: "🇩🇪", share: 6 },
  { country: "Другие", streams: 400000, flag: "🌍", share: 12 },
];

const ugcData = [
  { month: "Nov", claims: 12400, views: 840000 },
  { month: "Dec", claims: 14200, views: 920000 },
  { month: "Jan", claims: 11800, views: 780000 },
  { month: "Feb", claims: 15600, views: 1120000 },
  { month: "Mar", claims: 18200, views: 1340000 },
  { month: "Apr", claims: 21400, views: 1580000 },
];

const tiktokData = [
  { month: "Nov", videos: 3200, plays: 18000000 },
  { month: "Dec", videos: 4800, plays: 27000000 },
  { month: "Jan", videos: 3900, plays: 22000000 },
  { month: "Feb", videos: 5600, plays: 31000000 },
  { month: "Mar", videos: 7200, plays: 41000000 },
  { month: "Apr", videos: 9400, plays: 54000000 },
];

const PIE_COLORS = streamsByDSP.map(d => d.color);

export default function Analytics() {
  const [period, setPeriod] = useState("6m");
  const { data: revenueData, isLoading: revenueLoading } = useGetDashboardRevenueByMonth();
  const { t } = useLang();
  const a = t.analytics;

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{a.title}</h1>
            <p className="text-[13px] text-muted-foreground mt-1">{a.subtitle}</p>
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
          {[
            { label: a.total_streams, value: "3.34M", change: "+15.2%", up: true, icon: Play, color: "text-primary" },
            { label: a.total_revenue, value: "$24,180", change: "+9.4%", up: true, icon: TrendingUp, color: "text-emerald-500" },
            { label: a.active_tracks, value: "1,247", change: "+32 this month", up: true, icon: Music, color: "text-violet-500" },
            { label: a.ugc_claims, value: "21,400", change: "+17.6%", up: true, icon: Youtube, color: "text-red-500" },
          ].map((kpi) => (
            <Card key={kpi.label} className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpi.value}</div>
                <p className={`text-xs mt-1 ${kpi.up ? "text-emerald-500" : "text-rose-500"}`}>{kpi.change}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="streams" className="w-full">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1 flex flex-wrap">
            <TabsTrigger value="streams" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{a.tabs.streams}</TabsTrigger>
            <TabsTrigger value="revenue" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{a.tabs.revenue}</TabsTrigger>
            <TabsTrigger value="geo" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{a.tabs.geo}</TabsTrigger>
            <TabsTrigger value="ugc" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{a.tabs.ugc}</TabsTrigger>
            <TabsTrigger value="tiktok" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{a.tabs.tiktok}</TabsTrigger>
            <TabsTrigger value="playlist" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{a.tabs.playlist}</TabsTrigger>
          </TabsList>

          <TabsContent value="streams" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-7">
              <Card className="col-span-4 bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle>Streams Over Time</CardTitle>
                  <CardDescription>Total streams across all platforms</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={streamsTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="streamGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                          formatter={(v: number) => [v.toLocaleString(), "Streams"]}
                        />
                        <Area type="monotone" dataKey="streams" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#streamGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="col-span-3 bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle>By Platform</CardTitle>
                  <CardDescription>Share of streams per DSP</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[180px] mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={streamsByDSP} dataKey="streams" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                          {streamsByDSP.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                          formatter={(v: number) => [v.toLocaleString(), "Streams"]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {streamsByDSP.map((dsp) => (
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

            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>Top Tracks</CardTitle>
                <CardDescription>Most streamed tracks this period</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-background/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3 w-8">#</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Track</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Top Platform</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Streams</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-6 py-3">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topTracks.map((track) => (
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
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>Revenue Overview</CardTitle>
                <CardDescription>DSP vs Publishing revenue by month</CardDescription>
              </CardHeader>
              <CardContent>
                {revenueLoading ? (
                  <Skeleton className="h-[300px] w-full rounded-md" />
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenueData || []} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>Geography</CardTitle>
                <CardDescription>Top countries by stream volume</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {geoData.map((item, i) => (
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
                { label: "Total UGC Videos", value: "21,400", change: "+17.6%" },
                { label: "Total UGC Views", value: "1.58M", change: "+18.2%" },
                { label: "Content ID Revenue", value: "$4,320", change: "+11.4%" },
              ].map((kpi) => (
                <Card key={kpi.label} className="bg-card/50 backdrop-blur border-border/50">
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
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>YouTube UGC Trend</CardTitle>
                <CardDescription>Claims and views from user-generated content</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ugcData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                      <Bar dataKey="claims" name="UGC Videos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tiktok" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: "TikTok Videos", value: "9,400", change: "+30.6%" },
                { label: "TikTok Plays", value: "54M", change: "+31.7%" },
                { label: "Unique Sounds", value: "124", change: "+8 this month" },
              ].map((kpi) => (
                <Card key={kpi.label} className="bg-card/50 backdrop-blur border-border/50">
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
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>TikTok Growth</CardTitle>
                <CardDescription>Videos created using your tracks each month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tiktokData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                      <Line type="monotone" dataKey="videos" name="Videos Created" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="playlist" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>Playlist Placements</CardTitle>
                <CardDescription>Your tracks featured in editorial and algorithmic playlists</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {[
                  { playlist: "Tajik Hits", dsp: "Spotify", tracks: 8, followers: "42K", type: "Editorial" },
                  { playlist: "Central Asian Pop", dsp: "Apple Music", tracks: 5, followers: "28K", type: "Editorial" },
                  { playlist: "Discover Weekly", dsp: "Spotify", tracks: 12, followers: "—", type: "Algorithmic" },
                  { playlist: "Чарты Таджикистана", dsp: "Yandex Music", tracks: 6, followers: "19K", type: "Editorial" },
                  { playlist: "New Music Friday", dsp: "Apple Music", tracks: 3, followers: "180K", type: "Editorial" },
                  { playlist: "Made for You", dsp: "Spotify", tracks: 9, followers: "—", type: "Algorithmic" },
                ].map((pl, i) => (
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
        </Tabs>
      </div>
    </Layout>
  );
}
