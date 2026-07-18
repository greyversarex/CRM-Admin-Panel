import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { TrackDisplayArtist, TrackWriter, TrackPerformer, TrackProductionMember } from "@workspace/api-client-react";
import {
  WRITER_ROLES, DISPLAY_ARTIST_ROLES, PERFORMER_ROLES, PRODUCTION_ROLES,
} from "./types";
import { ArtistNameCombobox } from "./artist-name-combobox";
import { useLang } from "@/lib/i18n";

// Writer shares are hidden from the UI (mirrors Symphonic, where Writers only have
// Artist Name + Role). They are split evenly across all writers behind the scenes so
// backend DDEX / PRO validation (writer shares must total 100%) always passes — even
// for legacy data. Use this on every add/remove and before saving.
export function splitWriterSharesEvenly(rows: TrackWriter[]): TrackWriter[] {
  if (rows.length === 0) return rows;
  const each = Math.round((100 / rows.length) * 100) / 100;
  const next = rows.map((w) => ({ ...w, share: each }));
  const diff = 100 - next.reduce((s, w) => s + w.share, 0);
  if (next[0]) next[0].share = Math.round((next[0].share + diff) * 100) / 100;
  return next;
}

// ─── Display Artists ────────────────────────────────────────────────────────
export function DisplayArtistsEditor({
  value, onChange, hideTitle,
}: { value: TrackDisplayArtist[]; onChange: (v: TrackDisplayArtist[]) => void; hideTitle?: boolean }) {
  const { t } = useLang();
  const update = (i: number, patch: Partial<TrackDisplayArtist>) =>
    onChange(value.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  return (
    <Editor
      title={t.releaseWizard.displayArtistsTitle}
      hideTitle={hideTitle}
      rows={value}
      onAdd={() => onChange([...value, { name: "", role: "primary" }])}
      onRemove={(i) => onChange(value.filter((_, idx) => idx !== i))}
      empty={t.releaseWizard.displayArtistsEmpty}
      addLabel={t.releaseWizard.addArtistEntry}
      roleWidth="w-36"
      renderRow={(row, i) => (
        <>
          <ArtistNameCombobox
            value={row.name}
            onChange={(name) => update(i, { name })}
            placeholder={t.releaseWizard.selectOrTypeArtist}
          />
          <Select value={row.role} onValueChange={(v) => update(i, { role: v as TrackDisplayArtist["role"] })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DISPLAY_ARTIST_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{t.releaseWizard.artistRoles[r.value as keyof typeof t.releaseWizard.artistRoles] ?? r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      )}
    />
  );
}

// ─── Writers (with shares) ──────────────────────────────────────────────────
export function WritersEditor({
  value, onChange, hideTitle,
}: { value: TrackWriter[]; onChange: (v: TrackWriter[]) => void; hideTitle?: boolean }) {
  const { t } = useLang();
  const update = (i: number, patch: Partial<TrackWriter>) =>
    onChange(value.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  return (
    <Editor
      title={t.releaseWizard.writersTitle}
      hideTitle={hideTitle}
      rows={value}
      onAdd={() => onChange(splitWriterSharesEvenly([...value, { name: "", role: "songwriter", share: 0, caeIpi: null }]))}
      onRemove={(i) => onChange(splitWriterSharesEvenly(value.filter((_, idx) => idx !== i)))}
      empty={t.releaseWizard.writersEmpty}
      addLabel={t.releaseWizard.addArtistEntry}
      roleWidth="w-36"
      renderRow={(row, i) => (
        <>
          <ArtistNameCombobox
            value={row.name}
            onChange={(name) => update(i, { name })}
            placeholder={t.releaseWizard.selectOrTypeWriter}
          />
          <Select value={row.role} onValueChange={(v) => update(i, { role: v as TrackWriter["role"] })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WRITER_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{t.releaseWizard.writerRoles[r.value as keyof typeof t.releaseWizard.writerRoles] ?? r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      )}
    />
  );
}

// ─── Performers ─────────────────────────────────────────────────────────────
export function PerformersEditor({
  value, onChange, hideTitle,
}: { value: TrackPerformer[]; onChange: (v: TrackPerformer[]) => void; hideTitle?: boolean }) {
  const { t } = useLang();
  const update = (i: number, patch: Partial<TrackPerformer>) =>
    onChange(value.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  return (
    <Editor
      title={t.releaseWizard.performersTitle}
      hideTitle={hideTitle}
      rows={value}
      onAdd={() => onChange([...value, { name: "", role: "vocals" }])}
      onRemove={(i) => onChange(value.filter((_, idx) => idx !== i))}
      empty={t.releaseWizard.performersEmpty}
      addLabel={t.releaseWizard.addArtistEntry}
      roleWidth="w-44"
      renderRow={(row, i) => (
        <>
          <ArtistNameCombobox
            value={row.name}
            onChange={(name) => update(i, { name })}
            placeholder={t.releaseWizard.selectOrTypePerformer}
          />
          <Select value={row.role} onValueChange={(v) => update(i, { role: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERFORMER_ROLES.map((r) => <SelectItem key={r} value={r}>{t.releaseWizard.performerRoles[r as keyof typeof t.releaseWizard.performerRoles] ?? r}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      )}
    />
  );
}

// ─── Production team ────────────────────────────────────────────────────────
export function ProductionEditor({
  value, onChange, hideTitle,
}: { value: TrackProductionMember[]; onChange: (v: TrackProductionMember[]) => void; hideTitle?: boolean }) {
  const { t } = useLang();
  const update = (i: number, patch: Partial<TrackProductionMember>) =>
    onChange(value.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  return (
    <Editor
      title={t.releaseWizard.productionTitle}
      hideTitle={hideTitle}
      rows={value}
      onAdd={() => onChange([...value, { name: "", role: "producer" }])}
      onRemove={(i) => onChange(value.filter((_, idx) => idx !== i))}
      empty={t.releaseWizard.productionEmpty}
      addLabel={t.releaseWizard.addArtistEntry}
      roleWidth="w-48"
      renderRow={(row, i) => (
        <>
          <ArtistNameCombobox
            value={row.name}
            onChange={(name) => update(i, { name })}
            placeholder={t.releaseWizard.selectOrTypeName}
          />
          <Select value={row.role} onValueChange={(v) => update(i, { role: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRODUCTION_ROLES.map((r) => <SelectItem key={r} value={r}>{t.releaseWizard.productionRoles[r as keyof typeof t.releaseWizard.productionRoles] ?? r}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      )}
    />
  );
}

// ─── Generic add/remove list ────────────────────────────────────────────────
// Renders column headers aligned with the actual inputs + compact rows.
function Editor<T>({
  title, subtitle, rows, renderRow, onAdd, onRemove, empty, hideTitle, addLabel, roleWidth,
}: {
  title: string;
  subtitle?: React.ReactNode;
  rows: T[];
  renderRow: (row: T, i: number) => React.ReactNode;
  onAdd: () => void;
  onRemove: (i: number) => void;
  empty: string;
  hideTitle?: boolean;
  addLabel?: string;
  roleWidth?: string; // tailwind width class for the role column header, e.g. "w-36"
}) {
  const { t } = useLang();
  return (
    <div className="space-y-2">
      {(!hideTitle || subtitle) && (
        <div className="flex items-baseline justify-between">
          {hideTitle ? <span /> : <h5 className="text-sm font-medium">{title}</h5>}
          {subtitle && <span className="text-[11px]">{subtitle}</span>}
        </div>
      )}

      {/* Column headers aligned with grid columns below */}
      <div className="grid gap-2 px-0.5" style={{ gridTemplateColumns: "1fr 1fr 36px" }}>
        <span className="text-xs text-muted-foreground/70">{t.releaseWizard.artistName}</span>
        <span className="text-xs text-muted-foreground/70">{t.releaseWizard.role}</span>
        <span />
      </div>

      {rows.length === 0 && <p className="text-sm text-muted-foreground italic">{empty}</p>}

      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="grid gap-2 items-center" style={{ gridTemplateColumns: "1fr 1fr 36px" }}>
            {renderRow(row, i)}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(i)}
              title={t.releaseWizard.remove}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" size="sm" onClick={onAdd} className="mt-1">
        <Plus className="h-4 w-4 mr-1" /> {addLabel ?? t.releaseWizard.addEntry}
      </Button>
    </div>
  );
}
