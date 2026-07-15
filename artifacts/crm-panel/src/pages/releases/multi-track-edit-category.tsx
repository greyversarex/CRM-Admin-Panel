// Multi Track Edit — sub-page для конкретной категории.
// Маршрут: /releases/:id/multi-track-edit/:category
// Две панели: «New Value» (новое значение) + «Current Value(s)» (уже есть на треках).
import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRelease, useUpdateTrack, getGetReleaseQueryKey,
  type Track,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, Trash2,
} from "lucide-react";
import {
  SUBGENRES, subgenreOptionsFor, genreOptionsWith, COUNTRIES, DISPLAY_ARTIST_ROLES,
  WRITER_ROLES, PERFORMER_ROLES, PRODUCTION_ROLES,
} from "@/components/release-wizard/types";
import { useCatalogOptions } from "@/components/release-wizard/use-catalog";
import { DictionaryCombobox } from "@/components/release-wizard/dictionary-combobox";

// ─── Category metadata ────────────────────────────────────────────────────────

type CategoryKey =
  | "artists" | "contributors" | "explicit" | "country"
  | "year" | "vocals" | "genre" | "clipstart" | "ai";

const CATEGORY_META: Record<CategoryKey, { title: string; description: string }> = {
  artists:      { title: "Artists",                    description: "Top level artist roles: Primary, Featuring, Remixer." },
  contributors: { title: "Contributors",               description: "Supporting production roles: Composer, Producer, Songwriter, etc." },
  explicit:     { title: "Explicit Status",            description: "The explicit level of a track: Not Explicit, Explicit, Censored." },
  country:      { title: "Country Of Recording",       description: "The country the song was recorded in." },
  year:         { title: "Recording Year",             description: "The year the song was recorded." },
  vocals:       { title: "Vocals",                     description: "The presence of voice in the song: singing, spoken word, call-outs." },
  genre:        { title: "Genre",                      description: "The style of music the songs belong to." },
  clipstart:    { title: "Clip Start Time",            description: "Start time of the audio clip. Utilized by partners like TikTok." },
  ai:           { title: "Stereo Audio AI Disclosure", description: "The AI usage level of the stereo audio for a track: None, Some, All." },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function applyToAll(
  tracks: Track[],
  updateFn: ReturnType<typeof useUpdateTrack>["mutateAsync"],
  patchFn: (t: Track) => Record<string, unknown>,
): Promise<{ ok: number; fail: number; firstErr: string }> {
  let ok = 0; let fail = 0; let firstErr = "";
  for (const t of tracks) {
    const patch = patchFn(t);
    // Skip if nothing to change (e.g. artist already present on track)
    if (Object.keys(patch).length === 0) { ok++; continue; }
    try {
      // Always include fields that have Zod defaults to prevent them clobbering
      // existing data when only one field is being changed (partial-update safety).
      await updateFn({
        id: t.id,
        data: {
          artistId: t.artistId,
          title: t.title,
          isExplicit:     (t as any).isExplicit      ?? false,
          explicitStatus: (t as any).explicitStatus  ?? "non_explicit",
          aiUsage:        (t as any).aiUsage         ?? "none",
          clipStartSeconds: (t as any).clipStartSeconds ?? 0,
          audioStyle:     (t as any).audioStyle      ?? "vocal",
          ...patch,
        } as any,
      });
      ok++;
    } catch (e) { fail++; if (!firstErr) firstErr = (e as Error).message; }
  }
  return { ok, fail, firstErr };
}

function showResult(ok: number, fail: number, firstErr: string) {
  if (fail === 0) {
    toast({ title: "Applied", description: `Changes applied to ${ok} track${ok !== 1 ? "s" : ""}.` });
  } else {
    toast({ variant: "destructive", title: `Failed on ${fail} of ${ok + fail}`, description: firstErr });
  }
}

// Format seconds as MM:SS
function fmtSec(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function parseSec(str: string): number {
  const parts = str.split(":").map((x) => parseInt(x, 10) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// ─── Current Values extraction ────────────────────────────────────────────────

interface ValueGroup {
  key: string;
  label: string;
  sublabel?: string;
  rawValue: unknown;
  trackEntries: Array<{ id: number; title: string }>;
}

function extractGroups(tracks: Track[], category: CategoryKey): ValueGroup[] {
  if (category === "artists") {
    const map = new Map<string, ValueGroup>();
    for (const t of tracks) {
      const list = Array.isArray((t as any).displayArtists) ? (t as any).displayArtists : [];
      for (const a of list) {
        const key = `${a.name}__${a.role}`;
        if (!map.has(key)) {
          const roleLabel = DISPLAY_ARTIST_ROLES.find((r) => r.value === a.role)?.label ?? a.role;
          map.set(key, { key, label: a.name, sublabel: roleLabel, rawValue: a, trackEntries: [] });
        }
        map.get(key)!.trackEntries.push({ id: t.id, title: t.title });
      }
    }
    return Array.from(map.values());
  }
  if (category === "contributors") {
    const map = new Map<string, ValueGroup>();
    const addEntries = (entries: any[], prefix: string, t: Track) => {
      for (const e of entries) {
        const key = `${prefix}__${e.name}__${e.role}`;
        if (!map.has(key)) {
          const roleLabel = e.role.replace(/_/g, " ");
          map.set(key, { key, label: e.name, sublabel: `${prefix === "w" ? "Writer" : prefix === "p" ? "Performer" : "Production"} · ${roleLabel}`, rawValue: { type: prefix, ...e }, trackEntries: [] });
        }
        map.get(key)!.trackEntries.push({ id: t.id, title: t.title });
      }
    };
    for (const t of tracks) {
      addEntries(Array.isArray((t as any).writers) ? (t as any).writers : [], "w", t);
      addEntries(Array.isArray((t as any).performers) ? (t as any).performers : [], "p", t);
      addEntries(Array.isArray((t as any).production) ? (t as any).production : [], "prod", t);
    }
    return Array.from(map.values());
  }
  if (category === "explicit") {
    const map = new Map<string, ValueGroup>();
    const LABELS: Record<string, string> = { non_explicit: "Not Explicit", explicit: "Explicit", censored: "Censored" };
    for (const t of tracks) {
      const val = (t as any).explicitStatus || "non_explicit";
      if (!map.has(val)) map.set(val, { key: val, label: LABELS[val] ?? val, rawValue: val, trackEntries: [] });
      map.get(val)!.trackEntries.push({ id: t.id, title: t.title });
    }
    return Array.from(map.values());
  }
  if (category === "country") {
    const map = new Map<string, ValueGroup>();
    for (const t of tracks) {
      const val = (t as any).countryOfRecording as string | undefined;
      if (!val) continue;
      const name = COUNTRIES.find((c) => c.code === val)?.name ?? val;
      if (!map.has(val)) map.set(val, { key: val, label: name, rawValue: val, trackEntries: [] });
      map.get(val)!.trackEntries.push({ id: t.id, title: t.title });
    }
    return Array.from(map.values());
  }
  if (category === "year") {
    const map = new Map<string, ValueGroup>();
    for (const t of tracks) {
      const val = (t as any).recordingYear as number | undefined;
      if (!val) continue;
      const k = String(val);
      if (!map.has(k)) map.set(k, { key: k, label: k, rawValue: val, trackEntries: [] });
      map.get(k)!.trackEntries.push({ id: t.id, title: t.title });
    }
    return Array.from(map.values());
  }
  if (category === "vocals") {
    const map = new Map<string, ValueGroup>();
    const LABELS: Record<string, string> = { vocal: "Vocals", instrumental: "No Vocals" };
    for (const t of tracks) {
      const val = (t as any).audioStyle || "vocal";
      if (!map.has(val)) map.set(val, { key: val, label: LABELS[val] ?? val, rawValue: val, trackEntries: [] });
      map.get(val)!.trackEntries.push({ id: t.id, title: t.title });
    }
    return Array.from(map.values());
  }
  if (category === "genre") {
    const map = new Map<string, ValueGroup>();
    for (const t of tracks) {
      const val = (t as any).genre as string | undefined;
      if (!val) continue;
      const sub = (t as any).subgenre as string | undefined;
      const k = `${val}__${sub ?? ""}`;
      if (!map.has(k)) map.set(k, { key: k, label: val, sublabel: sub, rawValue: { genre: val, subgenre: sub }, trackEntries: [] });
      map.get(k)!.trackEntries.push({ id: t.id, title: t.title });
    }
    return Array.from(map.values());
  }
  if (category === "clipstart") {
    const map = new Map<string, ValueGroup>();
    for (const t of tracks) {
      const val = (t as any).clipStartSeconds ?? 0;
      const k = String(val);
      if (!map.has(k)) map.set(k, { key: k, label: fmtSec(val), rawValue: val, trackEntries: [] });
      map.get(k)!.trackEntries.push({ id: t.id, title: t.title });
    }
    return Array.from(map.values());
  }
  if (category === "ai") {
    const map = new Map<string, ValueGroup>();
    const LABELS: Record<string, string> = { none: "None", some: "Some", all: "All" };
    for (const t of tracks) {
      const val = (t as any).aiUsage || "none";
      if (!map.has(val)) map.set(val, { key: val, label: LABELS[val] ?? val, rawValue: val, trackEntries: [] });
      map.get(val)!.trackEntries.push({ id: t.id, title: t.title });
    }
    return Array.from(map.values());
  }
  return [];
}

// ─── TrackAccordion ───────────────────────────────────────────────────────────

function TrackAccordion({ entries, total }: { entries: Array<{ id: number; title: string }>; total: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border/30 mt-2 pt-2">
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full"
        onClick={() => setOpen((v) => !v)}
      >
        {entries.length} / {total} Track{total !== 1 ? "s" : ""}
        {open ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-0.5">
          {entries.map((e) => (
            <li key={e.id} className="text-xs text-muted-foreground pl-1 truncate">{e.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── New Value panel forms ────────────────────────────────────────────────────

interface NewValueProps {
  tracks: Track[];
  updateFn: ReturnType<typeof useUpdateTrack>["mutateAsync"];
  onApplied: () => void;
}

// ARTISTS
function NewValueArtists({ tracks, updateFn, onApplied }: NewValueProps) {
  const [entries, setEntries] = useState([{ name: "", role: "featuring" as string }]);
  const [busy, setBusy] = useState(false);

  const addRow = () => setEntries((p) => [...p, { name: "", role: "featuring" }]);
  const removeRow = (i: number) => setEntries((p) => p.filter((_, idx) => idx !== i));
  const setField = (i: number, field: string, v: string) =>
    setEntries((p) => p.map((e, idx) => idx === i ? { ...e, [field]: v } : e));

  const valid = entries.some((e) => e.name.trim() && e.role);

  const apply = async () => {
    if (!valid) return;
    setBusy(true);
    const newEntries = entries.filter((e) => e.name.trim() && e.role)
      .map((e) => ({ name: e.name.trim(), role: e.role }));
    const r = await applyToAll(tracks, updateFn, (t) => {
      const current = Array.isArray((t as any).displayArtists) ? (t as any).displayArtists : [];
      const merged = [...current];
      for (const ne of newEntries) {
        if (!merged.some((c) => c.name === ne.name && c.role === ne.role)) merged.push(ne);
      }
      return { displayArtists: merged };
    });
    setBusy(false);
    showResult(r.ok, r.fail, r.firstErr);
    if (r.fail === 0) onApplied();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {entries.map((e, i) => (
          <div key={i} className="border border-border/40 rounded-lg p-3 space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Artist Name</Label>
                <Input value={e.name} onChange={(ev) => setField(i, "name", ev.target.value)} placeholder="Enter name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Role</Label>
                <Select value={e.role} onValueChange={(v) => setField(i, "role", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DISPLAY_ARTIST_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {entries.length > 1 && (
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Add Artist
      </Button>
      <div className="pt-2">
        <Button className="w-full" disabled={!valid || busy} onClick={apply}>
          {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Add to all Tracks
        </Button>
      </div>
    </div>
  );
}

// CONTRIBUTORS
type ContribTab = "writers" | "performers" | "production";
function NewValueContributors({ tracks, updateFn, onApplied }: NewValueProps) {
  const [tab, setTab] = useState<ContribTab>("writers");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [share, setShare] = useState("100");
  const [busy, setBusy] = useState(false);

  const roleOptions = tab === "writers"
    ? WRITER_ROLES.map((r) => ({ value: r.value, label: r.label }))
    : tab === "performers"
      ? PERFORMER_ROLES.map((r) => ({ value: r, label: r.replace(/_/g, " ") }))
      : PRODUCTION_ROLES.map((r) => ({ value: r, label: r.replace(/_/g, " ") }));

  const valid = name.trim() && role;

  const apply = async () => {
    if (!valid) return;
    setBusy(true);
    const entry = tab === "writers"
      ? { name: name.trim(), role, share: Number(share) || 0 }
      : { name: name.trim(), role };
    const r = await applyToAll(tracks, updateFn, (t) => {
      if (tab === "writers") {
        const cur = Array.isArray((t as any).writers) ? (t as any).writers : [];
        return { writers: [...cur, entry] };
      } else if (tab === "performers") {
        const cur = Array.isArray((t as any).performers) ? (t as any).performers : [];
        return { performers: [...cur, entry] };
      } else {
        const cur = Array.isArray((t as any).production) ? (t as any).production : [];
        return { production: [...cur, entry] };
      }
    });
    setBusy(false);
    showResult(r.ok, r.fail, r.firstErr);
    if (r.fail === 0) onApplied();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border/40 pb-3">
        {(["writers", "performers", "production"] as ContribTab[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); setRole(""); }}
            className={`text-xs px-3 py-1.5 rounded-md capitalize transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/40"}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        <div className="border border-border/40 rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Contributor Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue placeholder="Select Role" /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {tab === "writers" && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Share %</Label>
              <Input type="number" min={0} max={100} value={share} onChange={(e) => setShare(e.target.value)} />
            </div>
          )}
        </div>
      </div>
      <Button className="w-full" disabled={!valid || busy} onClick={apply}>
        {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Add to All Tracks
      </Button>
    </div>
  );
}

// EXPLICIT STATUS
function NewValueExplicit({ tracks, updateFn, onApplied }: NewValueProps) {
  const [value, setValue] = useState<"non_explicit" | "explicit" | "censored">("non_explicit");
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    const r = await applyToAll(tracks, updateFn, () => ({ explicitStatus: value, isExplicit: value === "explicit" }));
    setBusy(false); showResult(r.ok, r.fail, r.firstErr);
    if (r.fail === 0) onApplied();
  };
  return (
    <div className="space-y-4">
      <RadioGroup value={value} onValueChange={(v) => setValue(v as any)} className="space-y-2.5">
        {([["non_explicit", "Non-Explicit"], ["explicit", "Explicit"], ["censored", "Censored"]] as const).map(([v, label]) => (
          <div key={v} className="flex items-center gap-2.5">
            <RadioGroupItem value={v} id={`explicit-${v}`} />
            <Label htmlFor={`explicit-${v}`} className="font-normal cursor-pointer">{label}</Label>
          </div>
        ))}
      </RadioGroup>
      <Button className="w-full" disabled={busy} onClick={apply}>
        {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Add to All Tracks
      </Button>
    </div>
  );
}

// COUNTRY
function NewValueCountry({ tracks, updateFn, onApplied }: NewValueProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const countryOpts = useCatalogOptions("country", { valueKey: "code", fallback: COUNTRIES.map((c) => ({ value: c.code, label: c.name })) });
  const apply = async () => {
    if (!value) return; setBusy(true);
    const r = await applyToAll(tracks, updateFn, () => ({ countryOfRecording: value }));
    setBusy(false); showResult(r.ok, r.fail, r.firstErr);
    if (r.fail === 0) onApplied();
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Country</Label>
        <DictionaryCombobox value={value} onChange={setValue} options={countryOpts.options} placeholder="Select a Country" />
      </div>
      <Button className="w-full" disabled={!value || busy} onClick={apply}>
        {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Add to All Tracks
      </Button>
    </div>
  );
}

// RECORDING YEAR
function NewValueYear({ tracks, updateFn, onApplied }: NewValueProps) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 80 }, (_, i) => currentYear - i);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    if (!value) return; setBusy(true);
    const r = await applyToAll(tracks, updateFn, () => ({ recordingYear: Number(value) }));
    setBusy(false); showResult(r.ok, r.fail, r.firstErr);
    if (r.fail === 0) onApplied();
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Year</Label>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger><SelectValue placeholder="Select a Year" /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Button className="w-full" disabled={!value || busy} onClick={apply}>
        {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Add to All Tracks
      </Button>
    </div>
  );
}

// VOCALS
function NewValueVocals({ tracks, updateFn, onApplied }: NewValueProps) {
  const [value, setValue] = useState<"instrumental" | "vocal">("vocal");
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    const r = await applyToAll(tracks, updateFn, () => ({ audioStyle: value }));
    setBusy(false); showResult(r.ok, r.fail, r.firstErr);
    if (r.fail === 0) onApplied();
  };
  return (
    <div className="space-y-4">
      <RadioGroup value={value} onValueChange={(v) => setValue(v as any)} className="space-y-2.5">
        {([["instrumental", "No Vocals"], ["vocal", "Vocals"]] as const).map(([v, label]) => (
          <div key={v} className="flex items-center gap-2.5">
            <RadioGroupItem value={v} id={`vocals-${v}`} />
            <Label htmlFor={`vocals-${v}`} className="font-normal cursor-pointer">{label}</Label>
          </div>
        ))}
      </RadioGroup>
      <Button className="w-full" disabled={busy} onClick={apply}>
        {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Add to All Tracks
      </Button>
    </div>
  );
}

// GENRE
function NewValueGenre({ tracks, updateFn, onApplied }: NewValueProps) {
  const [genre, setGenre] = useState("");
  const [subgenre, setSubgenre] = useState("");
  const [busy, setBusy] = useState(false);
  // Поджанры зависят от выбранного жанра (иерархия из документа).
  const subgenreOpts = subgenreOptionsFor(genre, subgenre);
  const apply = async () => {
    if (!genre) return; setBusy(true);
    const r = await applyToAll(tracks, updateFn, () => ({ genre, subgenre: subgenre || null }));
    setBusy(false); showResult(r.ok, r.fail, r.firstErr);
    if (r.fail === 0) onApplied();
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Primary Genre</Label>
        <DictionaryCombobox value={genre} onChange={(v) => { setGenre(v); if (!(SUBGENRES[v] ?? []).includes(subgenre)) setSubgenre(""); }} options={genreOptionsWith(genre)} placeholder="Select a Genre" />
      </div>
      {subgenreOpts.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Secondary Genre</Label>
          <DictionaryCombobox value={subgenre} onChange={setSubgenre} options={subgenreOpts} placeholder="Select a Genre" />
        </div>
      )}
      <Button className="w-full" disabled={!genre || busy} onClick={apply}>
        {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Add to All Tracks
      </Button>
    </div>
  );
}

// CLIP START TIME
function NewValueClipStart({ tracks, updateFn, onApplied }: NewValueProps) {
  const [value, setValue] = useState("00:00:00");
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    const secs = parseSec(value);
    const r = await applyToAll(tracks, updateFn, () => ({ clipStartSeconds: secs }));
    setBusy(false); showResult(r.ok, r.fail, r.firstErr);
    if (r.fail === 0) onApplied();
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Start Time</Label>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="00:00:00" className="font-mono" />
        <p className="text-xs text-muted-foreground">Format: HH:MM:SS or MM:SS</p>
      </div>
      <Button className="w-full" disabled={busy} onClick={apply}>
        {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Add to All Tracks
      </Button>
    </div>
  );
}

// STEREO AUDIO AI DISCLOSURE
function NewValueAi({ tracks, updateFn, onApplied }: NewValueProps) {
  const [value, setValue] = useState<"none" | "some" | "all">("none");
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    const r = await applyToAll(tracks, updateFn, () => ({ aiUsage: value }));
    setBusy(false); showResult(r.ok, r.fail, r.firstErr);
    if (r.fail === 0) onApplied();
  };
  return (
    <div className="space-y-4">
      <RadioGroup value={value} onValueChange={(v) => setValue(v as any)} className="space-y-2.5">
        {([["none", "None"], ["some", "Some"], ["all", "All"]] as const).map(([v, label]) => (
          <div key={v} className="flex items-center gap-2.5">
            <RadioGroupItem value={v} id={`ai-${v}`} />
            <Label htmlFor={`ai-${v}`} className="font-normal cursor-pointer">{label}</Label>
          </div>
        ))}
      </RadioGroup>
      <Button className="w-full" disabled={busy} onClick={apply}>
        {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Add to All Tracks
      </Button>
    </div>
  );
}

// ─── New Value panel dispatcher ───────────────────────────────────────────────

function NewValuePanel({ category, tracks, updateFn, onApplied }: {
  category: CategoryKey; tracks: Track[];
  updateFn: ReturnType<typeof useUpdateTrack>["mutateAsync"];
  onApplied: () => void;
}) {
  const props = { tracks, updateFn, onApplied };
  return (
    <Card className="bg-card/60 backdrop-blur border-border/50">
      <CardContent className="p-6 space-y-1">
        <p className="text-sm font-semibold">New Value</p>
        <p className="text-xs text-muted-foreground mb-4">
          Choose a value to populate on all tracks for this release
        </p>
        <div className="border-t border-border/30 pt-4">
          {category === "artists"      && <NewValueArtists {...props} />}
          {category === "contributors" && <NewValueContributors {...props} />}
          {category === "explicit"     && <NewValueExplicit {...props} />}
          {category === "country"      && <NewValueCountry {...props} />}
          {category === "year"         && <NewValueYear {...props} />}
          {category === "vocals"       && <NewValueVocals {...props} />}
          {category === "genre"        && <NewValueGenre {...props} />}
          {category === "clipstart"    && <NewValueClipStart {...props} />}
          {category === "ai"          && <NewValueAi {...props} />}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Current Values panel ─────────────────────────────────────────────────────

function CurrentValuesPanel({ category, tracks, updateFn, onApplied }: {
  category: CategoryKey; tracks: Track[];
  updateFn: ReturnType<typeof useUpdateTrack>["mutateAsync"];
  onApplied: () => void;
}) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const groups = extractGroups(tracks, category);

  const applyGroup = async (g: ValueGroup) => {
    setLoadingKey(g.key);
    let r: { ok: number; fail: number; firstErr: string };
    if (category === "artists") {
      const artist = g.rawValue as { name: string; role: string };
      r = await applyToAll(tracks, updateFn, (t) => {
        const cur = Array.isArray((t as any).displayArtists) ? (t as any).displayArtists : [];
        if (cur.some((a: any) => a.name === artist.name && a.role === artist.role)) return {};
        return { displayArtists: [...cur, artist] };
      });
    } else if (category === "contributors") {
      const entry = g.rawValue as { type: string; name: string; role: string; share?: number };
      r = await applyToAll(tracks, updateFn, (t) => {
        if (entry.type === "w") {
          const cur = Array.isArray((t as any).writers) ? (t as any).writers : [];
          return { writers: [...cur, { name: entry.name, role: entry.role, share: entry.share ?? 0 }] };
        } else if (entry.type === "p") {
          const cur = Array.isArray((t as any).performers) ? (t as any).performers : [];
          return { performers: [...cur, { name: entry.name, role: entry.role }] };
        } else {
          const cur = Array.isArray((t as any).production) ? (t as any).production : [];
          return { production: [...cur, { name: entry.name, role: entry.role }] };
        }
      });
    } else if (category === "explicit") {
      const val = g.rawValue as string;
      r = await applyToAll(tracks, updateFn, () => ({ explicitStatus: val, isExplicit: val === "explicit" }));
    } else if (category === "country") {
      r = await applyToAll(tracks, updateFn, () => ({ countryOfRecording: g.rawValue as string }));
    } else if (category === "year") {
      r = await applyToAll(tracks, updateFn, () => ({ recordingYear: g.rawValue as number }));
    } else if (category === "vocals") {
      r = await applyToAll(tracks, updateFn, () => ({ audioStyle: g.rawValue as string }));
    } else if (category === "genre") {
      const val = g.rawValue as { genre: string; subgenre?: string };
      r = await applyToAll(tracks, updateFn, () => ({ genre: val.genre, subgenre: val.subgenre ?? null }));
    } else if (category === "clipstart") {
      r = await applyToAll(tracks, updateFn, () => ({ clipStartSeconds: g.rawValue as number }));
    } else {
      r = await applyToAll(tracks, updateFn, () => ({ aiUsage: g.rawValue as string }));
    }
    setLoadingKey(null);
    showResult(r.ok, r.fail, r.firstErr);
    if (r.fail === 0) onApplied();
  };

  const removeGroup = async (g: ValueGroup) => {
    setLoadingKey(`remove-${g.key}`);
    let r: { ok: number; fail: number; firstErr: string };
    if (category === "artists") {
      const artist = g.rawValue as { name: string; role: string };
      r = await applyToAll(tracks, updateFn, (t) => {
        const cur = Array.isArray((t as any).displayArtists) ? (t as any).displayArtists : [];
        return { displayArtists: cur.filter((a: any) => !(a.name === artist.name && a.role === artist.role)) };
      });
    } else if (category === "contributors") {
      const entry = g.rawValue as { type: string; name: string; role: string };
      r = await applyToAll(tracks, updateFn, (t) => {
        if (entry.type === "w") {
          const cur = Array.isArray((t as any).writers) ? (t as any).writers : [];
          return { writers: cur.filter((e: any) => !(e.name === entry.name && e.role === entry.role)) };
        } else if (entry.type === "p") {
          const cur = Array.isArray((t as any).performers) ? (t as any).performers : [];
          return { performers: cur.filter((e: any) => !(e.name === entry.name && e.role === entry.role)) };
        } else {
          const cur = Array.isArray((t as any).production) ? (t as any).production : [];
          return { production: cur.filter((e: any) => !(e.name === entry.name && e.role === entry.role)) };
        }
      });
    } else {
      r = { ok: 0, fail: 0, firstErr: "" };
    }
    setLoadingKey(null);
    showResult(r.ok, r.fail, r.firstErr);
    if (r.fail === 0) onApplied();
  };

  const isArtistOrContrib = category === "artists" || category === "contributors";

  return (
    <Card className="bg-card/60 backdrop-blur border-border/50">
      <CardContent className="p-6">
        <p className="text-sm font-semibold">Current Value(s)</p>
        <p className="text-xs text-muted-foreground mb-4">
          Use a value that already exists on your release
        </p>
        <div className="border-t border-border/30 pt-4 space-y-3">
          {groups.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-4 text-center">
              No values set yet.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="border border-border/40 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{g.label}</p>
                    {g.sublabel && (
                      <p className="text-xs text-muted-foreground">{g.sublabel}</p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {isArtistOrContrib ? (
                      <>
                        <Button size="sm" className="h-7 text-xs px-2.5"
                          disabled={loadingKey === g.key}
                          onClick={() => applyGroup(g)}>
                          {loadingKey === g.key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                        </Button>
                        <Button size="sm" variant="destructive" className="h-7 text-xs px-2.5"
                          disabled={loadingKey === `remove-${g.key}`}
                          onClick={() => removeGroup(g)}>
                          {loadingKey === `remove-${g.key}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "Remove"}
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" className="h-7 text-xs px-2.5"
                        disabled={loadingKey === g.key}
                        onClick={() => applyGroup(g)}>
                        {loadingKey === g.key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
                      </Button>
                    )}
                  </div>
                </div>
                <TrackAccordion entries={g.trackEntries} total={tracks.length} />
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MultiTrackEditCategory() {
  const { id: rawId, category } = useParams<{ id: string; category: string }>();
  const releaseId = Number(rawId);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { mutateAsync: updateFn } = useUpdateTrack();

  const { data: release, isLoading } = useGetRelease(releaseId);
  const tracks: Track[] = (release as any)?.tracks ?? [];

  const onApplied = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetReleaseQueryKey(releaseId) });
  }, [queryClient, releaseId]);

  const catKey = category as CategoryKey;
  const meta = CATEGORY_META[catKey];

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 gap-6">
            <Skeleton className="h-64" /><Skeleton className="h-64" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!meta) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 py-8 text-muted-foreground">
          Unknown category: {category}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Back */}
        <div className="mb-6">
          <button
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            onClick={() => navigate(`/releases/${releaseId}/multi-track-edit`)}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-2xl font-bold tracking-tight">{meta.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{meta.description}</p>
        </div>

        {tracks.length === 0 ? (
          <p className="text-sm text-amber-400">
            This release has no tracks. Add tracks first.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <NewValuePanel
              category={catKey}
              tracks={tracks}
              updateFn={updateFn}
              onApplied={onApplied}
            />
            <CurrentValuesPanel
              category={catKey}
              tracks={tracks}
              updateFn={updateFn}
              onApplied={onApplied}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}
