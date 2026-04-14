import { Layout } from "@/components/layout";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Megaphone, Link2, Music, Image, Plus, ExternalLink, Copy, Eye, MousePointer, TrendingUp, Calendar } from "lucide-react";

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

function statusBadge(s: string) {
  const map: Record<string, string> = {
    active: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    accepted: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    pending: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    draft: "text-muted-foreground bg-muted/50",
    declined: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  };
  return map[s] ?? "";
}

export default function Marketing() {
  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
            <p className="text-muted-foreground mt-1">Pre-save campaigns, smart links, editorial pitches and promo assets.</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Active Pre-saves", value: "2", icon: Calendar, color: "text-primary", bg: "bg-primary/10" },
            { label: "Smart Links", value: "3", icon: Link2, color: "text-violet-500", bg: "bg-violet-500/10" },
            { label: "Pending Pitches", value: "2", icon: Music, color: "text-amber-500", bg: "bg-amber-500/10" },
            { label: "Total Pre-saves", value: "1,581", icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
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
            <Card className="bg-card/50 backdrop-blur border-border/50">
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
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-background/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Release</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Release Date</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Pre-saves</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Link Clicks</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRESAVES.map((p, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                        <td className="px-6 py-3">
                          <div className="text-sm font-medium">{p.title}</div>
                          <div className="text-xs text-muted-foreground">{p.artist}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{p.releaseDate}</td>
                        <td className="px-4 py-3 text-sm font-medium">{p.saves.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{p.clicks.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs capitalize ${statusBadge(p.status)}`}>{p.status}</Badge>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink className="h-3.5 w-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="smartlinks" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
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
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-background/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Release</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Slug</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Views</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Clicks</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">CTR</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SMART_LINKS.map((l, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                        <td className="px-6 py-3">
                          <div className="text-sm font-medium">{l.title}</div>
                          <div className="text-xs text-muted-foreground">{l.artist}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-primary">{l.slug}</td>
                        <td className="px-4 py-3 text-sm">{l.views.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-emerald-400">{l.clicks.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm font-medium">{l.ctr}</td>
                        <td className="px-6 py-3 text-right flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7"><Copy className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink className="h-3.5 w-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pitch" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
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
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-background/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Release</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Playlist</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">DSP</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Genre</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Submitted</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PITCHES.map((p, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                        <td className="px-6 py-3 text-sm font-medium">{p.release}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{p.playlist}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{p.dsp}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{p.genre}</Badge></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{p.submitted}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs capitalize ${statusBadge(p.status)}`}>{p.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="promo" className="mt-4">
            <div className="grid gap-4 md:grid-cols-3">
              {PROMO_ASSETS.map((a, i) => (
                <Card key={i} className="bg-card/50 backdrop-blur border-border/50">
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
