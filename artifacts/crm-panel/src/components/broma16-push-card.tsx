/**
 * Карточка отправки релиза в Broma16 (ROD) — только для admin/manager.
 *
 * Показывает текущий статус интеграции релиза (Broma16 ID, статус модерации,
 * выбранные витрины, последнюю ошибку, прогресс фоновой задачи) и позволяет
 * запустить/повторить отправку. Витрины выбираются из локального кэша словаря
 * outlet. Пока задача в очереди/выполняется — статус опрашивается каждые 4 сек.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
interface OutletEntry {
  externalId: string;
  code: string | null;
  name: string;
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
async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
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
  const [selected, setSelected] = useState<string[] | null>(null);

  const statusQuery = useQuery({
    queryKey: ["broma16-push", releaseId],
    queryFn: () => apiGet<PushStatusResp>(`/api/broma16/releases/${releaseId}/push`),
    enabled: Number.isFinite(releaseId) && releaseId > 0,
    refetchInterval: (q) => {
      const st = q.state.data?.job?.status;
      return st === "queued" || st === "processing" ? 4000 : false;
    },
  });

  const outletsQuery = useQuery({
    queryKey: ["broma16-dict-outlet"],
    queryFn: () => apiGet<{ type: string; items: OutletEntry[] }>(`/api/broma16/dictionaries/outlet`),
    enabled: Number.isFinite(releaseId) && releaseId > 0,
    staleTime: 5 * 60_000,
  });

  const outlets = outletsQuery.data?.items ?? [];
  const savedOutlets = statusQuery.data?.release.broma16DistributionOutlets ?? null;

  // Инициализируем выбор витрин из сохранённых в релизе значений (один раз,
  // когда статус загрузился). Дальше пользователь управляет выбором сам.
  useEffect(() => {
    if (selected === null && statusQuery.data) {
      setSelected(savedOutlets && savedOutlets.length > 0 ? savedOutlets : []);
    }
  }, [statusQuery.data, savedOutlets, selected]);

  const job = statusQuery.data?.job ?? null;
  const release = statusQuery.data?.release ?? null;
  const inFlight = job?.status === "queued" || job?.status === "processing";

  const pushMutation = useMutation({
    mutationFn: () =>
      apiPost<{ ok: boolean; jobId: number; status: string }>(
        `/api/broma16/releases/${releaseId}/push`,
        // Всегда передаём текущий выбор (в т.ч. пустой массив) — пустой список
        // явно сбрасывает сохранённые витрины и означает «базовый набор».
        { outlets: selected ?? [] },
      ),
    onSuccess: () => {
      toast({ title: "Отправка запущена", description: "Релиз поставлен в очередь на отправку в Broma16." });
      queryClient.invalidateQueries({ queryKey: ["broma16-push", releaseId] });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Не удалось запустить отправку", description: (e as Error).message });
    },
  });

  const matchesOutlet = (o: OutletEntry, picked: string[]) => {
    const keys = [o.code, o.externalId, o.name].filter(Boolean) as string[];
    return picked.some((p) => keys.some((k) => k.toLowerCase() === p.toLowerCase()));
  };
  const toggleOutlet = (o: OutletEntry) => {
    const value = o.code ?? o.externalId;
    setSelected((prev) => {
      const cur = prev ?? [];
      return matchesOutlet(o, cur)
        ? cur.filter((p) => p.toLowerCase() !== value.toLowerCase()
            && p.toLowerCase() !== o.name.toLowerCase()
            && p.toLowerCase() !== o.externalId.toLowerCase())
        : [...cur, value];
    });
  };

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

  const displayOutlets = useMemo(() => {
    if (!savedOutlets || savedOutlets.length === 0) return null;
    const byKey = new Map<string, string>();
    for (const o of outlets) {
      if (o.code) byKey.set(o.code.toLowerCase(), o.name);
      byKey.set(o.externalId.toLowerCase(), o.name);
      byKey.set(o.name.toLowerCase(), o.name);
    }
    return savedOutlets.map((c) => byKey.get(c.toLowerCase()) ?? c);
  }, [savedOutlets, outlets]);

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="h-4 w-4 text-primary" /> Broma16 (дистрибуция)
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

            {displayOutlets && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Выбранные витрины</div>
                <div className="flex flex-wrap gap-1.5">
                  {displayOutlets.map((name) => (
                    <Badge key={name} variant="outline" className="text-[10px] text-muted-foreground">{name}</Badge>
                  ))}
                </div>
              </div>
            )}

            {(release?.broma16LastError || job?.lastError) && (
              <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2 break-words">
                <span className="font-medium">Ошибка отправки:</span> {release?.broma16LastError ?? job?.lastError}
              </div>
            )}

            {/* Выбор витрин из словаря outlet */}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                Витрины для отправки
                {outlets.length === 0 && (
                  <span className="ml-2 normal-case text-amber-400/90">
                    словарь пуст — синхронизируйте словари в настройках (по умолчанию отправим базовый набор)
                  </span>
                )}
              </div>
              {outletsQuery.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : outlets.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                  {outlets.map((o) => {
                    const checked = matchesOutlet(o, selected ?? []);
                    return (
                      <label key={o.externalId} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={checked} onCheckedChange={() => toggleOutlet(o)} disabled={inFlight} />
                        <span className="truncate" title={o.name}>{o.name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
              {selected && selected.length === 0 && outlets.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Ничего не выбрано — будет отправлен базовый набор витрин.
                </p>
              )}
            </div>

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
