import { Layout } from "@/components/layout";
import { useListReleases, useListTracks } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download, Plus, Filter, Music, Image as ImageIcon } from "lucide-react";
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
                <TabsList className="bg-background/50 border border-border">
                  <TabsTrigger value="releases" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    Releases
                  </TabsTrigger>
                  <TabsTrigger value="tracks" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    Tracks
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
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </Layout>
  );
}