import { useState } from "react";
import { Layout } from "@/components/layout";
import { useListSplits, getListSplitsQueryKey, useDeleteSplit } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Trash2, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const COLORS = [
  "bg-violet-500/10 text-violet-400 border-violet-500/20",
  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "bg-rose-500/10 text-rose-400 border-rose-500/20",
];

const BAR_COLORS = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];

export default function Splits() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const params = { page, limit: 20 };
  const { data, isLoading } = useListSplits(params, {
    query: { queryKey: getListSplitsQueryKey(params) },
  });

  const deleteSplit = useDeleteSplit({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSplitsQueryKey() });
        toast({ title: "Split deleted successfully" });
      },
      onError: () => {
        toast({ title: "Failed to delete split", variant: "destructive" });
      },
    },
  });

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Revenue Splits</h1>
            <p className="text-muted-foreground mt-1">Manage how revenue is distributed between artists, labels, and collaborators.</p>
          </div>
          <Button className="gap-2" data-testid="button-new-split">
            <Plus className="h-4 w-4" />
            New Split
          </Button>
        </div>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              All Splits ({data?.pagination.total ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-background/50 sticky top-0 z-10">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead>Entity</TableHead>
                  <TableHead>Participants</TableHead>
                  <TableHead>Distribution</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-64" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : (data?.data.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No splits defined yet. Create a split to distribute revenue.
                    </TableCell>
                  </TableRow>
                ) : data?.data.map(split => {
                  const participants: Array<{ entityName: string; percentage: number }> = Array.isArray(split.participants)
                    ? (split.participants as Array<{ entityName: string; percentage: number }>)
                    : [];
                  return (
                    <TableRow key={split.id} className="border-border/50 hover:bg-accent/30" data-testid={`row-split-${split.id}`}>
                      <TableCell>
                        <div className="font-medium text-sm">{split.releaseName || split.trackName || `Split #${split.id}`}</div>
                        <div className="text-xs text-muted-foreground">{split.releaseId ? "Release" : "Track"}</div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{participants.length} participants</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {participants.map((p, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className={`text-xs font-mono ${COLORS[idx % COLORS.length]}`}
                            >
                              {p.entityName}: {p.percentage}%
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden flex">
                          {participants.map((p, idx) => (
                            <div
                              key={idx}
                              className={`h-full ${BAR_COLORS[idx % BAR_COLORS.length]}`}
                              style={{ width: `${p.percentage}%` }}
                            />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(split.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                          data-testid={`button-delete-split-${split.id}`}
                          onClick={() => deleteSplit.mutate({ id: split.id })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-border/50">
              <span className="text-sm text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
