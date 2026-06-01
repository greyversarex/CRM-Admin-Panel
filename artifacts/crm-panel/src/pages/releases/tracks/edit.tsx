// Полная страница редактирования трека — Symphonic-style (screenshot 2).
// Маршрут: /releases/:id/tracks/:tid/edit
// Секции: Audio Details, Track Details, Display Artists, Contributors,
//         Genre/Subgenre, Recording Year/Country, Audio Style, Explicit Status.
// Кнопки: Cancel | Save | Save & Next Track
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import {
  useGetTrack,
  useUpdateTrack,
  useGetRelease,
  useListTracks,
  type Track,
  type TrackDisplayArtist,
  type TrackWriter,
  type TrackPerformer,
  type TrackProductionMember,
  type TrackMetadataTranslationsItem,
  type CreateTrackBody,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowLeft, Save, Music2, Headphones, FileAudio, Users, UserPlus,
  AlertTriangle, Plus, Trash2, Languages, Loader2, Wand2,
} from "lucide-react";
import { AudioUploader, assetHref, useAssetUpload } from "@/components/asset-uploader";
import { toast } from "@/hooks/use-toast";
import {
  DisplayArtistsEditor, WritersEditor, PerformersEditor, ProductionEditor,
} from "@/components/release-wizard/contributors-editor";
import { GENRES, SUBGENRES, LANGS, COUNTRIES } from "@/components/release-wizard/types";

// ─── Helpers ────────────────────────────────────────────────────────────
function fmtDuration(s: number | null | undefined): string {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function generateIsrc(): string {
  const yy = String(new Date().getFullYear()).slice(-2);
  const nnnnn = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
  return `TJ-CTM-${yy}-${nnnnn}`.replace(/-/g, "");
}

// ─── Form state ──────────────────────────────────────────────────────────
type FormState = {
  title:              string;
  trackVersion:       string;
  isrc:               string;
  trackNumber:        number | null;
  durationSeconds:    number | null;
  genre:              string;
  subgenre:           string;
  language:           string;
  isExplicit:         boolean;
  explicitStatus:     "non_explicit" | "explicit" | "censored";
  aiUsage:            "none" | "some" | "all";
  clipStartSeconds:   number;
  recordingYear:      number | null;
  countryOfRecording: string;
  audioStyle:         "instrumental" | "vocal";
  vocalLanguage:      string;
  lyrics:             string;
  iswc:               string;
  audioUrl:           string | null;
  spatialAudioUrl:    string | null;
  spatialIsrc:        string;
  spatialAiUsage:     "none" | "some" | "all" | "";
  displayArtists:     TrackDisplayArtist[];
  writers:            TrackWriter[];
  performers:         TrackPerformer[];
  production:         TrackProductionMember[];
  metadataTranslations: TrackMetadataTranslationsItem[];
};

function trackToForm(t: Track): FormState {
  return {
    title:              t.title ?? "",
    trackVersion:       t.trackVersion ?? "",
    isrc:               t.isrc ?? "",
    trackNumber:        t.trackNumber ?? null,
    durationSeconds:    t.durationSeconds ?? null,
    genre:              t.genre ?? "",
    subgenre:           t.subgenre ?? "",
    language:           t.language ?? "",
    isExplicit:         !!t.isExplicit,
    explicitStatus:     (t.explicitStatus ?? "non_explicit") as FormState["explicitStatus"],
    aiUsage:            (t.aiUsage ?? "none") as FormState["aiUsage"],
    clipStartSeconds:   t.clipStartSeconds ?? 0,
    recordingYear:      t.recordingYear ?? null,
    countryOfRecording: t.countryOfRecording ?? "",
    audioStyle:         (t.audioStyle ?? "vocal") as FormState["audioStyle"],
    vocalLanguage:      t.vocalLanguage ?? "",
    lyrics:             t.lyrics ?? "",
    iswc:               t.iswc ?? "",
    audioUrl:           t.audioUrl ?? null,
    spatialAudioUrl:    t.spatialAudioUrl ?? null,
    spatialIsrc:        t.spatialIsrc ?? "",
    spatialAiUsage:     (t.spatialAiUsage ?? "") as FormState["spatialAiUsage"],
    displayArtists:     t.displayArtists ?? [],
    writers:            t.writers ?? [],
    performers:         t.performers ?? [],
    production:         t.production ?? [],
    metadataTranslations: t.metadataTranslations ?? [],
  };
}

function formToBody(f: FormState): Omit<CreateTrackBody, "artistId"> {
  const N = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    title:              f.title.trim(),
    trackVersion:       N(f.trackVersion),
    isrc:               N(f.isrc),
    trackNumber:        f.trackNumber ?? null,
    durationSeconds:    f.durationSeconds ?? null,
    genre:              N(f.genre),
    subgenre:           N(f.subgenre),
    language:           N(f.language),
    isExplicit:         f.isExplicit,
    explicitStatus:     f.explicitStatus,
    aiUsage:            f.aiUsage,
    clipStartSeconds:   f.clipStartSeconds,
    recordingYear:      f.recordingYear ?? null,
    countryOfRecording: N(f.countryOfRecording),
    audioStyle:         f.audioStyle,
    vocalLanguage:      f.audioStyle === "vocal" ? N(f.vocalLanguage) : null,
    lyrics:             N(f.lyrics),
    iswc:               N(f.iswc),
    audioUrl:           f.audioUrl,
    spatialAudioUrl:    f.spatialAudioUrl,
    spatialIsrc:        N(f.spatialIsrc),
    spatialAiUsage:     f.spatialAiUsage === "" ? null : f.spatialAiUsage,
    displayArtists:     f.displayArtists,
    writers:            f.writers,
    performers:         f.performers,
    production:         f.production,
    metadataTranslations: f.metadataTranslations.filter(
      (m) => m.language.trim() && m.title.trim(),
    ),
  };
}

// ─── Spatial Audio uploader ─────────────────────────────────────────────
function SpatialAudioUploader({
  value, trackId, onChange,
}: {
  value: string | null;
  trackId: number;
  onChange: (objectPath: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading, progress } = useAssetUpload();
  const onPick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const asset = await upload(file, { kind: "audio", trackId, attach: false });
      onChange(asset.objectPath);
      toast({ title: "Dolby Atmos file uploaded", description: file.name });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message ?? "Error", variant: "destructive" });
    }
  };
  return (
    <div className="space-y-2">
      <input
        ref={inputRef} type="file"
        accept="audio/wav,audio/x-wav,audio/flac,audio/x-flac,audio/mp4"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex items-center gap-3 p-2 rounded-md bg-background/40 border border-border/50">
          <div className="h-8 w-8 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
            <Headphones className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0 text-xs font-mono text-muted-foreground truncate">{value}</div>
          <Button type="button" variant="outline" size="sm" disabled={isUploading}
            onClick={() => inputRef.current?.click()}>Replace</Button>
          <Button type="button" variant="ghost" size="sm" className="text-rose-300"
            disabled={isUploading} onClick={() => onChange(null)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="w-full justify-start"
          disabled={isUploading} onClick={() => inputRef.current?.click()}>
          <Headphones className="h-3.5 w-3.5 mr-1.5" />
          {isUploading ? `Uploading ${progress}%…` : "Upload Dolby Atmos (WAV/FLAC, ≤200 MB)"}
        </Button>
      )}
      {isUploading && (
        <div className="h-1 bg-muted rounded overflow-hidden">
          <div className="h-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

// ─── Metadata translations ───────────────────────────────────────────────
function MetadataTranslationsEditor({
  value, onChange,
}: {
  value: TrackMetadataTranslationsItem[];
  onChange: (v: TrackMetadataTranslationsItem[]) => void;
}) {
  const update = (i: number, patch: Partial<TrackMetadataTranslationsItem>) =>
    onChange(value.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <div className="text-xs text-muted-foreground border border-dashed border-border/40 rounded px-2 py-3 text-center">
          Нет переводов. Добавьте, если название трека звучит на другом языке.
        </div>
      )}
      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center">
          <Input placeholder="Код (en, ru…)" value={row.language}
            onChange={(e) => update(i, { language: e.target.value })}
            className="col-span-3 bg-background/40 text-xs" />
          <Input placeholder="Название" value={row.title}
            onChange={(e) => update(i, { title: e.target.value })}
            className="col-span-6 bg-background/40 text-xs" />
          <Input placeholder="Версия" value={row.version ?? ""}
            onChange={(e) => update(i, { version: e.target.value })}
            className="col-span-2 bg-background/40 text-xs" />
          <Button variant="ghost" size="sm" className="text-rose-300 col-span-1"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full border-dashed"
        onClick={() => onChange([...value, { language: "", title: "", version: null }])}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Добавить перевод
      </Button>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────
export default function TrackEditPage() {
  const params = useParams<{ id: string; tid: string }>();
  const releaseId = Number(params.id);
  const trackId = Number(params.tid);
  const [, setLocation] = useLocation();

  if (!Number.isFinite(releaseId) || !Number.isFinite(trackId)) {
    return <Layout><div className="p-6 text-sm text-rose-300">Неверные параметры.</div></Layout>;
  }

  const { data: track, isLoading, error, refetch } = useGetTrack(trackId);
  const { data: release } = useGetRelease(releaseId);
  const { data: tracksData } = useListTracks(
    { release_id: releaseId },
    { query: { enabled: releaseId > 0 } } as never,
  );
  const allTracks: Track[] = (tracksData as any)?.data ?? [];
  const trackIndex = allTracks.findIndex((t) => t.id === trackId);
  const nextTrack = allTracks[trackIndex + 1] ?? null;

  const updateTrack = useUpdateTrack();
  const audioInputRef = useRef<HTMLInputElement>(null);
  const { upload: uploadAudio, isUploading: isAudioUploading, progress: audioProgress } = useAssetUpload();

  const [f, setF] = useState<FormState | null>(null);
  useEffect(() => {
    if (track) setF(trackToForm(track));
  }, [track?.id, track?.updatedAt]);

  const subgenreOptions = useMemo(
    () => (f?.genre ? SUBGENRES[f.genre] ?? [] : []),
    [f?.genre],
  );

  // ── Clip time helpers ──
  const clipMm = f ? String(Math.floor(f.clipStartSeconds / 60)).padStart(2, "0") : "00";
  const clipSs = f ? String(f.clipStartSeconds % 60).padStart(2, "0") : "00";

  const save = async (): Promise<boolean> => {
    if (!f || !track) return false;
    if (!f.title.trim()) {
      toast({ title: "Название трека обязательно", variant: "destructive" });
      return false;
    }
    try {
      await updateTrack.mutateAsync({
        id: track.id,
        data: { ...formToBody(f), artistId: track.artistId },
      });
      toast({ title: "Сохранено", description: `Трек «${f.title}» обновлён.` });
      void refetch();
      return true;
    } catch (e: any) {
      toast({ title: "Не удалось сохранить", description: e?.message ?? "Ошибка", variant: "destructive" });
      return false;
    }
  };

  const saveAndGoNext = async () => {
    const ok = await save();
    if (!ok) return;
    if (nextTrack) {
      setLocation(`/releases/${releaseId}/tracks/${nextTrack.id}/edit`);
    } else {
      setLocation(`/releases/${releaseId}`);
    }
  };

  if (isLoading || !f) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем трек…
        </div>
      </Layout>
    );
  }
  if (error || !track) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto p-6 text-sm text-rose-300">
          Трек не найден или нет доступа.
        </div>
      </Layout>
    );
  }

  const isBusy = updateTrack.isPending || isAudioUploading;

  const YEARS = Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => new Date().getFullYear() - i);

  const audioFileName = f.audioUrl
    ? f.audioUrl.split("/").pop() ?? f.audioUrl
    : null;

  return (
    <Layout>
      {/* Hidden audio file input */}
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/wav,audio/x-wav,audio/flac,audio/x-flac,audio/mpeg,audio/mp4,audio/aac"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const asset = await uploadAudio(file, { kind: "audio", trackId: track.id, attach: false });
            const url = URL.createObjectURL(file);
            const audioEl = new Audio(url);
            const dur = await new Promise<number | null>((res) => {
              audioEl.onloadedmetadata = () => res(isFinite(audioEl.duration) ? Math.round(audioEl.duration) : null);
              audioEl.onerror = () => res(null);
              setTimeout(() => res(null), 5000);
            });
            URL.revokeObjectURL(url);
            setF({ ...f, audioUrl: asset.objectPath, durationSeconds: dur ?? f.durationSeconds });
            toast({ title: "Audio uploaded", description: file.name });
          } catch (e: any) {
            toast({ title: "Upload failed", description: e?.message ?? "Error", variant: "destructive" });
          }
        }}
      />

      <div className="max-w-7xl mx-auto pb-28">

        {/* ── Back + track index ───────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setLocation(`/releases/${releaseId}`)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent/30 border border-border/40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="text-sm font-medium text-muted-foreground">
            {trackIndex >= 0 ? trackIndex + 1 : "—"}
          </span>
        </div>

        {/* ── Single form container ────────────────────────────────────── */}
        <div className="border border-border/50 rounded-lg bg-card/40 backdrop-blur divide-y divide-border/30">

          {/* ── 1. Audio Details ─────────────────────────────────────── */}
          <div className="p-6 space-y-5">
            <h3 className="text-lg font-semibold">Audio Details</h3>

            {/* Audio file row + AI radios */}
            <div className="grid grid-cols-2 gap-6 items-start">
              {/* Left */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Audio File</Label>
                <div className="flex gap-2">
                  <div className="flex-1 h-9 border border-border/60 rounded-md px-3 flex items-center text-sm text-muted-foreground/70 overflow-hidden">
                    <span className="truncate">{audioFileName ?? "Select Audio File"}</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={isAudioUploading}
                    onClick={() => audioInputRef.current?.click()}
                  >
                    {isAudioUploading
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{audioProgress}%</>
                      : "Upload Audio"}
                  </Button>
                </div>
                {isAudioUploading && (
                  <div className="h-1 bg-muted rounded overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${audioProgress}%` }} />
                  </div>
                )}
              </div>

              {/* Right: AI usage */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground leading-relaxed">
                  What amount of generative AI tools were used in the creation of the stereo track? ?
                </Label>
                <RadioGroup
                  value={f.aiUsage}
                  onValueChange={(v) => setF({ ...f, aiUsage: v as FormState["aiUsage"] })}
                  className="flex gap-4"
                >
                  {([["none", "None"], ["some", "Some"], ["all", "All"]] as const).map(([v, label]) => (
                    <div key={v} className="flex items-center gap-1.5">
                      <RadioGroupItem value={v} id={`ai-${v}`} />
                      <Label htmlFor={`ai-${v}`} className="text-sm font-normal cursor-pointer">{label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>

            {/* Status line */}
            <p className="text-xs text-muted-foreground/60">
              {audioFileName
                ? <><FileAudio className="inline h-3 w-3 mr-1" />{audioFileName}</>
                : "No audio file linked"}
            </p>

            {/* ISRC + Clip Start + Preview Start */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">ISRC</Label>
                <div className="flex gap-1.5">
                  <Input
                    value={f.isrc}
                    onChange={(e) => setF({ ...f, isrc: e.target.value })}
                    placeholder="TJCTM2500001"
                    className="font-mono min-w-0"
                  />
                  <Button type="button" variant="outline" size="sm" className="shrink-0"
                    onClick={() => setF({ ...f, isrc: generateIsrc() })}>
                    Generate ISRC
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Clip Start Time</Label>
                <Input
                  value={`${clipMm}:${clipSs}`}
                  onChange={(e) => {
                    const [mm, ss] = e.target.value.split(":").map(Number);
                    setF({ ...f, clipStartSeconds: Math.max(0, (mm || 0) * 60 + (ss || 0)) });
                  }}
                  placeholder="00:00"
                  className="font-mono w-24"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground text-right block">
                  Preview Start Time: {clipMm}:{clipSs}:00
                </Label>
                <div className="h-9 border border-border/40 rounded-md px-3 flex items-center text-sm font-mono text-muted-foreground/60">
                  {clipMm}:{clipSs}:00
                </div>
              </div>
            </div>

            {/* ISWC */}
            <div className="max-w-xs space-y-1.5">
              <Label className="text-xs text-muted-foreground">ISWC ? — Optional</Label>
              <Input
                value={f.iswc}
                onChange={(e) => setF({ ...f, iswc: e.target.value })}
                placeholder="T-123.456.789-0"
                className="font-mono"
              />
            </div>
          </div>

          {/* ── 1b. Spatial Audio ────────────────────────────────────── */}
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Spatial Audio ?</h3>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">
                +$24.99
              </span>
            </div>
            <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">$24.99</span> per spatial audio track will be charged to your account balance upon release approval.
            </div>

            <div className="grid grid-cols-2 gap-6 items-start">
              {/* Left: spatial file */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Spatial Audio File (Dolby Atmos)</Label>
                <SpatialAudioUploader
                  value={f.spatialAudioUrl}
                  trackId={track.id}
                  onChange={(p) => setF({ ...f, spatialAudioUrl: p })}
                />
              </div>
              {/* Right: spatial AI usage */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground leading-relaxed">
                  What amount of generative AI tools were used in the creation of this spatial file? ?
                </Label>
                <RadioGroup
                  value={f.spatialAiUsage || "none"}
                  onValueChange={(v) => setF({ ...f, spatialAiUsage: v as FormState["spatialAiUsage"] })}
                  className="flex gap-4"
                >
                  {([["none", "None"], ["some", "Some"], ["all", "All"]] as const).map(([v, label]) => (
                    <div key={v} className="flex items-center gap-1.5">
                      <RadioGroupItem value={v} id={`spatial-ai-${v}`} />
                      <Label htmlFor={`spatial-ai-${v}`} className="text-sm font-normal cursor-pointer">{label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>

            <div className="max-w-xs space-y-1.5">
              <Label className="text-xs text-muted-foreground">Spatial ISRC ? — Optional</Label>
              <Input
                value={f.spatialIsrc}
                onChange={(e) => setF({ ...f, spatialIsrc: e.target.value })}
                placeholder="TJCTM2500001"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground/60">We'll assign an ISRC if you don't have one.</p>
            </div>
          </div>

          {/* ── 2. Track Details ─────────────────────────────────────── */}
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold">Track Details</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Song Name ?</Label>
                <Input
                  value={f.title}
                  onChange={(e) => setF({ ...f, title: e.target.value })}
                  placeholder=""
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Version (Optional)</Label>
                <Input
                  value={f.trackVersion}
                  onChange={(e) => setF({ ...f, trackVersion: e.target.value })}
                  placeholder=""
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Metadata Language</Label>
                <Select value={f.language || "none"}
                  onValueChange={(v) => setF({ ...f, language: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Not specified</SelectItem>
                    {LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── 3. Display Artists ───────────────────────────────────── */}
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Display Artists</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Artists that appear as the main performers or in search items for the song.
                Each track requires a primary artist to be specified. Include any additional
                display artists who appear on this track.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground px-0.5">
              <span>Artist Name</span><span>Role</span>
            </div>
            <DisplayArtistsEditor
              value={f.displayArtists}
              onChange={(v) => setF({ ...f, displayArtists: v })}
            />
          </div>

          {/* ── 4. Contributors ──────────────────────────────────────── */}
          <div className="p-6 space-y-5">
            <div>
              <h3 className="text-lg font-semibold">Contributors ?</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Apple Music requires that tracks delivered to Apple Music must have at least one role represented
                per contributor group (Writers, Performers, Production &amp; Engineering). Details from Apple can be
                found in their{" "}
                <a href="https://help.apple.com/itc/musicstyleguide/" target="_blank" rel="noopener noreferrer"
                  className="text-primary underline">Apple Music Style Guide</a>.
                Writer contributors must be entered with their real first and last names
                (ex: "Austin Post", not "Post Malone").
              </p>
            </div>

            {/* Writers */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Writers</h4>
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground px-0.5">
                <span>Artist Name</span><span>Role</span>
              </div>
              <WritersEditor value={f.writers} onChange={(v) => setF({ ...f, writers: v })} />
            </div>

            <Separator className="opacity-20" />

            {/* Performers */}
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold">Performers <span className="text-muted-foreground font-normal">— OPTIONAL*</span></h4>
                <p className="text-[11px] text-muted-foreground">*Required for Apple</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground px-0.5">
                <span>Artist Name</span><span>Role</span>
              </div>
              <PerformersEditor value={f.performers} onChange={(v) => setF({ ...f, performers: v })} />
            </div>

            <Separator className="opacity-20" />

            {/* Production & Engineering */}
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold">Production &amp; Engineering <span className="text-muted-foreground font-normal">— OPTIONAL*</span></h4>
                <p className="text-[11px] text-muted-foreground">*Required for Apple</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground px-0.5">
                <span>Artist Name</span><span>Role</span>
              </div>
              <ProductionEditor value={f.production} onChange={(v) => setF({ ...f, production: v })} />
            </div>
          </div>

          {/* ── 5. Genre + Subgenres ─────────────────────────────────── */}
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Genre</Label>
                <Select value={f.genre || "none"}
                  onValueChange={(v) => setF({ ...f, genre: v === "none" ? "" : v, subgenre: "" })}>
                  <SelectTrigger><SelectValue placeholder="Please select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Not selected</SelectItem>
                    {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Subgenres</Label>
                <Select value={f.subgenre || "none"}
                  onValueChange={(v) => setF({ ...f, subgenre: v === "none" ? "" : v })}
                  disabled={subgenreOptions.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={subgenreOptions.length === 0 ? "Select genre first" : "Please select"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Not selected</SelectItem>
                    {subgenreOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── 6. Recording Year + Country ──────────────────────────── */}
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Recording Year</Label>
                <Select
                  value={f.recordingYear ? String(f.recordingYear) : "none"}
                  onValueChange={(v) => setF({ ...f, recordingYear: v === "none" ? null : Number(v) })}
                >
                  <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                  <SelectContent className="max-h-48">
                    <SelectItem value="none">— Not specified</SelectItem>
                    {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Country of Recording</Label>
                <Select value={f.countryOfRecording || "none"}
                  onValueChange={(v) => setF({ ...f, countryOfRecording: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select a Country of Recording" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Not specified</SelectItem>
                    {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── 7. Audio Style + Explicit Status ─────────────────────── */}
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Audio Style ?</Label>
              <RadioGroup
                value={f.audioStyle}
                onValueChange={(v) => setF({ ...f, audioStyle: v as FormState["audioStyle"] })}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="instrumental" id="style-instrumental" />
                  <Label htmlFor="style-instrumental" className="text-sm font-normal cursor-pointer">Instrumental</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="vocal" id="style-vocal" />
                  <Label htmlFor="style-vocal" className="text-sm font-normal cursor-pointer">Vocal</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Explicit Status ?</Label>
              <RadioGroup
                value={f.explicitStatus}
                onValueChange={(v) => setF({
                  ...f,
                  explicitStatus: v as FormState["explicitStatus"],
                  isExplicit: v === "explicit",
                })}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="non_explicit" id="exp-clean" />
                  <Label htmlFor="exp-clean" className="text-sm font-normal cursor-pointer">Non Explicit</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="explicit" id="exp-explicit" />
                  <Label htmlFor="exp-explicit" className="text-sm font-normal cursor-pointer">Explicit</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="censored" id="exp-censored" />
                  <Label htmlFor="exp-censored" className="text-sm font-normal cursor-pointer">Censored</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

        </div>
      </div>

      {/* ── Fixed bottom bar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur border-t border-border/50 px-6 py-3 flex items-center justify-between">
        <Button variant="outline" onClick={() => setLocation(`/releases/${releaseId}`)}>
          Cancel
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={save} disabled={isBusy}>
            {isBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save
          </Button>
          <Button onClick={saveAndGoNext} disabled={isBusy}>
            {isBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {nextTrack ? "Save & Next Track" : "Save & Finish"}
          </Button>
        </div>
      </div>

    </Layout>
  );
}
