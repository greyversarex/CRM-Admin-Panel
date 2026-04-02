import { Layout } from "@/components/layout";
import { useListPublishingWorks } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Filter, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Publishing() {
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: worksData, isLoading } = useListPublishingWorks({ 
    search: searchQuery || undefined,
    limit: 50 
  });

  return (
    <Layout>
      <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Publishing Works</h1>
            <p className="text-muted-foreground mt-1">Manage compositions, writers, and PRO registrations.</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Work
          </Button>
        </div>

        <Card className="flex-1 bg-card/50 backdrop-blur border-border/50 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-80">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search titles, ISWC, writers..."
                  className="pl-8 bg-background/50 border-border"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon" className="shrink-0 bg-background/50">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-auto">
            <Table>
              <TableHeader className="bg-background/50 sticky top-0 z-10">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>ISWC</TableHead>
                  <TableHead>Writers</TableHead>
                  <TableHead>Registrations</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-[120px]" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-[80px] rounded-full" /></TableCell>
                    </TableRow>
                  ))
                ) : worksData?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">
                      No publishing works found.
                    </TableCell>
                  </TableRow>
                ) : (
                  worksData?.data.map((work) => (
                    <TableRow key={work.id} className="border-border/50 hover:bg-accent/30 cursor-pointer">
                      <TableCell>
                        <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                          <FileText className="h-4 w-4" />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{work.title}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{work.iswc || 'Pending'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="text-sm">
                          {work.writers?.slice(0, 2).map(w => `${w.name} (${w.share}%)`).join(', ')}
                          {(work.writers?.length || 0) > 2 && '...'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {work.songtrust && <Badge variant="secondary" className="text-[10px] bg-slate-800 text-slate-300 hover:bg-slate-700">Songtrust</Badge>}
                          {work.ascap && <Badge variant="secondary" className="text-[10px] bg-blue-900/30 text-blue-400 hover:bg-blue-900/50">ASCAP</Badge>}
                          {work.bmi && <Badge variant="secondary" className="text-[10px] bg-indigo-900/30 text-indigo-400 hover:bg-indigo-900/50">BMI</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={work.status} />
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