/**
 * Distribution / Takedowns tab — заявки на снятие релиза с DSP.
 *
 * GET    /api/takedowns                     — список (scope-aware: admin видит всё)
 * PATCH  /api/takedowns/:id/status          — изменить статус (admin/manager)
 *
 * Колонки: релиз/артист, UPC, причина, площадки, статус, отправлено/завершено,
 * действия (взять в работу / завершить / отклонить).
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search, Ban, CheckCircle2, XCircle, Hourglass, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type Takedown = {
  id: number;
  release: string;
  artist: string;
  upc: string;
  reason: string;
  note: string;
  dsps: string[];
  status: "pending" | "processing" | "completed" | "rejected";
  submittedAt: string;
  completedAt: string | null;
};

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}
async function jpatch<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "PATCH", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function StatusBadge({ s }: { s: Takedown["status"] }) {
  const map: Record<Takedown["status"], { label: string; cls: string; icon: typeof Hourglass }> = {
    pending:    { label: "Ожидает",   cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",     icon: Hourglass },
    processing: { label: "В работе",  cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300",        icon: ListChecks },
    completed:  { label: "Снят",      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", icon: CheckCircle2 },
    rejected:   { label: "Отклонён",  cls: "bg-red-500/15 text-red-700 dark:text-red-300",            icon: XCircle },
  };
  const { label, cls, icon: Icon } = map[s];
  return <Badge className={cls} variant="outline"><Icon className="h-3 w-3 mr-1" />{label}</Badge>;
}

export function TakedownsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"all" | Takedown["status"]>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["takedowns"],
    queryFn: () => jget<Takedown[]>(`/api/takedowns`),
    refetchInterval: 30_000,
  });

  const items = useMemo(() => {
    let arr = q.data ?? [];
    if (statusFilter !== "all") arr = arr.filter((i) => i.status === statusFilter);
    const s = search.trim().toLowerCase();
    if (s) arr = arr.filter((i) =>
      i.release.toLowerCase().includes(s) ||
      i.artist.toLowerCase().includes(s) ||
      i.upc.includes(s),
    );
    return arr;
  }, [q.data, statusFilter, search]);

  const counts = useMemo(() => {
    const all = q.data ?? [];
    return {
      pending:    all.filter((i) => i.status === "pending").length,
      processing: all.filter((i) => i.status === "processing").length,
      completed:  all.filter((i) => i.status === "completed").length,
      rejected:   all.filter((i) => i.status === "rejected").length,
    };
  }, [q.data]);

  const setStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Takedown["status"] }) =>
      jpatch(`/api/takedowns/${id}/status`, { status }),
    onSuccess: () => {
      toast({ title: "Статус заявки обновлён" });
      qc.invalidateQueries({ queryKey: ["takedowns"] });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Ошибка", description: e.message }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold">Заявки на снятие (Takedowns)</h3>
          <p className="text-xs text-muted-foreground">
            Релизы, которые нужно убрать с DSP. После «В работу» создайте Takedown-сообщение в разделе DDEX Logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск" className="pl-8 w-60"
              data-testid="input-takedown-search"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className="h-4 w-4 mr-1" />Обновить
          </Button>
        </div>
      </div>

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
        <TabsList>
          <TabsTrigger value="all">Все</TabsTrigger>
          <TabsTrigger value="pending">Ожидают <Badge className="ml-2" variant="secondary">{counts.pending}</Badge></TabsTrigger>
          <TabsTrigger value="processing">В работе <Badge className="ml-2" variant="secondary">{counts.processing}</Badge></TabsTrigger>
          <TabsTrigger value="completed">Снятые <Badge className="ml-2" variant="secondary">{counts.completed}</Badge></TabsTrigger>
          <TabsTrigger value="rejected">Отклонённые <Badge className="ml-2" variant="secondary">{counts.rejected}</Badge></TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Релиз / артист</TableHead>
              <TableHead>UPC</TableHead>
              <TableHead>Причина</TableHead>
              <TableHead>Площадки</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Подано</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && <TableRow><TableCell colSpan={7}><Skeleton className="h-16" /></TableCell></TableRow>}
            {q.isSuccess && items.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                Заявок нет.
              </TableCell></TableRow>
            )}
            {items.map((t) => (
              <TableRow key={t.id} data-testid={`row-takedown-${t.id}`}>
                <TableCell>
                  <div className="font-medium">{t.release}</div>
                  <div className="text-xs text-muted-foreground">{t.artist || "—"}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{t.upc || "—"}</TableCell>
                <TableCell className="max-w-[260px]">
                  <div className="text-sm">{t.reason}</div>
                  {t.note && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.note}</div>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {t.dsps.map((d) => <Badge key={d} variant="outline" className="text-xs">{d}</Badge>)}
                  </div>
                </TableCell>
                <TableCell><StatusBadge s={t.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div>{fmtDate(t.submittedAt)}</div>
                  {t.completedAt && <div>выполнен: {fmtDate(t.completedAt)}</div>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {t.status === "pending" && (
                      <Button size="sm" variant="outline" disabled={setStatusMut.isPending}
                        onClick={() => setStatusMut.mutate({ id: t.id, status: "processing" })}
                        data-testid={`button-process-${t.id}`}>
                        В работу
                      </Button>
                    )}
                    {(t.status === "pending" || t.status === "processing") && (
                      <>
                        <Button size="sm" disabled={setStatusMut.isPending}
                          onClick={() => setStatusMut.mutate({ id: t.id, status: "completed" })}
                          data-testid={`button-complete-${t.id}`}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Снят
                        </Button>
                        <Button size="sm" variant="destructive" disabled={setStatusMut.isPending}
                          onClick={() => setStatusMut.mutate({ id: t.id, status: "rejected" })}
                          data-testid={`button-reject-${t.id}`}>
                          <Ban className="h-3.5 w-3.5 mr-1" />Отклонить
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
