import { useState } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useListSplits, getListSplitsQueryKey, useDeleteSplit } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Trash2, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { NewSplitDialog } from "./_new-split-dialog";
import { useLang } from "@/lib/i18n";

const COLORS = [
  "bg-violet-500/10 text-violet-400 border-violet-500/20",
  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "bg-rose-500/10 text-rose-400 border-rose-500/20",
];

const BAR_COLORS = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];

export default function Splits() {
  return (
    <Layout>
      <SplitsPanel />
    </Layout>
  );
}

export function SplitsPanel() {
  const { user } = useAuth();
  const { t } = useLang();
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const queryClient = useQueryClient();

  const isAdminLike = user?.role === "admin" || user?.role === "manager";
  const isArtist    = user?.role === "artist";

  const params = {
    page, limit: 20,
    ...(isArtist && user?.artistId ? { artist_id: user.artistId } : {}),
  };
  const { data, isLoading } = useListSplits(params, {
    query: { queryKey: getListSplitsQueryKey(params) },
  });

  const title    = isAdminLike ? t.splits.title_admin : isArtist ? t.splits.title_artist : t.splits.title_label;
  const subtitle = isAdminLike ? t.splits.subtitle_admin : t.splits.subtitle_other;

  const deleteSplit = useDeleteSplit({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSplitsQueryKey() });
        toast({ title: t.splits.deleted });
      },
      onError: () => {
        toast({ title: t.splits.delete_error, variant: "destructive" });
      },
    },
  });

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground mt-1">{subtitle}</p>
          </div>
          {isAdminLike && (
            <Button className="gap-2" data-testid="button-new-split" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.splits.new_split}
            </Button>
          )}
        </div>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              {t.splits.all_splits} ({data?.pagination.total ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-background/50 sticky top-0 z-10">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead>{t.splits.table.entity}</TableHead>
                  <TableHead>{t.splits.table.participants}</TableHead>
                  <TableHead>{t.splits.table.distribution}</TableHead>
                  <TableHead>{t.splits.table.created}</TableHead>
                  <TableHead className="text-right">{t.splits.table.actions}</TableHead>
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
                      {t.splits.empty}
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
                        <div className="text-xs text-muted-foreground">{split.releaseId ? t.splits.release_type : t.splits.track_type}</div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {t.splits.participants_count.replace("{n}", String(participants.length))}
                        </span>
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
                        {isAdminLike ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                            data-testid={`button-delete-split-${split.id}`}
                            onClick={() => deleteSplit.mutate({ id: split.id })}
                            aria-label={`Delete split ${split.releaseName ?? split.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
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
                {t.splits.page_of.replace("{p}", String(data.pagination.page)).replace("{t}", String(data.pagination.totalPages))}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t.splits.previous}</Button>
                <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>{t.splits.next}</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
      <NewSplitDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}
