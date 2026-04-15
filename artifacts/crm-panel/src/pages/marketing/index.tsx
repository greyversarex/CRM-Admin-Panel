import { Layout } from "@/components/layout";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Megaphone, Link2, Music, Image, Plus, ExternalLink, Copy, Eye, MousePointer, TrendingUp, Calendar } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PRESAVES = [
  { title: "Наврӯз 2026", artist: "Ансамбл Бахор", releaseDate: "2026-03-21", saves: 1240, clicks: 3800, status: "active" },
  { title: "Summer EP", artist: "Зарина Саидова", releaseDate: "2026-06-01", saves: 341, clicks: 980, status: "active" },
  { title: "New Single", artist: "Камол Хасанов", releaseDate: "2026-05-15", saves: 0, clicks: 0, status: "draft" },
];

const SMART_LINKS = [
  { title: "Дилам мехохад", artist: "Давлатмандов Ш.", slug: "tajik/dilam", views: 4820, clicks: 2140, ctr: "44%", created: "2026-04-01" },
  { title: "Бахори нав EP", artist: "Зарина Саидова", slug: "tajik/bahor-ep", views: 2340, clicks: 1020, ctr: "44%", created: "2026-03-15" },
  { title: "Best of Tajik Music", artist: "Various", slug: "tajik/best", views: 8900, clicks: 3420, ctr: "38%", created: "2026-02-20" },
];

const PITCHES = [
  { release: "Наврӯз 2026", playlist: "Global Viral 50", dsp: "Spotify", genre: "World Music", submitted: "2026-03-10", status: "accepted" },
  { release: "Дилам мехохад", playlist: "New Music Friday", dsp: "Spotify", genre: "Pop", submitted: "2026-04-08", status: "pending" },
  { release: "Summer EP", playlist: "A-List Pop", dsp: "Apple Music", genre: "Pop", submitted: "2026-04-12", status: "pending" },
  { release: "Шаби нав", playlist: "Chilled Pop Hits", dsp: "Spotify", genre: "Chill", submitted: "2026-03-01", status: "declined" },
];

const PROMO_ASSETS = [
  { release: "Наврӯз 2026", formats: ["1080x1080", "1080x1920", "1200x628"], generated: "2026-03-18" },
  { release: "Дилам мехохад", formats: ["1080x1080", "1080x1920"], generated: "2026-04-02" },
  { release: "Summer EP", formats: ["1080x1080"], generated: "2026-04-10" },
];


export default function Marketing() {
  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <h1 className="text-2xl font-bold tracking-tight">Marketing</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Pre-save campaigns, smart links, editorial pitches and promo assets.</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <KpiCard
            label="Active Pre-saves"
            value="2"
            icon={Calendar}
            iconColor="text-primary"
            iconBg="bg-primary/12"
            iconBorder="border-primary/20"
            trend={{ value: "2 upcoming", label: "in 30 days" }}
          />
          <KpiCard
            label="Smart Links"
            value="3"
            icon={Link2}
            iconColor="text-violet-400"
            iconBg="bg-violet-500/12"
            iconBorder="border-violet-500/20"
            trend={{ value: "+1 this week", up: true }}
          />
          <KpiCard
            label="Pending Pitches"
            value="2"
            icon={Music}
            iconColor="text-amber-400"
            iconBg="bg-amber-500/12"
            iconBorder="border-amber-500/20"
            trend={{ value: "1 accepted", up: true, label: "this month" }}
          />
          <KpiCard
            label="Total Pre-saves"
            value="1,581"
            icon={TrendingUp}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/12"
            iconBorder="border-emerald-500/20"
            trend={{ value: "+24%", up: true, label: "vs last campaign" }}
          />
        </div>

        <Tabs defaultValue="presave">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1">
            <TabsTrigger value="presave" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Pre-save
            </TabsTrigger>
            <TabsTrigger value="smartlinks" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Smart Links
            </TabsTrigger>
            <TabsTrigger value="pitch" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Music className="h-3.5 w-3.5" /> Editorial Pitch
            </TabsTrigger>
            <TabsTrigger value="promo" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Image className="h-3.5 w-3.5" /> Promo Assets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="presave" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Pre-save Campaigns</CardTitle>
                  <CardDescription>Collect fan saves before a release goes live</CardDescription>
                </div>
                <Button size="sm" variant="outline">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> New Campaign
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Release</TableHead>
                      <TableHead>Release Date</TableHead>
                      <TableHead>Pre-saves</TableHead>
                      <TableHead>Link Clicks</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PRESAVES.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="font-medium">{p.title}</div>
                          <div className="text-xs text-muted-foreground">{p.artist}</div>
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">{p.releaseDate}</TableCell>
                        <TableCell className="font-medium">{p.saves.toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground">{p.clicks.toLocaleString()}</TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink className="h-3.5 w-3.5" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="smartlinks" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Smart Links</CardTitle>
                  <CardDescription>Universal links that route fans to their preferred DSP</CardDescription>
                </div>
                <Button size="sm" variant="outline">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> New Link
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Release</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead>Clicks</TableHead>
                      <TableHead>CTR</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SMART_LINKS.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="font-medium">{l.title}</div>
                          <div className="text-xs text-muted-foreground">{l.artist}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-primary">{l.slug}</TableCell>
                        <TableCell>{l.views.toLocaleString()}</TableCell>
                        <TableCell className="text-emerald-400">{l.clicks.toLocaleString()}</TableCell>
                        <TableCell className="font-medium">{l.ctr}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7"><Copy className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pitch" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Editorial Pitches</CardTitle>
                  <CardDescription>Pitch releases to Spotify, Apple Music and other editorial teams</CardDescription>
                </div>
                <Button size="sm" variant="outline">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> New Pitch
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Release</TableHead>
                      <TableHead>Playlist</TableHead>
                      <TableHead>DSP</TableHead>
                      <TableHead>Genre</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PITCHES.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.release}</TableCell>
                        <TableCell className="text-muted-foreground">{p.playlist}</TableCell>
                        <TableCell className="text-muted-foreground">{p.dsp}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{p.genre}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{p.submitted}</TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="promo" className="mt-4">
            <div className="grid gap-4 md:grid-cols-3">
              {PROMO_ASSETS.map((a, i) => (
                <Card key={i} className="card-surface no-lift border-border/60">
                  <CardContent className="pt-5">
                    <div className="w-full aspect-square bg-gradient-to-br from-primary/20 to-primary/5 rounded-lg mb-4 flex items-center justify-center">
                      <Image className="h-12 w-12 text-primary/40" />
                    </div>
                    <h3 className="font-medium text-sm mb-1">{a.release}</h3>
                    <p className="text-xs text-muted-foreground mb-3">Generated: {a.generated}</p>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {a.formats.map((f) => (
                        <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="w-full text-xs">
                      <ExternalLink className="mr-1.5 h-3 w-3" />
                      Download Assets
                    </Button>
                  </CardContent>
                </Card>
              ))}
              <Card className="bg-card/50 backdrop-blur border-border/50 border-dashed flex items-center justify-center min-h-[280px] cursor-pointer hover:border-primary/50 transition-colors">
                <div className="text-center">
                  <Plus className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">Generate Assets</p>
                  <p className="text-xs text-muted-foreground">Auto-create from release cover</p>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
