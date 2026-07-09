/**
 * Управление дистрибуцией релиза в Broma16 (ROD) — компактный контрол в блоке
 * действий на странице релиза.
 *
 * Раньше это была большая карточка со статусом. Теперь на странице остаётся
 * только компактный индикатор статуса модерации/отправки, а у администратора —
 * кнопка «Дистрибуция», открывающая модалку. Внутри модалки: статус (Broma16 ID,
 * статус модерации, время последней отправки, ошибки доставки), выбор площадок
 * (предзаполнен из ранее выбранных витрин релиза — release.broma16DistributionOutlets)
 * с кнопкой «Отправить», и «Проверить статус».
 *
 * Права: контрол монтируется для admin+manager (гейт на странице релиза).
 * Кнопку отправки и модалку видит/использует ТОЛЬКО администратор; менеджер
 * видит лишь компактный индикатор статуса. Отправка доступна только для
 * одобренного релиза (status === "approved"; совпадает с проверкой на бэке).
 * Пока задача в очереди/выполняется — статус опрашивается каждые 4 сек.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { OutletPickerInline } from "@/components/release-wizard/dsp-picker";
import { useCatalogOptions } from "@/components/release-wizard/use-catalog";
import { useAuth } from "@/lib/auth";
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
async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

export function Broma16DistributionControl({
  releaseId, releaseStatus,
}: {
  releaseId: number;
  releaseStatus: string;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  // Отправлять можно только одобренный релиз (совпадает с проверкой на бэке).
  const canSend = releaseStatus === "approved";

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
  const everPushed = Boolean(release?.broma16ReleaseId) || Boolean(job);
  const hasError = Boolean(release?.broma16LastError) || job?.status === "failed";
  const outletCount = release?.broma16DistributionOutlets?.length ?? 0;
  const pushedAt = release?.broma16PushedAt
    ? new Date(release.broma16PushedAt).toLocaleString("ru-RU")
    : null;

  // ── Модалка выбора площадок (только админ). Черновик заполняется сохранённым
  // набором витрин при каждом открытии; словарь нужен, чтобы при отправке
  // отсеять устаревшие коды (их уже нет в справочнике Broma16).
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const { options: outletOptions } = useCatalogOptions("outlet", { valueKey: "code" });
  useEffect(() => {
    if (modalOpen) setDraft(release?.broma16DistributionOutlets ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  const sendMutation = useMutation({
    // Витрины передаём в теле: пушер сохранит их (release.broma16DistributionOutlets)
    // и поставит релиз в очередь. Пустой набор → базовые витрины по умолчанию.
    mutationFn: (outlets: string[]) =>
      apiPost<{ ok: boolean; jobId: number; status: string }>(
        `/api/broma16/releases/${releaseId}/push`, { outlets },
      ),
    onSuccess: () => {
      toast({ title: "Отправка запущена", description: "Релиз поставлен в очередь на отправку в Broma16." });
      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["broma16-push", releaseId] });
      // Синхронизируем сводку площадок на странице релиза / «Выбор площадок».
      queryClient.invalidateQueries({ queryKey: ["release-outlets", releaseId] });
    },
    onError: (e) => {
      toast({ variant: "destructive", title: "Не удалось запустить отправку", description: (e as Error).message });
    },
  });

  const onSend = () => {
    // Словарь загружен → шлём только известные коды (устаревшие отбрасываем);
    // пока словарь пуст (Broma16 не подключён) — шлём как есть.
    const known = new Set(outletOptions.map((o) => o.value));
    const outletsToSend = outletOptions.length > 0 ? draft.filter((c) => known.has(c)) : draft;
    sendMutation.mutate(outletsToSend);
  };

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

  // ── Компактный индикатор статуса для блока действий (виден обоим ролям, когда
  // есть что показать). Детали — в модалке (у админа).
  let statusChip: React.ReactNode = null;
  if (statusQuery.isLoading) {
    statusChip = null;
  } else if (inFlight) {
    statusChip = (
      <Badge variant="outline" className="text-[10px] gap-1 text-indigo-300 bg-indigo-500/10 border-indigo-500/20">
        <Loader2 className="h-3 w-3 animate-spin" /> {stepLabel(job!.step)}
      </Badge>
    );
  } else if (hasError) {
    statusChip = (
      <Badge variant="outline" className="text-[10px] gap-1 text-rose-400 bg-rose-500/10 border-rose-500/20">
        <AlertTriangle className="h-3 w-3" /> Ошибка отправки
      </Badge>
    );
  } else if (release?.broma16ModerationStatus) {
    // Badge рендерит <div>, поэтому обёртка тоже <div> (div-в-span невалиден).
    statusChip = (
      <div className="inline-flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Дистрибуция:</span>
        <ModerationBadge status={release.broma16ModerationStatus} />
      </div>
    );
  } else if (release?.broma16ReleaseId) {
    statusChip = (
      <Badge variant="outline" className="text-[10px] gap-1 text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3" /> Отправлено
      </Badge>
    );
  }

  return (
    <>
      {isAdmin && (
        <Button
          variant="outline"
          className="bg-card border-violet-500/30 text-violet-200 hover:bg-violet-500/10"
          onClick={() => setModalOpen(true)}
          disabled={!canSend || inFlight || statusQuery.isLoading}
          title={!canSend ? "Доступно после одобрения релиза (статус «approved»)" : undefined}
        >
          {inFlight ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : hasError ? (
            <RefreshCw className="mr-2 h-4 w-4" />
          ) : (
            <Radio className="mr-2 h-4 w-4" />
          )}
          {inFlight ? "Отправляется…" : "Дистрибуция"}
        </Button>
      )}

      {statusChip}

      {/* ── Модалка «Дистрибуция» — только админ: статус + выбор площадок + отправка. */}
      {isAdmin && (
        <Dialog open={modalOpen} onOpenChange={(b) => { if (!sendMutation.isPending) setModalOpen(b); }}>
          <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
              <DialogTitle className="text-lg flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" /> Отправка в Broma16
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Площадки уже отмечены — из выбранных при создании релиза. Проверьте набор и при
                необходимости измените, затем нажмите «Отправить» — релиз уйдёт на дистрибуцию.
              </p>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {statusQuery.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : statusQuery.error ? (
                <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2">
                  Не удалось загрузить статус дистрибуции: {(statusQuery.error as Error).message}. Обновите
                  страницу и попробуйте снова — отправка пока недоступна.
                </div>
              ) : (
                <>
                  {/* Текущее состояние релиза в Broma16 */}
                  <div className="grid grid-cols-2 gap-3 text-sm rounded-lg border border-border/40 bg-card/40 p-4">
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
                    {everPushed && (
                      <div className="col-span-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => checkModerationMutation.mutate()}
                          disabled={checkModerationMutation.isPending}
                          title="Запросить у Broma16 текущий статус модерации релиза"
                        >
                          {checkModerationMutation.isPending ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          )}
                          Проверить статус
                        </Button>
                      </div>
                    )}
                  </div>

                  {(release?.broma16LastError || job?.lastError) && (
                    <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2 break-words">
                      <span className="font-medium">Ошибка отправки:</span> {release?.broma16LastError ?? job?.lastError}
                    </div>
                  )}

                  {/* Выбор площадок */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Площадки (витрины)</span>
                      <span className="text-xs text-muted-foreground">
                        Пусто → уйдёт базовый набор витрин
                      </span>
                    </div>
                    <OutletPickerInline value={draft} onChange={setDraft} />
                  </div>
                </>
              )}
            </div>

            <DialogFooter className="px-6 py-4 border-t border-border/40 sm:justify-between">
              <div className="text-xs text-muted-foreground self-center">
                {outletCount > 0 ? `Сохранено витрин: ${outletCount}` : "Площадки ещё не выбирались"}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setModalOpen(false)} disabled={sendMutation.isPending}>
                  Отмена
                </Button>
                <Button
                  onClick={onSend}
                  disabled={sendMutation.isPending || inFlight || statusQuery.isLoading || !!statusQuery.error}
                  className="bg-gradient-to-r from-primary to-violet-500 hover:opacity-95"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Отправить{draft.length ? ` (${draft.length})` : ""}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
