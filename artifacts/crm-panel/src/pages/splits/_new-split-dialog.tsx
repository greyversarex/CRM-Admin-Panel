import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  useListReleases, useListTracks, useListUsers, useCreateSplit,
  getListSplitsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type EntityType = "artist" | "label" | "distributor" | "producer" | "author" | "custom";

type Participant = {
  entityType: EntityType;
  entityId: number | null;
  entityName: string;
  percentage: number;
};

type Props = { open: boolean; onClose: () => void };

export function NewSplitDialog({ open, onClose }: Props) {
  const queryClient = useQueryClient();

  const [target, setTarget] = useState<"release" | "track">("release");
  const [releaseId, setReleaseId] = useState<number | null>(null);
  const [trackId, setTrackId] = useState<number | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([
    { entityType: "artist", entityId: null, entityName: "", percentage: 100 },
  ]);

  const releasesQ = useListReleases({ limit: 200 } as any);
  const tracksQ = useListTracks(
    { release_id: releaseId ?? undefined, limit: 200 } as any,
    { query: { enabled: target === "track" && releaseId !== null } as any },
  );
  const usersQ = useListUsers({ limit: 200 } as any);

  const releases = releasesQ.data?.data ?? [];
  const tracks = tracksQ.data?.data ?? [];
  const users = usersQ.data?.data ?? [];

  const createSplit = useCreateSplit({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListSplitsQueryKey() });
        toast({ title: "Сплит создан" });
        reset();
        onClose();
      },
      onError: (e: any) => {
        toast({ variant: "destructive", title: "Не удалось создать сплит", description: e?.message ?? "Ошибка" });
      },
    },
  });

  function reset() {
    setTarget("release");
    setReleaseId(null);
    setTrackId(null);
    setParticipants([{ entityType: "artist", entityId: null, entityName: "", percentage: 100 }]);
  }

  function addRow() {
    setParticipants([...participants, { entityType: "artist", entityId: null, entityName: "", percentage: 0 }]);
  }
  function removeRow(idx: number) {
    setParticipants(participants.filter((_, i) => i !== idx));
  }
  function patchRow(idx: number, patch: Partial<Participant>) {
    setParticipants(participants.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  const sum = useMemo(
    () => participants.reduce((acc, p) => acc + (Number.isFinite(p.percentage) ? p.percentage : 0), 0),
    [participants],
  );
  const sumOk = Math.abs(sum - 100) < 0.001;

  const allNamesOk = participants.every(p => p.entityName.trim().length > 0);
  const targetOk = target === "release" ? releaseId !== null : trackId !== null;

  function submit() {
    if (!targetOk) {
      toast({ variant: "destructive", title: "Выберите релиз или трек" });
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

    const body = {
      releaseId: target === "release" ? releaseId : null,
      trackId: target === "track" ? trackId : null,
      participants: participants.map(p => ({
        entityType: p.entityType,
        entityId: p.entityId ?? null,
        entityName: p.entityName.trim(),
        percentage: p.percentage,
      })),
    } as any;

    createSplit.mutate({ data: body });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && (reset(), onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Новый сплит</DialogTitle>
          <DialogDescription>
            Раскладка дохода между участниками. Сумма долей должна быть ровно 100%.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Target */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Привязка</label>
            <div className="flex gap-2">
              <Button
                variant={target === "release" ? "default" : "outline"}
                size="sm"
                onClick={() => { setTarget("release"); setTrackId(null); }}
              >На релиз целиком</Button>
              <Button
                variant={target === "track" ? "default" : "outline"}
                size="sm"
                onClick={() => setTarget("track")}
              >На отдельный трек</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Релиз</label>
              <select
                aria-label="Release"
                className="w-full h-9 px-3 text-sm rounded-md bg-background border border-border"
                value={releaseId ?? ""}
                onChange={(e) => { setReleaseId(e.target.value ? Number(e.target.value) : null); setTrackId(null); }}
              >
                <option value="">— выбрать —</option>
                {releases.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.title} {r.upc ? `(${r.upc})` : ""}</option>
                ))}
              </select>
            </div>
            {target === "track" && (
              <div>
                <label className="text-xs text-muted-foreground">Трек</label>
                <select
                  aria-label="Track"
                  className="w-full h-9 px-3 text-sm rounded-md bg-background border border-border"
                  value={trackId ?? ""}
                  onChange={(e) => setTrackId(e.target.value ? Number(e.target.value) : null)}
                  disabled={!releaseId}
                >
                  <option value="">— выбрать трек —</option>
                  {tracks.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.title} {t.isrc ? `(${t.isrc})` : ""}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Участники</label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addRow}>
                <Plus className="h-3 w-3 mr-1" /> Добавить
              </Button>
            </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {participants.map((p, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center" data-testid={`row-participant-${idx}`}>
                  <select
                    aria-label="Entity type"
                    className="col-span-3 h-9 px-2 text-xs rounded-md bg-background border border-border"
                    value={p.entityType}
                    onChange={(e) => patchRow(idx, { entityType: e.target.value as EntityType, entityId: null })}
                  >
                    <option value="artist">Artist</option>
                    <option value="label">Label</option>
                    <option value="producer">Producer</option>
                    <option value="author">Author</option>
                    <option value="distributor">Distributor</option>
                    <option value="custom">Custom</option>
                  </select>

                  {(p.entityType === "artist" || p.entityType === "label") ? (
                    <select
                      aria-label="Entity"
                      className="col-span-5 h-9 px-2 text-xs rounded-md bg-background border border-border"
                      value={p.entityId ?? ""}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        const u = users.find((x: any) => x.id === id);
                        patchRow(idx, { entityId: id, entityName: u?.name ?? p.entityName });
                      }}
                    >
                      <option value="">— выбрать пользователя —</option>
                      {users
                        .filter((u: any) => p.entityType === "artist" ? u.role === "artist" : u.role === "label")
                        .map((u: any) => (
                          <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                      ))}
                    </select>
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
                    min={0} max={100} step={0.01}
                    className="col-span-3 h-9 text-xs text-right"
                    value={p.percentage}
                    onChange={(e) => patchRow(idx, { percentage: Number(e.target.value) })}
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
              ))}
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Отмена</Button>
          <Button
            onClick={submit}
            disabled={createSplit.isPending || !sumOk || !targetOk || !allNamesOk}
            data-testid="button-submit-split"
          >
            {createSplit.isPending ? "Создаём…" : "Создать сплит"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
