import { Layout } from "@/components/layout";
import { useListReleases, useListTracks } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download, Plus, Filter, Music, Image as ImageIcon, FileImage, Copy, Edit3, Hash, AlertTriangle, CheckCircle2, Wand2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

export default function Catalog() {
  const [activeTab, setActiveTab] = useState("releases");
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: releasesData, isLoading: isReleasesLoading } = useListReleases({ 
    search: searchQuery || undefined,
    limit: 20 
  });
  
  const { data: tracksData, isLoading: isTracksLoading } = useListTracks({ 
    search: searchQuery || undefined,
    limit: 20 
  });

  return (
    <Layout>
      <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Catalog</h1>
            <p className="text-muted-foreground mt-1">Manage your entire music catalog across all releases.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Release
            </Button>
          </div>
        </div>

        <Card className="flex-1 bg-card/50 backdrop-blur border-border/50 flex flex-col overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <TabsList className="bg-background/50 border border-border flex-wrap h-auto">
                  <TabsTrigger value="releases" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    Releases
                  </TabsTrigger>
                  <TabsTrigger value="tracks" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    Tracks
                  </TabsTrigger>
                  <TabsTrigger value="assets" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
                    <FileImage className="h-3.5 w-3.5" /> Assets
                  </TabsTrigger>
                  <TabsTrigger value="duplicates" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
                    <Copy className="h-3.5 w-3.5" /> Duplicates
                  </TabsTrigger>
                  <TabsTrigger value="bulk" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
                    <Edit3 className="h-3.5 w-3.5" /> Bulk Edit
                  </TabsTrigger>
                  <TabsTrigger value="codes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
                    <Hash className="h-3.5 w-3.5" /> ISRC / UPC
                  </TabsTrigger>
                </TabsList>
                
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search title, ISRC, UPC..."
                      className="pl-8 bg-background/50"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" size="icon" className="shrink-0 bg-background/50">
                    <Filter className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-auto">
              <TabsContent value="releases" className="m-0 h-full">
                <Table>
                  <TableHeader className="bg-background/50 sticky top-0 z-10">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="w-[80px]">Cover</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>UPC</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isReleasesLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i} className="border-border/50">
                          <TableCell><Skeleton className="h-10 w-10 rounded" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-[80px] rounded-full" /></TableCell>
                        </TableRow>
                      ))
                    ) : releasesData?.data.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">
                          No releases found matching your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      releasesData?.data.map((release) => (
                        <TableRow key={release.id} className="border-border/50 hover:bg-accent/50 cursor-pointer transition-colors">
                          <TableCell>
                            <div className="h-10 w-10 rounded overflow-hidden bg-muted flex items-center justify-center border border-border">
                              {release.coverUrl ? (
                                <img src={release.coverUrl} alt={release.title} className="h-full w-full object-cover" />
                              ) : (
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground">{release.title}</div>
                            <div className="text-xs text-muted-foreground capitalize">{release.releaseType}</div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{release.artistName}</TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">{release.upc || "N/A"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {release.releaseDate ? new Date(release.releaseDate).toLocaleDateString() : "TBD"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={release.status} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
              
              <TabsContent value="tracks" className="m-0 h-full">
                <Table>
                  <TableHeader className="bg-background/50 sticky top-0 z-10">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>Release</TableHead>
                      <TableHead>ISRC</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isTracksLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i} className="border-border/50">
                          <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                        </TableRow>
                      ))
                    ) : tracksData?.data.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">
                          No tracks found matching your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      tracksData?.data.map((track) => (
                        <TableRow key={track.id} className="border-border/50 hover:bg-accent/50 cursor-pointer transition-colors">
                          <TableCell>
                            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                              <Music className="h-4 w-4" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground">{track.title}</div>
                            {track.isExplicit && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground ml-1">E</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{track.artistName}</TableCell>
                          <TableCell className="text-muted-foreground line-clamp-1">{track.releaseName}</TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">{track.isrc || "N/A"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {track.durationSeconds ? `${Math.floor(track.durationSeconds / 60)}:${(track.durationSeconds % 60).toString().padStart(2, '0')}` : "-:--"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="assets" className="m-0 h-full p-6">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  {[
                    { name: "cover_dilam_3000.jpg", size: "3000×3000", weight: "1.4 MB", type: "Cover Art", track: "Дилам мехохад" },
                    { name: "cover_navruz_3000.jpg", size: "3000×3000", weight: "1.8 MB", type: "Cover Art", track: "Наврӯз 2024" },
                    { name: "ishqi_man_master.wav", size: "44.1kHz / 16bit", weight: "38.2 MB", type: "Audio Master", track: "Ишки ман" },
                    { name: "shabi_nav_master.flac", size: "48kHz / 24bit", weight: "42.1 MB", type: "Audio Master", track: "Шаби нав" },
                    { name: "vatan_video_4k.mp4", size: "3840×2160", weight: "412 MB", type: "Music Video", track: "Ватан" },
                    { name: "lyrics_dilam.lrc", size: "2.1 KB", weight: "—", type: "Lyrics File", track: "Дилам мехохад" },
                    { name: "press_kit_2026.pdf", size: "—", weight: "8.4 MB", type: "Press Kit", track: "—" },
                    { name: "logo_label_vector.svg", size: "Vector", weight: "12 KB", type: "Brand Asset", track: "—" },
                  ].map((a, i) => (
                    <Card key={i} className="card-surface no-lift border-border/60">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <FileImage className="h-5 w-5 text-primary/70" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{a.name}</p>
                            <p className="text-[10px] text-muted-foreground">{a.type}</p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-1 text-[10px] text-muted-foreground font-mono">
                          <div>📐 {a.size}</div>
                          <div>💾 {a.weight}</div>
                          <div className="truncate">🎵 {a.track}</div>
                        </div>
                        <div className="mt-3 flex gap-1">
                          <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1">View</Button>
                          <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1">Replace</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="duplicates" className="m-0 h-full p-6">
                <Card className="card-surface no-lift border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                      Duplicate Detection
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Audio fingerprint анализ + metadata cross-check (имитация ACRCloud)</p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-background/30">
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Track A</TableHead>
                          <TableHead>Track B</TableHead>
                          <TableHead>Match</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { a: "Дилам мехохад · Давлатмандов", b: "My Heart Wants · DJ Cover Mix", match: "94%", type: "Audio Fingerprint", action: "review" },
                          { a: "Бахори нав · Зарина С.", b: "Бахори нав (Remix) · Зарина С.", match: "78%", type: "Title + Artist", action: "ok" },
                          { a: "Ватан · Камол Х.", b: "Ватан · Unknown Artist 9XX", match: "98%", type: "Audio Fingerprint", action: "block" },
                          { a: "Шаби нав · Камол Х.", b: "Shabi Nav · K. Khasanov", match: "100%", type: "ISRC duplicate", action: "merge" },
                        ].map((d, i) => (
                          <TableRow key={i} className="hover:bg-accent/20">
                            <TableCell className="text-sm">{d.a}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{d.b}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs font-mono ${parseInt(d.match) >= 90 ? "text-rose-400 bg-rose-500/10 border-rose-500/30" : "text-amber-400 bg-amber-500/10 border-amber-500/30"}`}>
                                {d.match}
                              </Badge>
                            </TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{d.type}</Badge></TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="h-7 text-xs">Compare</Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-400 hover:bg-rose-500/10">Block</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bulk" className="m-0 h-full p-6 space-y-4">
                <Card className="card-surface no-lift border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base">Bulk Edit Releases</CardTitle>
                    <p className="text-xs text-muted-foreground">Изменить поля у нескольких релизов сразу — фильтр + операция → preview → apply</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Filter</label>
                        <select className="w-full h-9 px-3 text-xs rounded-md bg-background/50 border border-border">
                          <option>Все релизы (217)</option>
                          <option>Status = approved (184)</option>
                          <option>Label = «Парвоз» (56)</option>
                          <option>Genre = Tajik Pop (78)</option>
                          <option>Year = 2024 (42)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Field</label>
                        <select className="w-full h-9 px-3 text-xs rounded-md bg-background/50 border border-border">
                          <option>Genre</option>
                          <option>Sub-genre</option>
                          <option>Label</option>
                          <option>Copyright (P)</option>
                          <option>Copyright (C)</option>
                          <option>Language</option>
                          <option>Territory</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">New Value</label>
                        <Input placeholder="e.g. Tajik Pop / Folk Fusion" className="bg-background/50 h-9 text-xs" />
                      </div>
                    </div>
                    <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-4">
                      <p className="text-xs font-medium mb-2 flex items-center gap-2">
                        <Wand2 className="h-3.5 w-3.5 text-primary" /> Preview affected releases:
                      </p>
                      <div className="text-xs text-muted-foreground space-y-0.5 font-mono">
                        <div>· Дилам мехохад → genre: «Tajik Pop» → «Tajik Pop / Folk Fusion»</div>
                        <div>· Бахори нав → genre: «Pop» → «Tajik Pop / Folk Fusion»</div>
                        <div>· Шаби нав → genre: «Pop» → «Tajik Pop / Folk Fusion»</div>
                        <div className="text-muted-foreground/60">… +75 more releases</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button>Apply to 78 releases</Button>
                      <Button variant="outline">Save as Preset</Button>
                      <Button variant="ghost">Cancel</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="codes" className="m-0 h-full p-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="card-surface no-lift border-border/60">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Hash className="h-4 w-4 text-primary" /> ISRC Generator
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Format: <span className="font-mono">CC-XXX-YY-NNNNN</span> · Country-Issuer-Year-Designation</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid gap-3 grid-cols-3">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Country</label>
                          <Input defaultValue="TJ" readOnly className="bg-background/30 h-9 text-xs font-mono" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Issuer</label>
                          <Input defaultValue="MUS" readOnly className="bg-background/30 h-9 text-xs font-mono" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Year</label>
                          <Input defaultValue="26" readOnly className="bg-background/30 h-9 text-xs font-mono" />
                        </div>
                      </div>
                      <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-4 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Next available ISRC</p>
                        <p className="text-lg font-mono font-bold text-primary">TJ-MUS-26-00135</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Last issued: TJ-MUS-26-00134 · Шаби нав</p>
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1"><Hash className="mr-1.5 h-3.5 w-3.5" /> Generate Single</Button>
                        <Button variant="outline" className="flex-1">Generate Batch (10)</Button>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/40">
                        <p>Total issued in 2026: <span className="text-foreground font-medium">134</span></p>
                        <p>Block remaining: <span className="text-foreground font-medium">99,866</span></p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="card-surface no-lift border-border/60">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Hash className="h-4 w-4 text-violet-400" /> UPC / EAN Generator
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Format: <span className="font-mono">12-digit GTIN-12</span> · Prefix + serial + check digit</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">UPC Prefix</label>
                        <Input defaultValue="888002" readOnly className="bg-background/30 h-9 text-xs font-mono" />
                      </div>
                      <div className="rounded-lg border border-violet-500/30 bg-violet-500/[0.04] p-4 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Next available UPC</p>
                        <p className="text-lg font-mono font-bold text-violet-400">888002 00218 7</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Last issued: 888002 00217 4 · «Наврӯз 2024»</p>
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1"><Hash className="mr-1.5 h-3.5 w-3.5" /> Generate Single</Button>
                        <Button variant="outline" className="flex-1">Generate Batch (10)</Button>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/40">
                        <p>Total issued: <span className="text-foreground font-medium">217</span></p>
                        <p>GS1 license: <span className="text-emerald-400 font-medium flex items-center gap-1 inline-flex"><CheckCircle2 className="h-3 w-3" /> Active until 2028</span></p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="card-surface no-lift border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base">Recent Code Issuance Log</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-background/30">
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Code</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Assigned to</TableHead>
                          <TableHead>Issued</TableHead>
                          <TableHead>By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { code: "TJ-MUS-26-00134", type: "ISRC", target: "Шаби нав · Камол Хасанов", date: "2026-04-11 11:02", by: "system (auto)" },
                          { code: "888002 00217 4", type: "UPC", target: "Наврӯз 2024 (album)", date: "2026-04-10 14:32", by: "Manager Алишер" },
                          { code: "TJ-MUS-26-00128", type: "ISRC", target: "Ишки ман · Рустам Назаров", date: "2026-04-08 09:15", by: "system (auto)" },
                          { code: "TJ-MUS-26-00120…00127", type: "ISRC batch (8)", target: "Bulk import — Парвоз label", date: "2026-04-05 18:30", by: "Lead Финдер" },
                        ].map((c, i) => (
                          <TableRow key={i} className="hover:bg-accent/20">
                            <TableCell className="font-mono text-xs">{c.code}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{c.type}</Badge></TableCell>
                            <TableCell className="text-sm text-muted-foreground">{c.target}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{c.date}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{c.by}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </Layout>
  );
}