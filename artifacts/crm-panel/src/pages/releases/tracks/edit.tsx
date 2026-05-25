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
      toast({ title: "Dolby Atmos файл загружен", description: file.name });
    } catch (e: any) {
      toast({ title: "Не удалось загрузить", description: e?.message ?? "Ошибка", variant: "destructive" });
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
            onClick={() => inputRef.current?.click()}>Заменить</Button>
          <Button type="button" variant="ghost" size="sm" className="text-rose-300"
            disabled={isUploading} onClick={() => onChange(null)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="w-full justify-start"
          disabled={isUploading} onClick={() => inputRef.current?.click()}>
          <Headphones className="h-3.5 w-3.5 mr-1.5" />
          {isUploading ? `Загрузка ${progress}%…` : "Загрузить Dolby Atmos (WAV/FLAC, ≤200 МБ)"}
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
        <div className="max-w-5xl mx-auto p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем трек…
        </div>
      </Layout>
    );
  }
  if (error || !track) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto p-6 text-sm text-rose-300">
          Трек не найден или нет доступа.
        </div>
      </Layout>
    );
  }

  const isBusy = updateTrack.isPending;

  return (
    <Layout>
      <div className="flex flex-col gap-0">

        {/* ── Top bar: Back + track index ─────────────────────────────── */}
        <div className="flex items-center justify-between pb-4 mb-2 border-b border-border/40">
          <button
            onClick={() => setLocation(`/releases/${releaseId}`)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent/40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="text-sm font-medium text-muted-foreground">
            {trackIndex >= 0 ? trackIndex + 1 : "—"}
          </span>
        </div>

        {/* ── Scrollable content ───────────────────────────────────────── */}
        <div className="space-y-6 pb-6">

          {/* ── 1. Audio Details ──────────────────────────────────────── */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileAudio className="h-4 w-4" /> Audio Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Audio file + AI radios */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Left: file selector + uploader */}
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground">Audio File</Label>
                  <AudioUploader
                    value={f.audioUrl}
                    trackId={track.id}
                    durationSeconds={f.durationSeconds}
                    onChange={(path, dur) => setF({ ...f, audioUrl: path, durationSeconds: dur ?? f.durationSeconds })}
                  />
                </div>

                {/* Right: AI usage RadioGroup */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground leading-relaxed">
                    What amount of generative AI tools were used in the creation of the stereo track? ?
                  </Label>
                  <RadioGroup
                    value={f.aiUsage}
                    onValueChange={(v) => setF({ ...f, aiUsage: v as FormState["aiUsage"] })}
                    className="gap-2"
                  >
                    {([["none", "None"], ["some", "Some"], ["all", "All"]] as const).map(([v, label]) => (
                      <div key={v} className="flex items-center gap-2">
                        <RadioGroupItem value={v} id={`ai-${v}`} />
                        <Label htmlFor={`ai-${v}`} className="text-sm font-normal cursor-pointer">{label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </div>

              {/* ISRC + Clip Start + Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">ISRC</Label>
                  <div className="flex gap-1.5">
                    <Input
                      value={f.isrc}
                      onChange={(e) => setF({ ...f, isrc: e.target.value })}
                      placeholder="TJCTM2500001"
                      className="bg-background/40 font-mono min-w-0"
                    />
                    <Button type="button" variant="outline" size="icon" title="Generate ISRC"
                      onClick={() => setF({ ...f, isrc: generateIsrc() })}>
                      <Wand2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70">Generate ISRC</p>
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
                    className="bg-background/40 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Preview Start Time</Label>
                  <div className="bg-background/40 border border-border/60 rounded-md px-3 py-2 text-sm font-mono text-muted-foreground">
                    {clipMm}:{clipSs}:00
                  </div>
                </div>
              </div>

              {/* ISWC + Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">ISWC ? — Optional</Label>
                  <Input
                    value={f.iswc}
                    onChange={(e) => setF({ ...f, iswc: e.target.value })}
                    placeholder="T-123.456.789-0"
                    className="bg-background/40 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Duration</Label>
                  <div className="bg-background/20 border border-border/60 rounded-md px-3 py-2 text-sm font-mono text-muted-foreground">
                    {fmtDuration(f.durationSeconds)}
                  </div>
                  <p className="text-[10px] text-muted-foreground/70">Auto-detected from audio file.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── 2. Spatial Audio (Dolby Atmos) ─────────────────────────── */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Headphones className="h-4 w-4" /> Spatial Audio (Dolby Atmos)
                <Badge variant="outline" className="text-[10px] ml-1 border-violet-500/40 text-violet-300">+$24.99</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Apple Music shows the Dolby Atmos badge when this file is uploaded.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {f.spatialAudioUrl ? (
                <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-2 flex items-center gap-2 text-xs">
                  <Badge className="bg-violet-500/20 border-violet-500/40 text-violet-200">Dolby Atmos</Badge>
                  <span className="text-muted-foreground">
                    {track.spatialBillingStatus === "charged" ? "оплачено"
                      : track.spatialBillingStatus === "pending" ? "будет списано $24.99 при отправке"
                      : track.spatialBillingStatus === "waived" ? "освобождено" : "не активно"}
                  </span>
                </div>
              ) : (
                <div className="rounded-md border border-border/40 bg-background/40 p-2 text-xs text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                  Spatial-файл не загружен. Загрузка добавит $24.99 к счёту.
                </div>
              )}
              <SpatialAudioUploader
                value={f.spatialAudioUrl}
                trackId={track.id}
                onChange={(path) => setF({ ...f, spatialAudioUrl: path })}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Spatial ISRC</Label>
                  <Input value={f.spatialIsrc}
                    onChange={(e) => setF({ ...f, spatialIsrc: e.target.value })}
                    placeholder="Отдельный ISRC для Atmos-версии"
                    className="bg-background/40 font-mono" />
                  <p className="text-[10px] text-muted-foreground/70">
                    Если пустое — используется основной ISRC.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">AI в spatial-версии</Label>
                  <Select value={f.spatialAiUsage || "none"}
                    onValueChange={(v) => setF({ ...f, spatialAiUsage: v as FormState["spatialAiUsage"] })}>
                    <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без AI</SelectItem>
                      <SelectItem value="some">Частично</SelectItem>
                      <SelectItem value="all">Полностью AI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── 3. Track Details ────────────────────────────────────────── */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Music2 className="h-4 w-4" /> Track Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Song Name ?</Label>
                  <Input
                    value={f.title}
                    onChange={(e) => setF({ ...f, title: e.target.value })}
                    placeholder="Track title"
                    className="bg-background/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Version (Optional)</Label>
                  <Input
                    value={f.trackVersion}
                    onChange={(e) => setF({ ...f, trackVersion: e.target.value })}
                    placeholder="Acoustic, Remix…"
                    className="bg-background/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Metadata Language</Label>
                  <Select value={f.language || "none"}
                    onValueChange={(v) => setF({ ...f, language: v === "none" ? "" : v })}>
                    <SelectTrigger className="bg-background/40"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Не указано</SelectItem>
                      {LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Lyrics + metadata translations */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Lyrics (Optional)</Label>
                  {f.isExplicit && (
                    <span className="text-[10px] text-amber-300">⚠ Contains EXPLICIT content</span>
                  )}
                </div>
                <Textarea
                  value={f.lyrics}
                  onChange={(e) => setF({ ...f, lyrics: e.target.value })}
                  rows={5}
                  placeholder="Leave empty if you don't want synced lyrics on DSP."
                  className="bg-background/40 font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Languages className="h-3 w-3" /> Metadata Translations
                </Label>
                <MetadataTranslationsEditor
                  value={f.metadataTranslations}
                  onChange={(v) => setF({ ...f, metadataTranslations: v })}
                />
              </div>

              {/* Track number */}
              <div className="sm:max-w-[160px] space-y-1.5">
                <Label className="text-xs text-muted-foreground">Track Number</Label>
                <Input
                  type="number" min={1}
                  value={f.trackNumber ?? ""}
                  onChange={(e) => setF({ ...f, trackNumber: e.target.value ? Number(e.target.value) : null })}
                  className="bg-background/40"
                />
              </div>
            </CardContent>
          </Card>

          {/* ── 4. Display Artists ──────────────────────────────────────── */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Display Artists ?
              </CardTitle>
              <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                Artists that appear as the main performers or in search items for the song.
                Each track requires a primary artist to be specified. Include any additional
                display artists who appear on this track.
              </p>
            </CardHeader>
            <CardContent>
              <DisplayArtistsEditor
                value={f.displayArtists}
                onChange={(v) => setF({ ...f, displayArtists: v })}
              />
            </CardContent>
          </Card>

          {/* ── 5. Contributors ──────────────────────────────────────────── */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> Contributors ?
              </CardTitle>
              <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                Apple Music requires that tracks must have at least one role per contributor group
                (Writers, Performers, Production &amp; Engineering). See the{" "}
                <a href="https://help.apple.com/itc/musicstyleguide/" target="_blank" rel="noopener noreferrer"
                  className="text-primary underline">Apple Music Style Guide</a>.
                Writer contributors must be entered with their real first and last names
                (ex: "Austin Post", not "Post Malone").
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h5 className="text-sm font-semibold mb-3">Writers</h5>
                <WritersEditor value={f.writers} onChange={(v) => setF({ ...f, writers: v })} />
              </div>
              <Separator className="opacity-30" />
              <div>
                <div className="flex items-baseline gap-2 mb-1">
                  <h5 className="text-sm font-semibold">Performers</h5>
                  <span className="text-xs text-muted-foreground">— OPTIONAL*</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">*Required for Apple Music</p>
                <PerformersEditor value={f.performers} onChange={(v) => setF({ ...f, performers: v })} />
              </div>
              <Separator className="opacity-30" />
              <div>
                <div className="flex items-baseline gap-2 mb-1">
                  <h5 className="text-sm font-semibold">Production &amp; Engineering</h5>
                  <span className="text-xs text-muted-foreground">— OPTIONAL*</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">*Required for Apple Music</p>
                <ProductionEditor value={f.production} onChange={(v) => setF({ ...f, production: v })} />
              </div>
            </CardContent>
          </Card>

          {/* ── Genre / Subgenre ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Genre</Label>
              <Select value={f.genre || "none"}
                onValueChange={(v) => setF({ ...f, genre: v === "none" ? "" : v, subgenre: "" })}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder="Please select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Not selected</SelectItem>
                  {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Subgenre</Label>
              <Select value={f.subgenre || "none"}
                onValueChange={(v) => setF({ ...f, subgenre: v === "none" ? "" : v })}
                disabled={subgenreOptions.length === 0}>
                <SelectTrigger className="bg-background/40">
                  <SelectValue placeholder={subgenreOptions.length === 0 ? "Select genre first" : "Please select"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Not selected</SelectItem>
                  {subgenreOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Recording Year / Country ──────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Recording Year</Label>
              <Input
                type="number" min={1900} max={2100}
                value={f.recordingYear ?? ""}
                onChange={(e) => setF({ ...f, recordingYear: e.target.value ? Number(e.target.value) : null })}
                className="bg-background/40"
                placeholder={String(new Date().getFullYear())}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Country of Recording</Label>
              <Select value={f.countryOfRecording || "none"}
                onValueChange={(v) => setF({ ...f, countryOfRecording: v === "none" ? "" : v })}>
                <SelectTrigger className="bg-background/40"><SelectValue placeholder="Select a Country" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Not specified</SelectItem>
                  {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Audio Style ──────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Audio Style ?</Label>
            <RadioGroup
              value={f.audioStyle}
              onValueChange={(v) => setF({ ...f, audioStyle: v as FormState["audioStyle"] })}
              className="flex gap-6 flex-wrap"
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
            {f.audioStyle === "vocal" && (
              <div className="sm:max-w-xs mt-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Vocal Language</Label>
                <Select value={f.vocalLanguage || "none"}
                  onValueChange={(v) => setF({ ...f, vocalLanguage: v === "none" ? "" : v })}>
                  <SelectTrigger className="bg-background/40"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Not specified</SelectItem>
                    {LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* ── Explicit Status ──────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Explicit Status ?</Label>
            <RadioGroup
              value={f.explicitStatus}
              onValueChange={(v) => setF({
                ...f,
                explicitStatus: v as FormState["explicitStatus"],
                isExplicit: v === "explicit",
              })}
              className="flex gap-6 flex-wrap"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="non_explicit" id="exp-clean" />
                <Label htmlFor="exp-clean" className="text-sm font-normal cursor-pointer">Non-Explicit</Label>
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

        {/* ── Bottom action bar ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t border-border/40">
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

      </div>
    </Layout>
  );
}
