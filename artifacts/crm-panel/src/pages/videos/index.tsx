import { Layout } from "@/components/layout";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Video, Youtube, Plus, Search, Filter, Play, Eye, TrendingUp, DollarSign, Upload, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const VIDEOS = [
  { title: "Дилам мехохад — Official Video", artist: "Давлатмандов Ш.", platform: "YouTube", views: 840000, revenue: "$1,240", status: "live", duration: "3:42", type: "Official MV" },
  { title: "Бахори нав — Lyric Video", artist: "Зарина Саидова", platform: "YouTube", views: 320000, revenue: "$480", status: "live", duration: "4:15", type: "Lyric Video" },
  { title: "Ишки ман — VEVO", artist: "Рустам Назаров", platform: "VEVO", views: 210000, revenue: "$312", status: "live", duration: "3:28", type: "Official MV" },
  { title: "Шаби нав — Art Track", artist: "Камол Хасанов", platform: "YouTube Music", views: 94000, revenue: "$138", status: "live", duration: "5:01", type: "Art Track" },
  { title: "Наврӯз 2026 — Behind the Scenes", artist: "Ансамбл Бахор", platform: "YouTube", views: 0, revenue: "$0", status: "processing", duration: "8:22", type: "Documentary" },
];

const CONTENT_ID_VIDEOS = [
  { title: "Дилам мехохад в Tiktok UGC", claims: 214, views: "1.2M", revenue: "$340", month: "April 2026" },
  { title: "Бахори нав — Fan Covers YouTube", claims: 87, views: "420K", revenue: "$126", month: "April 2026" },
];

function statusBadge(s: string) {
  if (s === "live") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (s === "processing") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  if (s === "rejected") return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  return "text-muted-foreground";
}

function platformColor(p: string) {
  if (p === "YouTube") return "text-red-400 bg-red-500/10 border-red-500/20";
  if (p === "VEVO") return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  if (p === "YouTube Music") return "text-red-300 bg-red-400/10 border-red-400/20";
  return "text-muted-foreground";
}

export default function Videos() {
  const [search, setSearch] = useState("");

  const filtered = VIDEOS.filter(
    (v) =>
      !search ||
      v.title.toLowerCase().includes(search.toLowerCase()) ||
      v.artist.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Video Distribution</h1>
            <p className="text-muted-foreground mt-1">YouTube, VEVO, art tracks, and Content ID video management.</p>
          </div>
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload Video
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Total Videos", value: "5", icon: Video, color: "text-primary", bg: "bg-primary/10" },
            { label: "Total Views", value: "1.46M", icon: Eye, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Video Revenue", value: "$2,170", icon: DollarSign, color: "text-violet-500", bg: "bg-violet-500/10" },
            { label: "Content ID Claims", value: "301", icon: Youtube, color: "text-red-500", bg: "bg-red-500/10" },
          ].map((kpi) => (
            <Card key={kpi.label} className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="pt-5 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${kpi.bg} flex items-center justify-center shrink-0`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="all">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1">
            <TabsTrigger value="all" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Video className="h-3.5 w-3.5" /> All Videos
            </TabsTrigger>
            <TabsTrigger value="contentid" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Youtube className="h-3.5 w-3.5" /> Content ID
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50 flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search videos..."
                    className="pl-8 bg-background/50 border-border h-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon" className="h-9 w-9 bg-background/50">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-background/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Video</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Type</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Platform</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Views</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Revenue</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Duration</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((v, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-accent/20 transition-colors cursor-pointer">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-9 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                              <Play className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <div className="text-sm font-medium line-clamp-1">{v.title}</div>
                              <div className="text-xs text-muted-foreground">{v.artist}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs">{v.type}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${platformColor(v.platform)}`}>{v.platform}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm tabular-nums">
                          {v.views > 0 ? v.views.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-emerald-400">{v.revenue !== "$0" ? v.revenue : "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{v.duration}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs capitalize ${statusBadge(v.status)}`}>{v.status}</Badge>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-card border-border">
                              <DropdownMenuItem>View Analytics</DropdownMenuItem>
                              <DropdownMenuItem>Edit Metadata</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">Takedown</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="contentid" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>Content ID Claims</CardTitle>
                <CardDescription>User-generated content using your videos on YouTube</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {CONTENT_ID_VIDEOS.map((c, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-4 border-b border-border/50 hover:bg-accent/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                        <Youtube className="h-4 w-4 text-red-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{c.title}</p>
                        <p className="text-xs text-muted-foreground">{c.month}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-8 text-sm">
                      <div className="text-center">
                        <p className="font-medium">{c.claims}</p>
                        <p className="text-xs text-muted-foreground">Claims</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium">{c.views}</p>
                        <p className="text-xs text-muted-foreground">Views</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-emerald-400">{c.revenue}</p>
                        <p className="text-xs text-muted-foreground">Revenue</p>
                      </div>
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
