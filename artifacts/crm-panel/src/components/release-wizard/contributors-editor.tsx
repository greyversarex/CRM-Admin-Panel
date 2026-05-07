import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import type { TrackDisplayArtist, TrackWriter, TrackPerformer, TrackProductionMember } from "@workspace/api-client-react";
import {
  WRITER_ROLES, DISPLAY_ARTIST_ROLES, PERFORMER_ROLES, PRODUCTION_ROLES,
} from "./types";

// ─── Display Artists ────────────────────────────────────────────────────────
export function DisplayArtistsEditor({
  value, onChange,
}: { value: TrackDisplayArtist[]; onChange: (v: TrackDisplayArtist[]) => void }) {
  const update = (i: number, patch: Partial<TrackDisplayArtist>) =>
    onChange(value.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  return (
    <Editor
      title="Исполнители (Display Artists)"
      rows={value}
      onAdd={() => onChange([...value, { name: "", role: "primary" }])}
      onRemove={(i) => onChange(value.filter((_, idx) => idx !== i))}
      empty="Минимум 1 — будет показан на DSP под названием трека."
      renderRow={(row, i) => (
        <>
          <Input
            placeholder="Имя исполнителя"
            value={row.name}
            onChange={(e) => update(i, { name: e.target.value })}
            className="bg-background/40 flex-1 min-w-0"
          />
          <Select value={row.role} onValueChange={(v) => update(i, { role: v as TrackDisplayArtist["role"] })}>
            <SelectTrigger className="bg-background/40 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DISPLAY_ARTIST_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      )}
    />
  );
}

// ─── Writers (с долями) ─────────────────────────────────────────────────────
export function WritersEditor({
  value, onChange,
}: { value: TrackWriter[]; onChange: (v: TrackWriter[]) => void }) {
  const update = (i: number, patch: Partial<TrackWriter>) =>
    onChange(value.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  const totalShare = value.reduce((s, w) => s + (Number(w.share) || 0), 0);
  const shareOk = Math.abs(totalShare - 100) < 0.01;
  return (
    <Editor
      title="Авторы (Writers)"
      subtitle={
        <span className={shareOk ? "text-emerald-500" : "text-amber-500 inline-flex items-center gap-1"}>
          {!shareOk && <AlertTriangle className="h-3 w-3" />}
          Сумма долей: {totalShare}% (нужно 100%)
        </span>
      }
      rows={value}
      onAdd={() => {
        // Раздаём поровну при добавлении нового автора.
        const next: TrackWriter[] = [...value, { name: "", role: "songwriter", share: 0, caeIpi: null }];
        const each = Math.round((100 / next.length) * 100) / 100;
        next.forEach((w) => (w.share = each));
        // Округление: добиваем разницу к первому.
        const diff = 100 - next.reduce((s, w) => s + w.share, 0);
        if (next[0]) next[0].share = Math.round((next[0].share + diff) * 100) / 100;
        onChange(next);
      }}
      onRemove={(i) => onChange(value.filter((_, idx) => idx !== i))}
      empty="Минимум 1 автор. Сумма долей всех авторов должна быть 100%."
      renderRow={(row, i) => (
        <>
          <Input
            placeholder="ФИО автора" value={row.name}
            onChange={(e) => update(i, { name: e.target.value })}
            className="bg-background/40 flex-1 min-w-0"
          />
          <Select value={row.role} onValueChange={(v) => update(i, { role: v as TrackWriter["role"] })}>
            <SelectTrigger className="bg-background/40 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WRITER_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            type="number" min={0} max={100} step={0.01}
            placeholder="%" value={row.share}
            onChange={(e) => update(i, { share: Number(e.target.value) })}
            className="bg-background/40 w-[80px]"
          />
          <Input
            placeholder="CAE/IPI" value={row.caeIpi ?? ""}
            onChange={(e) => update(i, { caeIpi: e.target.value || null })}
            className="bg-background/40 w-[120px] font-mono text-xs"
          />
        </>
      )}
    />
  );
}

// ─── Performers ─────────────────────────────────────────────────────────────
export function PerformersEditor({
  value, onChange,
}: { value: TrackPerformer[]; onChange: (v: TrackPerformer[]) => void }) {
  const update = (i: number, patch: Partial<TrackPerformer>) =>
    onChange(value.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  return (
    <Editor
      title="Музыканты (Performers)"
      rows={value}
      onAdd={() => onChange([...value, { name: "", role: "vocals" }])}
      onRemove={(i) => onChange(value.filter((_, idx) => idx !== i))}
      empty="Опционально. Музыканты, инструменты, бэк-вокал."
      renderRow={(row, i) => (
        <>
          <Input
            placeholder="Имя музыканта" value={row.name}
            onChange={(e) => update(i, { name: e.target.value })}
            className="bg-background/40 flex-1 min-w-0"
          />
          <Select value={row.role} onValueChange={(v) => update(i, { role: v })}>
            <SelectTrigger className="bg-background/40 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERFORMER_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      )}
    />
  );
}

// ─── Production team ────────────────────────────────────────────────────────
export function ProductionEditor({
  value, onChange,
}: { value: TrackProductionMember[]; onChange: (v: TrackProductionMember[]) => void }) {
  const update = (i: number, patch: Partial<TrackProductionMember>) =>
    onChange(value.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  return (
    <Editor
      title="Продакшен (Production)"
      rows={value}
      onAdd={() => onChange([...value, { name: "", role: "producer" }])}
      onRemove={(i) => onChange(value.filter((_, idx) => idx !== i))}
      empty="Опционально. Продюсер, звукоинженер, mixing/mastering engineer."
      renderRow={(row, i) => (
        <>
          <Input
            placeholder="Имя" value={row.name}
            onChange={(e) => update(i, { name: e.target.value })}
            className="bg-background/40 flex-1 min-w-0"
          />
          <Select value={row.role} onValueChange={(v) => update(i, { role: v })}>
            <SelectTrigger className="bg-background/40 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRODUCTION_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      )}
    />
  );
}

// ─── Универсальный список с add/remove ──────────────────────────────────────
function Editor<T>({
  title, subtitle, rows, renderRow, onAdd, onRemove, empty,
}: {
  title: string;
  subtitle?: React.ReactNode;
  rows: T[];
  renderRow: (row: T, i: number) => React.ReactNode;
  onAdd: () => void;
  onRemove: (i: number) => void;
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h5 className="text-sm font-medium">{title}</h5>
        {subtitle && <span className="text-[11px]">{subtitle}</span>}
      </div>
      {rows.length === 0 && <p className="text-xs text-muted-foreground italic">{empty}</p>}
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2 bg-background/30 border border-border/40 rounded-md p-1.5">
            {renderRow(row, i)}
            <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(i)} title="Удалить">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        <Plus className="h-4 w-4 mr-1" /> Добавить
      </Button>
    </div>
  );
}
