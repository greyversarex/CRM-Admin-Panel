import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRelease, useListSplits, useListUsers, useCreateSplit, useUpdateSplit,
  getGetReleaseQueryKey, getListSplitsQueryKey,
  type ReleaseDetail, type Track, type Split,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft, Music2, AlertTriangle, Plus, X, AlertCircle, Loader2, Share2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type EntityType = "artist" | "label" | "distributor" | "producer" | "author" | "custom";
type Participant = { entityType: EntityType; entityId: number | null; entityName: string; percentage: number };

function trackArtistNames(t: Track): string {
  const names = (t.displayArtists ?? []).map((d) => d.name).filter(Boolean);
  if (names.length > 0) return names.join(", ");
  return t.artistName || "—";
}

// ─── Assign-to-Split dialog (создаёт сплит для выбранных треков) ──────────────
function AssignSplitDialog({
  open, onClose, release, selectedTrackIds, existingByTrack, onAssigned,
}: {
  open: boolean;
  onClose: () => void;
  release: ReleaseDetail;
  selectedTrackIds: number[];
  existingByTrack: Map<number, Split>;
  onAssigned: () => void;
}) {
  const queryClient = useQueryClient();
  const usersQ = useListUsers({ limit: 200 } as never);
  const users = usersQ.data?.data ?? [];
  const createSplit = useCreateSplit();
  const updateSplit = useUpdateSplit();
  const [busy, setBusy] = useState(false);

  const [participants, setParticipants] = useState<Participant[]>([
    { entityType: "artist", entityId: null, entityName: "", percentage: 100 },
  ]);

  const sum = useMemo(
    () => participants.reduce((acc, p) => acc + (Number.isFinite(p.percentage) ? p.percentage : 0), 0),
    [participants],
  );
  const sumOk = Math.abs(sum - 100) < 0.001;
  const allNamesOk = participants.every((p) => p.entityName.trim().length > 0);

  function addRow() {
    setParticipants((p) => [...p, { entityType: "artist", entityId: null, entityName: "", percentage: 0 }]);
  }
  function removeRow(idx: number) {
    setParticipants((p) => p.filter((_, i) => i !== idx));
  }
  function patchRow(idx: number, patch: Partial<Participant>) {
    setParticipants((p) => p.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function reset() {
    setParticipants([{ entityType: "artist", entityId: null, entityName: "", percentage: 100 }]);
  }

  async function submit() {
    if (selectedTrackIds.length === 0) {
      toast({ variant: "destructive", title: "Выберите хотя бы один трек" });
      return;
    }
    if (!sumOk) {
      toast({ variant: "destructive", title: "Сумма долей должна быть 100%", description: `Сейчас ${sum.toFixed(2)}%` });
      return;
    }
    if (!allNamesOk) {
      toast({ variant: "destructive", title: "У каждого участника должно быть имя" });
      return;
    }
    const payload = participants.map((p) => ({
      entityType: p.entityType,
      entityId: p.entityId ?? null,
      entityName: p.entityName.trim(),
      percentage: p.percentage,
    }));

    setBusy(true);
    try {
      for (const trackId of selectedTrackIds) {
        // Переназначение атомарно: если на треке уже есть сплит — обновляем его
        // (PUT), иначе создаём новый (POST). Так трек не остаётся без сплита при
        // частичной ошибке.
        const existing = existingByTrack.get(trackId);
        if (existing) {
          await updateSplit.mutateAsync({
            id: existing.id,
            data: { releaseId: release.id, trackId, participants: payload } as never,
          });
        } else {
          await createSplit.mutateAsync({
            data: { releaseId: release.id, trackId, participants: payload } as never,
          });
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListSplitsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetReleaseQueryKey(release.id) }),
      ]);
      toast({
        title: "Сплит назначен",
        description: `Назначено трекам: ${selectedTrackIds.length}.`,
      });
      reset();
      onAssigned();
      onClose();
    } catch (e) {
      toast({ variant: "destructive", title: "Не удалось назначить сплит", description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Назначить сплит</DialogTitle>
          <DialogDescription>
            Раскладка дохода между участниками для выбранных треков ({selectedTrackIds.length}).
            Сумма долей должна быть ровно 100%.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Участники</label>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addRow}>
              <Plus className="h-3 w-3 mr-1" /> Добавить
            </Button>
          </div>
          <div className="space-y-2 max-h-[44vh] overflow-y-auto pr-1">
            {participants.map((p, idx) => {
              // Сумма остальных участников — используется для ограничения ввода
              const otherSum = participants.reduce(
                (acc, row, i) => i !== idx ? acc + (Number.isFinite(row.percentage) ? row.percentage : 0) : acc,
                0,
              );
              const maxForRow = Math.max(0, 100 - otherSum);
              return (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3">
                  <Select
                    value={p.entityType}
                    onValueChange={(v) => patchRow(idx, { entityType: v as EntityType, entityId: null })}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="artist">Артист</SelectItem>
                      <SelectItem value="label">Лейбл</SelectItem>
                      <SelectItem value="producer">Продюсер</SelectItem>
                      <SelectItem value="author">Автор</SelectItem>
                      <SelectItem value="distributor">Дистрибьютор</SelectItem>
                      <SelectItem value="custom">Другое</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(p.entityType === "artist" || p.entityType === "label") ? (
                  <div className="col-span-5">
                    <Select
                      value={p.entityId != null ? String(p.entityId) : ""}
                      onValueChange={(v) => {
                        const id = v ? Number(v) : null;
                        const u = users.find((x) => x.id === id);
                        patchRow(idx, { entityId: id, entityName: u?.name ?? p.entityName });
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="— выбрать пользователя —" />
                      </SelectTrigger>
                      <SelectContent>
                        {users
                          .filter((u) => (p.entityType === "artist" ? u.role === "artist" : u.role === "label"))
                          .map((u) => (
                            <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.email})</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <Input
                    className="col-span-5 h-9 text-xs"
                    placeholder="Имя участника"
                    value={p.entityName}
                    onChange={(e) => patchRow(idx, { entityName: e.target.value })}
                  />
                )}

                <Input
                  type="number"
                  min={0}
                  max={maxForRow}
                  step={0.01}
                  className={`col-span-3 h-9 text-xs text-right ${p.percentage > maxForRow + 0.001 ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
                  value={p.percentage}
                  onChange={(e) => {
                    const val = Math.min(maxForRow, Math.max(0, Number(e.target.value)));
                    patchRow(idx, { percentage: val });
                  }}
                />
                <Button
                  variant="ghost" size="icon" className="col-span-1 h-7 w-7 text-rose-400"
                  aria-label="Удалить участника"
                  onClick={() => removeRow(idx)}
                  disabled={participants.length <= 1}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
            })}
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground">Сумма долей</span>
            <Badge
              variant="outline"
              className={sumOk
                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                : "text-rose-400 bg-rose-500/10 border-rose-500/20"}
            >
              {sumOk ? "✓ 100%" : `${sum.toFixed(2)}% (нужно 100%)`}
            </Badge>
          </div>
          {!sumOk && (
            <p className="text-[11px] text-rose-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Сплит можно сохранить только при сумме = 100%.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { if (!busy) { reset(); onClose(); } }} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={busy || !sumOk || !allNamesOk}>
            {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Назначаем…</> : "Назначить сплит"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── SplitShare Setup editor ─────────────────────────────────────────────────
function SplitShareEditor({ release }: { release: ReleaseDetail }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  // Назначать сплиты могут admin/manager (любой релиз) либо владелец релиза:
  // лейбл — для своих релизов, артист — для своих. Владелец — ТОЛЬКО пока релиз
  // редактируем (draft/rejected): на модерации и после одобрения набор сплитов
  // заблокирован (совпадает с бэкендовой проверкой releaseSplitLockReason и со
  // скрытой кнопкой Edit на странице релиза). Admin/manager не ограничены статусом.
  const isModerator = user?.role === "admin" || user?.role === "manager";
  const isOwner =
    (user?.role === "label" && user?.labelId != null && release.labelId === user.labelId) ||
    (user?.role === "artist" && user?.artistId != null && release.artistId === user.artistId);
  const canAssign = isModerator || (isOwner && !!release.isEditable);

  const { data: splits } = useListSplits({ release_id: release.id, limit: 200 });
  const byTrack = useMemo(() => {
    const m = new Map<number, Split>();
    for (const s of splits?.data ?? []) {
      if (s.trackId) m.set(s.trackId, s);
    }
    return m;
  }, [splits]);

  const tracks = release.tracks ?? [];
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);

  const unassignedCount = tracks.filter((t) => !byTrack.has(t.id)).length;
  const allSelected = tracks.length > 0 && selected.size === tracks.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(tracks.map((t) => t.id)));
  }
  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Back */}
      <button
        onClick={() => setLocation(`/releases/${release.id}`)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent/40"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Назад к релизу
      </button>

      {/* Heading */}
      <div className="flex items-center gap-2.5">
        <Share2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">SplitShare Setup</h1>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-4">
        <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm leading-relaxed">
          {unassignedCount === 0 ? (
            <>Все треки ({tracks.length}) назначены на сплит.</>
          ) : (
            <>
              <span className="font-semibold">
                {unassignedCount} из {tracks.length} {tracks.length === 1 ? "трека" : "треков"} не назначены на сплит.
              </span>{" "}
              Треки без сплита будут добавлены в сплит при одобрении релиза. Вы можете назначить трекам
              сплит вручную ниже. Рекомендуем сделать это в течение 45 дней после выхода релиза.
            </>
          )}
        </p>
      </div>

      {tracks.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
          В релизе пока нет треков. Сначала добавьте треки — сплиты настраиваются для каждого трека.
        </div>
      ) : (
        <>
          {/* Select All + Assign bar */}
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/50 px-4 py-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Выбрать все" />
              <span className="text-sm font-medium">Выбрать все</span>
            </label>
            <Button
              size="sm"
              disabled={selected.size === 0 || !canAssign}
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Назначить сплит
              {selected.size > 0 && <span className="ml-1.5 opacity-80">({selected.size})</span>}
            </Button>
          </div>

          {!canAssign && (
            <p className="text-[11px] text-muted-foreground -mt-2">
              {isOwner && !release.isEditable
                ? "Релиз отправлен на модерацию — набор сплитов заблокирован. Отзовите заявку (Cancel Submission) на странице релиза, чтобы снова редактировать сплиты."
                : "Назначать сплиты могут администратор, менеджер или владелец релиза. Вы можете просматривать статус назначения."}
            </p>
          )}

          {/* Track rows */}
          <div className="space-y-2">
            {tracks.map((t) => {
              const split = byTrack.get(t.id);
              const assigned = !!split;
              const assignedTo = split
                ? (split.participants ?? []).map((p) => p.entityName).filter(Boolean).join(", ") || "—"
                : "—";
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-md border border-border/60 bg-card/40 px-4 py-3"
                >
                  <Checkbox
                    checked={selected.has(t.id)}
                    onCheckedChange={() => toggleOne(t.id)}
                    aria-label={`Выбрать ${t.title}`}
                  />
                  <span className="h-9 w-9 rounded-md bg-muted/30 border border-border/50 flex items-center justify-center shrink-0">
                    <Music2 className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{t.title}</div>
                  </div>
                  <div className="hidden md:block w-48 min-w-0">
                    <div className="text-[11px] text-muted-foreground">Артисты трека</div>
                    <div className="text-sm truncate">{trackArtistNames(t)}</div>
                  </div>
                  <div className="hidden sm:block w-48 min-w-0">
                    <div className="text-[11px] text-muted-foreground">Назначено</div>
                    <div className="text-sm truncate">{assignedTo}</div>
                  </div>
                  <Badge
                    variant="outline"
                    className={assigned
                      ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30"
                      : "text-amber-300 bg-amber-500/15 border-amber-500/30"}
                  >
                    {assigned ? "Назначен" : "Не назначен"}
                  </Badge>
                </div>
              );
            })}
          </div>

          {/* Finish */}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setLocation(`/releases/${release.id}`)}>
              Завершить назначение сплитов
            </Button>
          </div>
        </>
      )}

      {canAssign && (
        <AssignSplitDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          release={release}
          selectedTrackIds={Array.from(selected)}
          existingByTrack={byTrack}
          onAssigned={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}

export default function ReleaseSplitShare() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  const { data: release, isLoading, error } = useGetRelease(id, {
    query: { enabled: Number.isFinite(id) && id > 0, retry: false } as never,
  });

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto p-6 text-sm text-muted-foreground">
          Неверный идентификатор релиза.
        </div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Layout>
    );
  }

  if (error || !release) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <h2 className="text-xl font-semibold">Релиз не найден</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Не удалось загрузить релиз №{params.id}. Возможно, он был удалён или у вас нет к нему доступа.
          </p>
          <Button variant="outline" className="mt-2" onClick={() => setLocation("/releases")}>
            <ChevronLeft className="h-4 w-4 mr-1" /> К списку релизов
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SplitShareEditor release={release} />
    </Layout>
  );
}
