import { Layout } from "@/components/layout";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, AlertTriangle, Globe, Search, Plus, ExternalLink, FileText, CheckCircle2, Clock, XCircle } from "lucide-react";

const DSP_DEALS = [
  { dsp: "Spotify", territory: "Global", type: "Distribution", start: "2022-01-01", end: "2027-01-01", status: "active", rate: "18%" },
  { dsp: "Apple Music", territory: "Global", type: "Distribution", start: "2022-03-01", end: "2027-03-01", status: "active", rate: "20%" },
  { dsp: "Yandex Music", territory: "CIS", type: "Distribution + Publishing", start: "2023-06-01", end: "2026-06-01", status: "expiring", rate: "22%" },
  { dsp: "VK Music", territory: "Russia, CIS", type: "Distribution", start: "2023-01-01", end: "2026-01-01", status: "active", rate: "20%" },
  { dsp: "TikTok", territory: "Global", type: "Sync Licensing", start: "2024-01-01", end: "2026-12-31", status: "active", rate: "15%" },
];

const CONTENT_ID = [
  { track: "Дилам мехохад", artist: "Давлатмандов Ш.", youtube_id: "TM_2847392", claims: 142, revenue: "$340", status: "active" },
  { track: "Бахори нав", artist: "Зарина Саидова", youtube_id: "TM_2847401", claims: 87, revenue: "$198", status: "active" },
  { track: "Ишки ман", artist: "Рустам Назаров", youtube_id: "TM_2847415", claims: 34, revenue: "$76", status: "dispute" },
  { track: "Шаби нав", artist: "Камол Хасанов", youtube_id: "TM_2847428", claims: 211, revenue: "$489", status: "active" },
];

const DISPUTES = [
  { id: "DSP-001", track: "Ишки ман", claimant: "Universal Publishing", platform: "YouTube", opened: "2026-03-12", status: "in_review", type: "Publishing Rights" },
  { id: "DSP-002", track: "Наврӯз 2024", claimant: "Sony Music CIS", platform: "Spotify", opened: "2026-02-28", status: "resolved", type: "Master Rights" },
  { id: "DSP-003", track: "Ватан", claimant: "ASCAP", platform: "Apple Music", opened: "2026-04-01", status: "open", type: "Publishing Rights" },
];

const TERRITORIES = [
  { region: "Global", dsp: "Spotify, Apple Music, Deezer, Amazon", restriction: "None", note: "Full distribution" },
  { region: "CIS", dsp: "Yandex Music, VK Music, Zvooq", restriction: "None", note: "Full distribution" },
  { region: "Russia", dsp: "All CIS DSPs", restriction: "Certain tracks", note: "4 tracks geo-blocked per label request" },
  { region: "Afghanistan", dsp: "YouTube, Deezer", restriction: "None", note: "Limited DSP availability" },
];

function statusBadge(s: string) {
  const map: Record<string, string> = {
    active: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    expiring: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    expired: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    dispute: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    in_review: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    resolved: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    open: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  };
  return map[s] ?? "";
}

export default function Rights() {
  const [search, setSearch] = useState("");

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Rights Management</h1>
            <p className="text-muted-foreground mt-1">DSP deals, Content ID, disputes and territorial rights.</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Deal
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Active Deals", value: "4", icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Expiring Soon", value: "1", icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
            { label: "Open Disputes", value: "2", icon: AlertTriangle, color: "text-rose-500", bg: "bg-rose-500/10" },
            { label: "Content ID Tracks", value: "4", icon: Globe, color: "text-primary", bg: "bg-primary/10" },
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

        <Tabs defaultValue="deals">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1">
            <TabsTrigger value="deals" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">DSP Deals</TabsTrigger>
            <TabsTrigger value="contentid" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Content ID</TabsTrigger>
            <TabsTrigger value="disputes" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Disputes</TabsTrigger>
            <TabsTrigger value="territories" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Territory Rights</TabsTrigger>
          </TabsList>

          <TabsContent value="deals" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>DSP Agreements</CardTitle>
                <CardDescription>Active distribution and licensing contracts with platforms</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead>Platform</TableHead>
                      <TableHead>Territory</TableHead>
                      <TableHead>Deal Type</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DSP_DEALS.map((d, i) => (
                      <TableRow key={i} className="border-border/50 hover:bg-accent/20">
                        <TableCell className="font-medium text-sm">{d.dsp}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{d.territory}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{d.type}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{d.start} → {d.end}</TableCell>
                        <TableCell className="text-sm font-medium">{d.rate}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-xs capitalize ${statusBadge(d.status)}`}>{d.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7"><FileText className="h-3.5 w-3.5" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contentid" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>YouTube Content ID</CardTitle>
                <CardDescription>Tracks registered for Content ID monetization</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead>Track</TableHead>
                      <TableHead>Content ID</TableHead>
                      <TableHead>Claims</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {CONTENT_ID.map((c, i) => (
                      <TableRow key={i} className="border-border/50 hover:bg-accent/20">
                        <TableCell>
                          <div className="font-medium text-sm">{c.track}</div>
                          <div className="text-xs text-muted-foreground">{c.artist}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{c.youtube_id}</TableCell>
                        <TableCell className="text-sm font-medium">{c.claims}</TableCell>
                        <TableCell className="text-sm font-medium text-emerald-400">{c.revenue}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-xs ${statusBadge(c.status)}`}>{c.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="disputes" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>Rights Disputes</CardTitle>
                <CardDescription>Active and resolved rights conflicts</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead>ID</TableHead>
                      <TableHead>Track</TableHead>
                      <TableHead>Claimant</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Opened</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DISPUTES.map((d, i) => (
                      <TableRow key={i} className="border-border/50 hover:bg-accent/20">
                        <TableCell className="font-mono text-xs text-muted-foreground">{d.id}</TableCell>
                        <TableCell className="font-medium text-sm">{d.track}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{d.claimant}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{d.platform}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{d.type}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.opened}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-xs capitalize ${statusBadge(d.status)}`}>{d.status.replace("_", " ")}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="territories" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>Territory Rights</CardTitle>
                <CardDescription>Distribution rights by geographic region</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead>Region</TableHead>
                      <TableHead>Platforms</TableHead>
                      <TableHead>Restrictions</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {TERRITORIES.map((t, i) => (
                      <TableRow key={i} className="border-border/50 hover:bg-accent/20">
                        <TableCell className="font-medium text-sm">{t.region}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px]">{t.dsp}</TableCell>
                        <TableCell>
                          {t.restriction === "None" ? (
                            <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> None</span>
                          ) : (
                            <span className="text-xs text-amber-500">{t.restriction}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.note}</TableCell>
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
