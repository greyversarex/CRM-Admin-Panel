/**
 * Компактная панель отправки релиза в Broma16 (ROD) — только для admin/manager.
 *
 * Показывает статус интеграции релиза (Broma16 ID, статус модерации, время
 * последней отправки, ошибку, прогресс фоновой задачи) и позволяет запустить/
 * повторить отправку и проверить модерацию.
 *
 * Витрины ЗДЕСЬ НЕ выбираются — выбор площадок живёт в разделе «Выбор площадок»
 * (release.broma16DistributionOutlets); отправка использует уже сохранённый
 * выбор. Пока задача в очереди/выполняется — статус опрашивается каждые 4 сек.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, RefreshCw, Radio, Loader2, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// ── Типы ответов API ───────────────────────────────────────────────
interface PushReleaseState {
  broma16ReleaseId: number | null;
  broma16ModerationStatus: string | null;
  broma16PushedAt: string | null;
  broma16LastError: string | null;
  broma16DistributionOutlets: string[] | null;
}
interface PushJobState {
  id: number;
  status: "queued" | "processing" | "success" | "failed";
  step: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string | null;
}
interface PushStatusResp {
  release: PushReleaseState;
  job: PushJobState | null;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
async function apiPost<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "POST", credentials: "same-origin" });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// Человекочитаемые названия шагов 9-этапной отправки.
const STEP_LABELS: Record<string, string> = {
  queued:         "В очереди",
  artist:         "Артист",
  create_release: "Создание релиза",
  upload_tracks:  "Загрузка треков",
  track_metadata: "Метаданные треков",
  composition:    "Композиция и авторы",
  lyrics:         "Тексты",
  cover:          "Обложка",
  distribution:   "Витрины",
  moderate:       "Отправка на модерацию",
  done:           "Готово",
};
const stepLabel = (s: string) => STEP_LABELS[s] ?? s;

function ModerationBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const s = status.toLowerCase();
  const tone =
    s.includes("approv") || s.includes("одобр") || s === "ok"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : s.includes("reject") || s.includes("откл") || s.includes("error")
        ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
        : "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return <Badge variant="outline" className={`text-[10px] ${tone}`}>{status}</Badge>;
}

export function Broma16PushCard({ releaseId }: { releaseId: number }) {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["broma16-push", releaseId],
    queryFn: () => apiGet<PushStatusResp>(`/api/broma16/releases/${releaseId}/push`),
    enabled: Number.isFinite(releaseId) && releaseId > 0,
    refetchInterval: (q) => {
      const st = q.state.data?.job?.status;
      return st === "queued" || st === "processing" ? 4000 : false;
    },
  });

  const job = statusQuery.data?.job ?? null;
  const release = statusQuery.data?.release ?? null;
  const inFlight = job?.status === "queued" || job?.status === "processing";
  const outletCount = release?.broma16DistributionOutlets?.length ?? 0;

  const pushMutation = useMutation({
    // Тело не передаём: пушер возьмёт витрины, сохранённые в «Выбор площадок»
    // (release.broma16DistributionOutlets); пустой набор → базовые витрины.
    mutationFn: () =>
      apiPost<{ ok: boolean; jobId: number; status: string }>(`/api/broma16/releases/${releaseId}/push`),
    onSuccess: () => {
      toast({ title: "Отправка запущена", description: "Релиз поставлен в очередь на отправку в Broma16." });
      queryClient.invalidateQueries({ queryKey: ["broma16-push", releaseId] });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Не удалось запустить отправку", description: (e as Error).message });
    },
  });

  const checkModerationMutation = useMutation({
    mutationFn: () =>
      apiPost<{ ok: boolean; checked: boolean; changed: boolean; verdict: string; raw: string | null }>(
        `/api/broma16/releases/${releaseId}/check-moderation`,
      ),
    onSuccess: (r) => {
      const label =
        r.verdict === "approved" ? "одобрен" : r.verdict === "rejected" ? "отклонён" : "ещё на модерации";
      toast({
        title: r.changed ? "Статус модерации обновлён" : "Статус проверен",
        description: r.changed
          ? `Релиз ${label}.`
          : `Текущий статус: ${label}${r.raw ? ` (${r.raw})` : ""}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["broma16-push", releaseId] });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Не удалось проверить статус", description: (e as Error).message });
    },
  });

  const everPushed = Boolean(release?.broma16ReleaseId) || Boolean(job);
  const hasError = Boolean(release?.broma16LastError) || job?.status === "failed";
  const pushLabel = inFlight
    ? "Отправляется…"
    : everPushed
      ? (hasError ? "Повторить отправку" : "Отправить снова")
      : "Отправить в Broma16";

  const pushedAt = release?.broma16PushedAt
    ? new Date(release.broma16PushedAt).toLocaleString("ru-RU")
    : null;

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="h-4 w-4 text-primary" /> Отправка в Broma16
        </CardTitle>
        <div className="flex items-center gap-2">
          {inFlight && (
            <Badge variant="outline" className="text-[10px] gap-1 text-indigo-300 bg-indigo-500/10 border-indigo-500/20">
              <Loader2 className="h-3 w-3 animate-spin" /> {stepLabel(job!.step)}
            </Badge>
          )}
          {!inFlight && job?.status === "success" && (
            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3" /> Отправлено
            </Badge>
          )}
          {!inFlight && job?.status === "failed" && (
            <Badge variant="outline" className="text-[10px] gap-1 text-rose-400 bg-rose-500/10 border-rose-500/20">
              <AlertTriangle className="h-3 w-3" /> Ошибка
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {statusQuery.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : statusQuery.error ? (
          <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2">
            Не удалось загрузить статус: {(statusQuery.error as Error).message}
          </div>
        ) : (
          <>
            {/* Текущее состояние релиза в Broma16 */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Broma16 ID</div>
                <div className="font-mono">{release?.broma16ReleaseId ?? "—"}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Статус модерации</div>
                <div>{release?.broma16ModerationStatus ? <ModerationBadge status={release.broma16ModerationStatus} /> : "—"}</div>
              </div>
              {pushedAt && (
                <div className="col-span-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Последняя отправка: {pushedAt}
                </div>
              )}
            </div>

            {/* Витрины выбираются в «Выбор площадок» — здесь только сводка. */}
            <div className="text-xs text-muted-foreground">
              {outletCount > 0 ? (
                <>Витрин к отправке: <span className="font-medium text-foreground/80">{outletCount}</span>. Изменить набор можно в разделе «Выбор площадок».</>
              ) : (
                <>Площадки не выбраны в «Выбор площадок» — при отправке уйдёт базовый набор витрин.</>
              )}
            </div>

            {(release?.broma16LastError || job?.lastError) && (
              <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2 break-words">
                <span className="font-medium">Ошибка отправки:</span> {release?.broma16LastError ?? job?.lastError}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                onClick={() => pushMutation.mutate()}
                disabled={inFlight || pushMutation.isPending}
                className="bg-gradient-to-r from-primary to-violet-500 hover:opacity-95"
              >
                {inFlight || pushMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : hasError ? (
                  <RefreshCw className="mr-2 h-4 w-4" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {pushLabel}
              </Button>
              {everPushed && (
                <Button
                  variant="outline"
                  onClick={() => checkModerationMutation.mutate()}
                  disabled={checkModerationMutation.isPending}
                  title="Запросить у Broma16 текущий статус модерации релиза"
                >
                  {checkModerationMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Проверить статус
                </Button>
              )}
              {inFlight && (
                <span className="text-xs text-muted-foreground">
                  Шаг: {stepLabel(job!.step)}{job!.attempts > 1 ? ` · попытка ${job!.attempts}` : ""}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
