import { useListArtists, type ReleaseArtistRef, type ReleaseArtistRefRole } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, GripVertical } from "lucide-react";
import { ARTIST_ROLES } from "./types";

/**
 * Multi-primary artist editor для уровня релиза. Используется на шаге 1.
 * Минимум 1 primary — валидация на бэкенде, здесь только UI guard.
 */
export function MultiArtistPicker({
  value, onChange, labelId,
}: {
  value: ReleaseArtistRef[];
  onChange: (next: ReleaseArtistRef[]) => void;
  /** Если задан (label-роль) — фильтруем артистов по labelId. */
  labelId?: number | null;
}) {
  const { data: artistsData } = useListArtists({ limit: 200 });
  const allArtists = artistsData?.data ?? [];
  const visible = labelId != null ? allArtists.filter((a: any) => a.labelId === labelId) : allArtists;
  const byId = new Map(allArtists.map((a: any) => [a.id, a]));

  const addRow = () => {
    const taken = new Set(value.map((v) => v.artistId));
    const free = visible.find((a: any) => !taken.has(a.id));
    if (!free) return;
    onChange([...value, {
      artistId: free.id, name: free.name,
      role: value.length === 0 ? "primary" : "featuring",
      position: value.length,
    }]);
  };

  const updateRow = (idx: number, patch: Partial<ReleaseArtistRef>) => {
    const next = value.map((v, i) => i === idx ? { ...v, ...patch } : v);
    onChange(next);
  };

  const removeRow = (idx: number) => {
    if (value.length <= 1) return; // минимум один артист
    onChange(value.filter((_, i) => i !== idx).map((v, i) => ({ ...v, position: i })));
  };

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <div className="text-xs text-muted-foreground italic">Артисты пока не добавлены.</div>
      )}
      {value.map((row, idx) => (
        <div key={`${row.artistId}-${idx}`} className="flex items-center gap-2 bg-background/40 border border-border/50 rounded-md p-2">
          <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
          <Select
            value={String(row.artistId)}
            onValueChange={(v) => {
              const next = byId.get(Number(v));
              if (next) updateRow(idx, { artistId: next.id, name: next.name });
            }}
          >
            <SelectTrigger className="bg-background/40 flex-1 min-w-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {visible.map((a: any) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={row.role}
            onValueChange={(v) => updateRow(idx, { role: v as ReleaseArtistRefRole })}
          >
            <SelectTrigger className="bg-background/40 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ARTIST_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button" variant="ghost" size="icon"
            disabled={value.length <= 1}
            onClick={() => removeRow(idx)}
            title="Удалить"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button" variant="outline" size="sm"
        onClick={addRow}
        disabled={visible.length === 0 || value.length >= visible.length}
      >
        <Plus className="h-4 w-4 mr-1" /> Добавить артиста
      </Button>
    </div>
  );
}
