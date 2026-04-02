import { Layout } from "@/components/layout";
import { useListReleases } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download, Plus, Filter, Image as ImageIcon, MoreHorizontal, FileEdit, Send, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";

export default function Releases() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  
  const { data: releasesData, isLoading } = useListReleases({ 
    search: searchQuery || undefined,
    limit: 50 
  });

  return (
    <Layout>
      <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Releases</h1>
            <p className="text-muted-foreground mt-1">Create, edit, and deliver releases to DSPs.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="bg-card">
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
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-80">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search releases by title, artist, UPC..."
                    className="pl-8 bg-background/50 border-border"
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
            <Table>
              <TableHeader className="bg-background/50 sticky top-0 z-10">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-[80px]">Cover</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Artist & Label</TableHead>
                  <TableHead>Metadata</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell><Skeleton className="h-12 w-12 rounded-md" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-[150px]" />
                          <Skeleton className="h-3 w-[100px]" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <Skeleton className="h-3 w-[120px]" />
                          <Skeleton className="h-3 w-[80px]" />
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-6 w-[100px] rounded-full" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 rounded-md ml-auto" /></TableCell>
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
                    <TableRow 
                      key={release.id} 
                      className="border-border/50 hover:bg-accent/30 cursor-pointer transition-colors group"
                      onClick={() => setLocation(`/releases/${release.id}`)}
                    >
                      <TableCell>
                        <div className="h-12 w-12 rounded-md overflow-hidden bg-muted flex items-center justify-center border border-border shadow-sm group-hover:shadow-md transition-shadow">
                          {release.coverUrl ? (
                            <img src={release.coverUrl} alt={release.title} className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-foreground">{release.title}</div>
                        <div className="text-xs text-muted-foreground capitalize flex items-center gap-1.5 mt-0.5">
                          {release.releaseType}
                          <span className="w-1 h-1 rounded-full bg-border inline-block"></span>
                          {release.totalTracks} {release.totalTracks === 1 ? 'Track' : 'Tracks'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">{release.artistName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{release.labelName || 'Independent'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground flex flex-col gap-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-muted-foreground/70 font-mono">UPC:</span> 
                            <span className="text-foreground">{release.upc || "Pending"}</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-muted-foreground/70">Release:</span> 
                            <span className="text-foreground">{release.releaseDate ? new Date(release.releaseDate).toLocaleDateString() : "TBD"}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={release.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-background/80">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setLocation(`/releases/${release.id}`) }}>
                              <FileEdit className="mr-2 h-4 w-4" />
                              Edit Release
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <Send className="mr-2 h-4 w-4" />
                              Deliver to DSPs
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={(e) => e.stopPropagation()}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}