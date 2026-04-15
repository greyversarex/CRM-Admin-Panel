import { Layout } from "@/components/layout";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { useListDeliveries, useListReleases } from "@workspace/api-client-react";
import {
  Search, RefreshCw, AlertCircle, CheckCircle2, XCircle, Clock,
  Send, Shield, FileCode2, Zap, Ban, CalendarClock, Filter,
  ChevronRight, Download, MoreHorizontal, ExternalLink,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const DSP_LIST = [
  { name: "Spotify", status: "connected", releases: 214, icon: "🟢" },
  { name: "Apple Music", status: "connected", releases: 198, icon: "🟢" },
  { name: "YouTube Music", status: "connected", releases: 186, icon: "🟢" },
  { name: "Yandex Music", status: "connected", releases: 142, icon: "🟢" },
  { name: "TikTok", status: "connected", releases: 201, icon: "🟢" },
  { name: "VK Music", status: "connected", releases: 134, icon: "🟢" },
  { name: "Deezer", status: "connected", releases: 167, icon: "🟢" },
  { name: "Zvooq", status: "error", releases: 98, icon: "🔴" },
  { name: "VEVO", status: "pending", releases: 42, icon: "🟡" },
  { name: "Amazon Music", status: "connected", releases: 153, icon: "🟢" },
];

const PENDING_MODERATION = [
  { id: 1, title: "Дилам мехохад", artist: "Давлатмандов Ш.", type: "Single", submitted: "2026-04-13", issues: [], upc: "886448726301" },
  { id: 2, title: "Бахори нав", artist: "Зарина Саидова", type: "Album", submitted: "2026-04-12", issues: ["Missing ISRC on track 3"], upc: "886448726302" },
  { id: 3, title: "Ишки ман", artist: "Рустам Назаров", type: "EP", submitted: "2026-04-12", issues: [], upc: "886448726303" },
];

const DDEX_LOGS = [
  { id: "D001", release: "Дилам мехохад", version: "ERN 4.3", target: "Spotify", status: "delivered", timestamp: "2026-04-10 14:32", size: "4.2 MB" },
  { id: "D002", release: "Бахори нав", version: "ERN 4.3", target: "Apple Music", status: "delivered", timestamp: "2026-04-10 14:33", size: "18.7 MB" },
  { id: "D003", release: "Дустони ман", version: "ERN 4.2", target: "Yandex Music", status: "failed", timestamp: "2026-04-09 09:15", size: "6.1 MB" },
  { id: "D004", release: "Шаби нав", version: "ERN 4.3", target: "TikTok", status: "pending", timestamp: "2026-04-11 11:00", size: "3.8 MB" },
  { id: "D005", release: "Модари азиз", version: "ERN 4.3", target: "Deezer", status: "delivered", timestamp: "2026-04-08 16:44", size: "8.9 MB" },
];

const TAKEDOWNS = [
  { title: "Old Release 2019", artist: "Various Artists", reason: "Label request", date: "2026-03-14", dsp: "All platforms" },
  { title: "Unofficial Cover", artist: "Unknown", reason: "Copyright infringement", date: "2026-03-02", dsp: "Spotify, Apple Music" },
];

const SCHEDULED = [
  { title: "Наврӯз 2026", artist: "Ансамбл Бахор", releaseDate: "2026-03-21", status: "approved", dsp: "All" },
  { title: "Summer Hits EP", artist: "Зарина Саидова", releaseDate: "2026-06-01", status: "pending", dsp: "All" },
  { title: "New Single", artist: "Камол Хасанов", releaseDate: "2026-05-15", status: "draft", dsp: "Spotify, Apple" },
];


export default function Distribution() {
  const [search, setSearch] = useState("");
  const { data: deliveries, isLoading } = useListDeliveries({ limit: 50 });

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <h1 className="text-2xl font-bold tracking-tight">Distribution</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Release moderation, DDEX delivery, DSP status and takedowns.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="bg-card">
              <Download className="mr-2 h-4 w-4" />
              Export Logs
            </Button>
            <Button>
              <Send className="mr-2 h-4 w-4" />
              New Delivery
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <KpiCard
            label="Pending Moderation"
            value="3"
            icon={Clock}
            iconColor="text-amber-400"
            iconBg="bg-amber-500/12"
            iconBorder="border-amber-500/20"
            trend={{ value: "-40%", up: true, label: "vs yesterday" }}
          />
          <KpiCard
            label="Delivered Today"
            value="12"
            icon={CheckCircle2}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/12"
            iconBorder="border-emerald-500/20"
            trend={{ value: "+20%", up: true, label: "vs avg" }}
          />
          <KpiCard
            label="Failed Deliveries"
            value="1"
            icon={XCircle}
            iconColor="text-rose-400"
            iconBg="bg-rose-500/12"
            iconBorder="border-rose-500/20"
            trend={{ value: "-50%", up: true, label: "vs yesterday" }}
          />
          <KpiCard
            label="DSPs Connected"
            value="9/10"
            icon={Shield}
            iconColor="text-primary"
            iconBg="bg-primary/12"
            iconBorder="border-primary/20"
            trend={{ value: "1 pending", label: "VEVO" }}
          />
        </div>

        <Tabs defaultValue="moderation">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1">
            <TabsTrigger value="moderation" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Moderation
              <Badge className="ml-1 h-4 w-4 p-0 flex items-center justify-center bg-amber-500 text-white text-[10px]">3</Badge>
            </TabsTrigger>
            <TabsTrigger value="ddex" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <FileCode2 className="h-3.5 w-3.5" />
              DDEX Logs
            </TabsTrigger>
            <TabsTrigger value="dsp" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Send className="h-3.5 w-3.5" />
              DSP Status
            </TabsTrigger>
            <TabsTrigger value="takedowns" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Ban className="h-3.5 w-3.5" />
              Takedowns
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Scheduled
            </TabsTrigger>
          </TabsList>

          <TabsContent value="moderation" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>Release Moderation Queue</CardTitle>
                <CardDescription>Releases awaiting review before delivery to DSPs</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Release</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>UPC</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>QC Check</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PENDING_MODERATION.map((r) => (
                      <TableRow key={r.id} >
                        <TableCell>
                          <div className="font-medium text-sm">{r.title}</div>
                          <div className="text-xs text-muted-foreground">{r.artist}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{r.type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{r.upc}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.submitted}</TableCell>
                        <TableCell>
                          {r.issues.length === 0 ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-500">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Passed
                            </span>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="flex items-center gap-1 text-xs text-amber-500">
                                  <AlertCircle className="h-3.5 w-3.5" /> {r.issues.length} issue{r.issues.length > 1 ? "s" : ""}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="bg-card border-border">
                                {r.issues.map((iss, i) => <p key={i} className="text-xs">{iss}</p>)}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs text-rose-500 border-rose-500/30 hover:bg-rose-500/10">
                              <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                            </Button>
                            <Button size="sm" className="h-7 text-xs">
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ddex" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50 flex flex-col overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>DDEX Delivery Logs</CardTitle>
                    <CardDescription>Party ID: PA-DPIDA-2024053004-T</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs font-mono text-muted-foreground">ERN 4.3</Badge>
                    <Badge variant="outline" className="text-xs font-mono text-muted-foreground">ERN 4.2</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>ID</TableHead>
                      <TableHead>Release</TableHead>
                      <TableHead>DDEX Version</TableHead>
                      <TableHead>Target DSP</TableHead>
                      <TableHead>Package Size</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DDEX_LOGS.map((log) => (
                      <TableRow key={log.id} >
                        <TableCell className="font-mono text-xs text-muted-foreground">{log.id}</TableCell>
                        <TableCell className="font-medium text-sm">{log.release}</TableCell>
                        <TableCell><Badge variant="outline" className="font-mono text-xs">{log.version}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{log.target}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{log.size}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{log.timestamp}</TableCell>
                        <TableCell>
                          <StatusBadge status={log.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dsp" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2">
              {DSP_LIST.map((dsp) => (
                <Card key={dsp.name} className="bg-card/50 backdrop-blur border-border/50 hover:border-border transition-colors">
                  <CardContent className="flex items-center gap-4 pt-4 pb-4">
                    <span className="text-xl">{dsp.icon}</span>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{dsp.name}</p>
                      <p className="text-xs text-muted-foreground">{dsp.releases} releases delivered</p>
                    </div>
                    <StatusBadge status={dsp.status} />
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="takedowns" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Takedowns</CardTitle>
                  <CardDescription>Releases removed from distribution</CardDescription>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 text-rose-500 border-rose-500/30 hover:bg-rose-500/10">
                  <Ban className="h-3.5 w-3.5" />
                  New Takedown
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Release</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Platforms</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {TAKEDOWNS.map((t, i) => (
                      <TableRow key={i} >
                        <TableCell>
                          <div className="font-medium text-sm">{t.title}</div>
                          <div className="text-xs text-muted-foreground">{t.artist}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t.reason}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.dsp}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.date}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" className="h-7 text-xs">Restore</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scheduled" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>Scheduled Releases</CardTitle>
                <CardDescription>Approved releases waiting for their release date</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Release</TableHead>
                      <TableHead>Release Date</TableHead>
                      <TableHead>Platforms</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SCHEDULED.map((s, i) => (
                      <TableRow key={i} >
                        <TableCell>
                          <div className="font-medium text-sm">{s.title}</div>
                          <div className="text-xs text-muted-foreground">{s.artist}</div>
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{s.releaseDate}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.dsp}</TableCell>
                        <TableCell>
                          <StatusBadge status={s.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
