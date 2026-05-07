/**
 * Distribution / Moderation tab — очередь модерации релизов перед уходом в DSP.
 *
 * Показывает релизы со статусом pending_review / approved / rejected. По каждому:
 *   • базовые метаданные (title/artist/type/UPC)
 *   • статус загрузки аудио (X/Y треков с реальным asset row в storage)
 *   • статус ACR-проверки (none/pending/clean/match/error)
 *   • risk_score из risk-engine + кол-во issues
 *   • действия: Просмотреть детали (Review) и Открыть карточку релиза.
 *
 * Для admin/manager здесь же — кнопки одобрения/отклонения, что вызывают
 * PATCH /releases/:id/status и обновляют список.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertCircle, Search, ExternalLink, ShieldCheck, FileMusic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ModerationDetailDialog } from "./moderation-detail-dialog";

type ModerationItem = {
  id: number;
  title: string;
  artistId: number | null;
  artistName: string;
  releaseType: string;
  upc: string;
  status: string;
  statusNote: string | null;
  submittedAt: string;
  audio: { total: number; withAudio: number };
  acr: { status: string; lastScannedAt: string | null; totalChecks: number };
  riskScore: number | null;
  issuesCount: number;
};

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function AudioBadge({ a }: { a: ModerationItem["audio"] }) {
  if (a.total === 0) return <Badge variant="outline" className="text-muted-foreground">нет треков</Badge>;
  const ok = a.withAudio === a.total;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
      <FileMusic className="h-3.5 w-3.5" />
      {a.withAudio}/{a.total} {ok ? "OK" : "fail"}
    </span>
  );
}

function QcBadge({ acr, issues }: { acr: ModerationItem["acr"]; issues: number }) {
  if (acr.status === "match") {
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400"><AlertCircle className="h-3.5 w-3.5" />ACR совпадение</span>;
  }
  if (acr.status === "error") {
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"><AlertCircle className="h-3.5 w-3.5" />ACR ошибка</span>;
  }
  if (issues > 0) {
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"><AlertCircle className="h-3.5 w-3.5" />{issues} замечание</span>;
  }
  if (acr.status === "clean") {
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Прошёл</span>;
  }
  if (acr.status === "pending") {
    return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />в очереди</span>;
  }
  return <span className="text-xs text-muted-foreground">не запущен</span>;
}

function RiskBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const cls =
    score >= 70 ? "bg-red-500/15 text-red-700 dark:text-red-300" :
    score >= 40 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" :
                  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  return <Badge className={cls} variant="outline"><ShieldCheck className="h-3 w-3 mr-1" />risk {score}</Badge>;
}

export function ModerationTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"pending_review" | "approved" | "rejected" | "all">("pending_review");
  const [search, setSearch] = useState("");
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  const listQ = useQuery({
    queryKey: ["moderation", statusFilter],
    queryFn: () => jget<{ items: ModerationItem[] }>(`/api/distribution/moderation?status=${statusFilter}&limit=100`),
    refetchInterval: 15_000,
  });

  const items = useMemo(() => {
    const all = listQ.data?.items ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter((i) =>
      i.title.toLowerCase().includes(q) ||
      i.artistName.toLowerCase().includes(q) ||
      i.upc.includes(q),
    );
  }, [listQ.data, search]);

  const counts = useMemo(() => {
    const all = listQ.data?.items ?? [];
    return {
      total: all.length,
      audioFail: all.filter((i) => i.audio.total > 0 && i.audio.withAudio < i.audio.total).length,
      acrIssue: all.filter((i) => i.acr.status === "match" || i.acr.status === "error").length,
    };
  }, [listQ.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold">Очередь модерации релизов</h3>
          <p className="text-xs text-muted-foreground">
            Релизы перед отправкой в DSP. Проверьте загруженное аудио и результаты ACR, прежде чем одобрять.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию / артисту / UPC"
              className="pl-8 w-72"
              data-testid="input-moderation-search"
            />
          </div>
        </div>
      </div>

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
        <TabsList>
          <TabsTrigger value="pending_review" data-testid="tab-pending">Ожидают <Badge className="ml-2" variant="secondary">{statusFilter === "pending_review" ? counts.total : ""}</Badge></TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">Одобренные</TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">Отклонённые</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">Все</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Релиз</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>UPC</TableHead>
              <TableHead>Получено</TableHead>
              <TableHead>Аудио</TableHead>
              <TableHead>QC</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading && <TableRow><TableCell colSpan={7}><Skeleton className="h-16 w-full" /></TableCell></TableRow>}
            {listQ.isSuccess && items.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                {statusFilter === "pending_review" ? "Очередь пуста — все релизы рассмотрены." : "Релизов с этим статусом нет."}
              </TableCell></TableRow>
            )}
            {items.map((r) => (
              <TableRow key={r.id} data-testid={`row-moderation-${r.id}`}>
                <TableCell>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">{r.artistName || "—"}</div>
                </TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{r.releaseType}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{r.upc || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(r.submittedAt)}</TableCell>
                <TableCell><AudioBadge a={r.audio} /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 flex-wrap">
                    <QcBadge acr={r.acr} issues={r.issuesCount} />
                    <RiskBadge score={r.riskScore} />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant={r.status === "pending_review" ? "default" : "outline"} onClick={() => setReviewingId(r.id)} data-testid={`button-review-${r.id}`}>
                      {r.status === "pending_review" ? "Рассмотреть" : "Детали"}
                    </Button>
                    <Button asChild size="sm" data-testid={`button-open-${r.id}`}>
                      <Link href={`/releases/${r.id}`}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Открыть
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {reviewingId != null && (
        <ModerationDetailDialog
          releaseId={reviewingId}
          onClose={() => setReviewingId(null)}
          onDecided={() => {
            setReviewingId(null);
            qc.invalidateQueries({ queryKey: ["moderation"] });
            toast({ title: "Статус релиза обновлён" });
          }}
        />
      )}
    </div>
  );
}

