// Полная страница редактирования трека — Symphonic-style (screenshot 2).
// Маршрут: /releases/:id/tracks/:tid/edit
// Секции: Audio Details, Track Details, Display Artists, Contributors,
//         Genre/Subgenre, Recording Year/Country, Audio Style, Explicit Status.
// Кнопки: Cancel | Save | Save & Next Track
import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTrack,
  useUpdateTrack,
  useGetRelease,
  useListTracks,
  useListAssets,
  type Track,
  type Asset,
  type TrackDisplayArtist,
  type TrackWriter,
  type TrackPerformer,
  type TrackProductionMember,
  type TrackMetadataTranslationsItem,
  type CreateTrackBody,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowLeft, Save, Music2, FileAudio, Plus, Trash2, Loader2, Wand2,
} from "lucide-react";
import { WaveformPlayer } from "@/components/waveform-player";
import { toast } from "@/hooks/use-toast";
import {
  DisplayArtistsEditor, WritersEditor, PerformersEditor, ProductionEditor,
  splitWriterSharesEvenly,
} from "@/components/release-wizard/contributors-editor";
import { SUBGENRES, subgenreOptionsFor, genreOptionsWith, LANGS, COUNTRIES } from "@/components/release-wizard/types";
import { useCatalogOptions } from "@/components/release-wizard/use-catalog";
import { DictionaryCombobox } from "@/components/release-wizard/dictionary-combobox";
import { InfoTip } from "@/components/release-wizard/info-tip";
import { generateIsrcCode } from "@/lib/codes";
import { useLang } from "@/lib/i18n";

// ─── Helpers ────────────────────────────────────────────────────────────
function fmtDuration(s: number | null | undefined): string {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
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
  explicitStatus:     "" | "non_explicit" | "explicit" | "censored";
  aiUsage:            "" | "none" | "some" | "all";
  clipStartSeconds:   number;
  recordingYear:      number | null;
  countryOfRecording: string;
  audioStyle:         "" | "instrumental" | "vocal";
  vocalLanguage:      string;
  lyrics:             string;
  iswc:               string;
  audioUrl:           string | null;
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
    language:           t.language ?? "English",
    isExplicit:         !!t.isExplicit,
    explicitStatus:     (t.explicitStatus ?? "") as FormState["explicitStatus"],
    aiUsage:            (t.aiUsage ?? "") as FormState["aiUsage"],
    clipStartSeconds:   t.clipStartSeconds ?? 0,
    recordingYear:      t.recordingYear ?? null,
    countryOfRecording: t.countryOfRecording ?? "",
    audioStyle:         (t.audioStyle ?? "") as FormState["audioStyle"],
    vocalLanguage:      t.vocalLanguage ?? "",
    lyrics:             t.lyrics ?? "",
    iswc:               t.iswc ?? "",
    audioUrl:           t.audioUrl ?? null,
    displayArtists:     t.displayArtists?.length ? t.displayArtists : [],
    writers:            t.writers?.length ? t.writers : [{ name: "", role: "" as TrackWriter["role"], share: 100, caeIpi: null }],
    performers:         t.performers?.length ? t.performers : [{ name: "", role: "" }],
    production:         t.production?.length ? t.production : [{ name: "", role: "" }],
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
    explicitStatus:     (f.explicitStatus || undefined) as "non_explicit" | "explicit" | "censored" | undefined,
    aiUsage:            (f.aiUsage || undefined) as "none" | "some" | "all" | undefined,
    clipStartSeconds:   f.clipStartSeconds,
    recordingYear:      f.recordingYear ?? null,
    countryOfRecording: N(f.countryOfRecording),
    audioStyle:         (f.audioStyle || undefined) as "instrumental" | "vocal" | undefined,
    vocalLanguage:      (f.audioStyle === "vocal" || !f.audioStyle) ? N(f.vocalLanguage) : null,
    lyrics:             N(f.lyrics),
    iswc:               N(f.iswc),
    audioUrl:           f.audioUrl,
    displayArtists:     f.displayArtists.filter((a) => a.name.trim()),
    writers:            splitWriterSharesEvenly(f.writers.filter((w) => w.name.trim())),
    performers:         f.performers.filter((p) => p.name.trim()),
    production:         f.production.filter((p) => p.name.trim()),
    metadataTranslations: f.metadataTranslations.filter(
      (m) => m.language.trim() && m.title.trim(),
    ),
  };
}


// ─── Metadata translations ───────────────────────────────────────────────
function MetadataTranslationsEditor({
  value, onChange,
}: {
  value: TrackMetadataTranslationsItem[];
  onChange: (v: TrackMetadataTranslationsItem[]) => void;
}) {
  const { t } = useLang();
  const update = (i: number, patch: Partial<TrackMetadataTranslationsItem>) =>
    onChange(value.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <div className="text-sm text-muted-foreground border border-dashed border-border/40 rounded px-2 py-3 text-center">
          {t.trackEdit.noTranslations}
        </div>
      )}
      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center">
          <Input placeholder={t.trackEdit.codePlaceholder} value={row.language}
            onChange={(e) => update(i, { language: e.target.value })}
            className="col-span-3 bg-background/40 text-sm" />
          <Input placeholder={t.trackEdit.titlePlaceholder} value={row.title}
            onChange={(e) => update(i, { title: e.target.value })}
            className="col-span-6 bg-background/40 text-sm" />
          <Input placeholder={t.trackEdit.versionPlaceholder} value={row.version ?? ""}
            onChange={(e) => update(i, { version: e.target.value })}
            className="col-span-2 bg-background/40 text-sm" />
          <Button variant="ghost" size="sm" className="text-rose-300 col-span-1"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full border-dashed"
        onClick={() => onChange([...value, { language: "", title: "", version: null }])}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> {t.trackEdit.addTranslation}
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
  const { t: T } = useLang();
  const L = T.trackEdit;

  if (!Number.isFinite(releaseId) || !Number.isFinite(trackId)) {
    return <Layout><div className="p-6 text-sm text-rose-300">{L.invalidParams}</div></Layout>;
  }

  const { data: track, isLoading, error, refetch } = useGetTrack(trackId);
  const { data: release } = useGetRelease(releaseId);
  const { data: tracksData } = useListTracks(
    { release_id: releaseId, limit: 500 },
    { query: { enabled: releaseId > 0 } } as never,
  );
  const allTracks: Track[] = (tracksData as any)?.data ?? [];
  const trackIndex = allTracks.findIndex((t) => t.id === trackId);
  const nextTrack = allTracks[trackIndex + 1] ?? null;

  const updateTrack = useUpdateTrack();
  const queryClient = useQueryClient();

  // Пул стерео-аудио релиза — все файлы, загруженные на странице Upload Stereo
  // Audio. Из него трек выбирает свой файл через выпадающий список.
  const { data: audioAssetsData } = useListAssets(
    { release_id: releaseId, kind: "audio" },
    { query: { enabled: releaseId > 0 } } as never,
  );
  const audioPool: Asset[] = (audioAssetsData as any) ?? [];
  // Аудиофайлы, уже привязанные к ДРУГИМ трекам релиза — их нельзя выбрать
  // повторно для текущего трека (один файл = один трек).
  const audioUsedByOtherTracks = new Set(
    allTracks
      .filter((t) => t.id !== trackId && t.audioUrl)
      .map((t) => t.audioUrl as string),
  );

  const [f, setF] = useState<FormState | null>(null);
  const [isrcBusy, setIsrcBusy] = useState(false);
  const [isrcAuto, setIsrcAuto] = useState(false);
  const toggleIsrcAuto = async (checked: boolean) => {
    setIsrcAuto(checked);
    if (!checked) return;
    // Присвоить ISRC автоматически: генерируем код и подставляем в поле.
    setIsrcBusy(true);
    try {
      const { code, warning } = await generateIsrcCode();
      setF((prev) => (prev ? { ...prev, isrc: code } : prev));
      if (warning) toast({ title: L.isrcToast, description: warning });
    } catch (e: any) {
      setIsrcAuto(false);
      toast({ title: L.errorToast, description: e?.message ?? "", variant: "destructive" });
    } finally {
      setIsrcBusy(false);
    }
  };
  const [isTranscribing, setIsTranscribing] = useState(false);
  useEffect(() => {
    if (!track) return;
    const form = trackToForm(track);
    // Auto-populate Display Artists with the release's primary artist if none are saved yet.
    if (form.displayArtists.length === 0 && release?.artistName) {
      form.displayArtists = [{ name: release.artistName, role: "primary" }];
    }
    // Auto-populate Recording Year from the release's cLineYear when the track has no year set.
    if (!form.recordingYear && release?.cLineYear) {
      form.recordingYear = release.cLineYear;
    }
    // Auto-populate Genre + Subgenre from release when track has none.
    if (!form.genre && release?.genre) {
      form.genre = release.genre;
      // Only carry subgenre if it belongs to the genre being set.
      if (!form.subgenre && release?.subgenre) {
        form.subgenre = release.subgenre;
      }
    }
    setF(form);
  }, [track?.id, track?.updatedAt, release?.artistName, release?.cLineYear, release?.genre, release?.subgenre]);

  // Справочники Broma16 (жанр/язык/страна). Пока словарь пуст — курируемый фолбэк.
  const langOpts = useCatalogOptions("language", { valueKey: "code", fallback: LANGS.map((l) => ({ value: l.value, label: l.label })) });
  const countryOpts = useCatalogOptions("country", { valueKey: "code", fallback: COUNTRIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })) });

  // ── Clip time helpers (HH:MM:SS) ──
  const clipHh = f ? String(Math.floor(f.clipStartSeconds / 3600)).padStart(2, "0") : "00";
  const clipMm = f ? String(Math.floor((f.clipStartSeconds % 3600) / 60)).padStart(2, "0") : "00";
  const clipSs = f ? String(f.clipStartSeconds % 60).padStart(2, "0") : "00";

  const save = async (): Promise<boolean> => {
    if (!f || !track) return false;
    if (!f.title.trim()) {
      toast({ title: L.titleRequired, variant: "destructive" });
      return false;
    }
    if (f.writers.filter((w) => w.name.trim()).length === 0) {
      toast({
        title: L.writersRequiredTitle,
        description: L.writersRequiredDesc,
        variant: "destructive",
      });
      return false;
    }
    if (!f.audioStyle) {
      toast({
        title: L.audioStyleRequiredTitle,
        description: L.audioStyleRequiredDesc,
        variant: "destructive",
      });
      return false;
    }
    if (!f.explicitStatus) {
      toast({
        title: L.explicitStatusRequiredTitle,
        description: L.explicitStatusRequiredDesc,
        variant: "destructive",
      });
      return false;
    }
    // Проверяем: если у участника есть имя, должна быть выбрана роль.
    for (const w of f.writers.filter((w) => w.name.trim())) {
      if (!w.role) {
        toast({
          title: L.roleMissingTitle,
          description: L.roleMissingWriters.replace("{name}", w.name),
          variant: "destructive",
        });
        return false;
      }
    }
    for (const p of f.performers.filter((p) => p.name.trim())) {
      if (!p.role) {
        toast({
          title: L.roleMissingTitle,
          description: L.roleMissingPerformers.replace("{name}", p.name),
          variant: "destructive",
        });
        return false;
      }
    }
    for (const p of f.production.filter((p) => p.name.trim())) {
      if (!p.role) {
        toast({
          title: L.roleMissingTitle,
          description: L.roleMissingProduction.replace("{name}", p.name),
          variant: "destructive",
        });
        return false;
      }
    }

    const hasProducer =
      f.production.some((p) => /producer/i.test(p.role) && p.name.trim()) ||
      f.performers.some((p) => /producer/i.test(p.role) && p.name.trim());
    if (!hasProducer) {
      toast({
        title: L.producerRequiredTitle,
        description: L.producerRequiredDesc,
        variant: "destructive",
      });
      return false;
    }
    try {
      await updateTrack.mutateAsync({
        id: track.id,
        data: { ...formToBody(f), artistId: track.artistId },
      });
      // Инвалидируем кэш: трек, список треков релиза и все треки.
      await queryClient.invalidateQueries({ queryKey: [`/api/tracks/${track.id}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
      toast({ title: L.savedTitle, description: L.savedDesc.replace("{title}", f.title) });
      return true;
    } catch (e: any) {
      toast({ title: L.saveFailedTitle, description: e?.message ?? L.saveFailedDesc, variant: "destructive" });
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
          <Loader2 className="h-4 w-4 animate-spin" /> {L.loadingTrack}
        </div>
      </Layout>
    );
  }
  if (error || !track) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto p-6 text-sm text-rose-300">
          {L.notFound}
        </div>
      </Layout>
    );
  }

  const isBusy = updateTrack.isPending;

  const YEARS = Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => new Date().getFullYear() - i);

  // Выбранный сейчас файл и варианты для выпадающего списка. Если текущий
  // audioUrl трека не из пула релиза (legacy-загрузка на сам трек) — добавляем
  // его отдельной опцией, чтобы он не «пропал» из списка.
  const selectedAsset = audioPool.find((a) => a.objectPath === f.audioUrl) ?? null;
  const audioFileName = selectedAsset?.filename
    ?? (f.audioUrl ? f.audioUrl.split("/").pop() ?? f.audioUrl : null);

  const fmtUploaded = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleString();
  };

  type AudioOption = { value: string; label: string; sub: string };
  const audioOptions: AudioOption[] = audioPool
    .filter((a) => !audioUsedByOtherTracks.has(a.objectPath))
    .map((a) => ({
      value: a.objectPath,
      label: a.filename,
      sub: L.uploadedAt.replace("{date}", fmtUploaded(a.createdAt)),
    }));
  if (f.audioUrl && !audioOptions.some((o) => o.value === f.audioUrl)) {
    audioOptions.unshift({
      value: f.audioUrl,
      label: audioFileName ?? f.audioUrl,
      sub: L.currentTrackFile,
    });
  }

  const onSelectAudio = (val: string) => {
    if (val === "__none__") { setF({ ...f, audioUrl: null }); return; }
    const a = audioPool.find((x) => x.objectPath === val) ?? null;
    setF({
      ...f,
      audioUrl: val,
      durationSeconds: a?.durationSeconds ?? f.durationSeconds,
    });
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto pb-8">

        {/* ── Back + track index ───────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setLocation(`/releases/${releaseId}`)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent/30 border border-border/40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {L.back}
          </button>
          <span className="text-sm font-medium text-muted-foreground">
            {trackIndex >= 0 ? trackIndex + 1 : "—"}
          </span>
        </div>

        {/* ── Two cards: Audio | Metadata ──────────────────────────────── */}
        <div className="space-y-6">

          {/* ── Card 1: Audio (Audio Details + Spatial Audio) ────────── */}
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm transition-all hover:border-border/80 hover:shadow-md hover:shadow-primary/5">
            <CardContent className="p-6 space-y-6">

            {/* Audio Details */}
            <div className="space-y-5">
            <h3 className="text-lg font-semibold">{L.audioDetails}</h3>

            {/* Audio file row + AI radios */}
            <div className="grid grid-cols-2 gap-6 items-start">
              {/* Left */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">{L.audioFile}</Label>
                <div className="flex gap-2">
                  <Select
                    value={f.audioUrl ?? "__none__"}
                    onValueChange={onSelectAudio}
                  >
                    <SelectTrigger className="flex-1 min-w-0">
                      <SelectValue placeholder={L.selectAudioFile} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{L.selectNone}</SelectItem>
                      {audioOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          <span className="flex flex-col">
                            <span className="truncate">{o.label}</span>
                            <span className="text-[11px] text-muted-foreground">{o.sub}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setLocation(`/releases/${releaseId}/tracks/${track.id}/audio-upload`)}
                  >
                    {L.uploadAudio}
                  </Button>
                </div>
                {audioOptions.length === 0 && (
                  <p className="text-[11px] text-muted-foreground/70">
                    {L.noAudioUploaded}
                  </p>
                )}
              </div>

              {/* Right: AI usage */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground leading-relaxed">
                  {L.aiUsageQuestion}{" "}
                  <InfoTip text={L.aiUsageTip} />
                </Label>
                <RadioGroup
                  value={f.aiUsage}
                  onValueChange={(v) => setF({ ...f, aiUsage: v as FormState["aiUsage"] })}
                  className="flex gap-4"
                >
                  {([["none", L.aiNone], ["some", L.aiSome], ["all", L.aiAll]] as const).map(([v, label]) => (
                    <div key={v} className="flex items-center gap-1.5">
                      <RadioGroupItem value={v} id={`ai-${v}`} />
                      <Label htmlFor={`ai-${v}`} className="text-sm font-normal cursor-pointer">{label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>

            {/* Waveform player / status */}
            {f.audioUrl ? (
              <WaveformPlayer objectPath={f.audioUrl} filename={audioFileName} trackId={trackId} />
            ) : (
              <p className="text-sm text-muted-foreground/60">
                <FileAudio className="inline h-3 w-3 mr-1" /> {L.noAudioLinked}
              </p>
            )}

            {/* ISRC + Clip Start Time — два равных столбца */}
            <div className="grid grid-cols-2 gap-6 items-end">
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">ISRC</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    value={f.isrc}
                    onChange={(e) => setF({ ...f, isrc: e.target.value })}
                    placeholder="TJCTM2500001"
                    className="font-mono min-w-0"
                    disabled={isrcAuto || isrcBusy}
                  />
                  <label className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none">
                    <Checkbox
                      checked={isrcAuto}
                      disabled={isrcBusy}
                      onCheckedChange={(v) => void toggleIsrcAuto(v === true)}
                    />
                    <span className="text-xs leading-tight text-muted-foreground max-w-[5.5rem] whitespace-normal">
                      {L.assignAutomatically}
                    </span>
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground inline-flex items-center gap-1">
                  {L.clipStartTime} <InfoTip text={L.clipStartTip} />
                </Label>
                <Input
                  value={`${clipHh}:${clipMm}:${clipSs}`}
                  onChange={(e) => {
                    const parts = e.target.value.split(":").map((p) => parseInt(p, 10) || 0);
                    const hh = parts[0] ?? 0;
                    const mm = parts[1] ?? 0;
                    const ss = Math.min(59, parts[2] ?? 0);
                    setF({ ...f, clipStartSeconds: Math.max(0, hh * 3600 + mm * 60 + ss) });
                  }}
                  placeholder="00:00:00"
                  className="font-mono w-full"
                />
              </div>
            </div>

            {/* ISWC */}
            <div className="max-w-xs space-y-1.5">
              <Label className="text-sm text-muted-foreground inline-flex items-center gap-1">
                ISWC <InfoTip text={L.iswcTip} /> — {L.optional}
              </Label>
              <Input
                value={f.iswc}
                onChange={(e) => setF({ ...f, iswc: e.target.value })}
                placeholder="T-123.456.789-0"
                className="font-mono"
              />
            </div>
            </div>

            </CardContent>
          </Card>

          {/* ── Card 2: Metadata (Track Details onward) ──────────────── */}
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm transition-all hover:border-border/80 hover:shadow-md hover:shadow-primary/5">
            <CardContent className="p-6 space-y-6">

            {/* Track Details */}
            <div className="space-y-4">
            <h3 className="text-lg font-semibold">{L.trackDetails}</h3>
            <div className="grid grid-cols-3 gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground inline-flex items-center gap-1">
                  {L.songName} <InfoTip text={L.songNameTip} />
                </Label>
                <Input
                  value={f.title}
                  onChange={(e) => setF({ ...f, title: e.target.value })}
                  placeholder=""
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">{L.versionOptional}</Label>
                <Input
                  value={f.trackVersion}
                  onChange={(e) => setF({ ...f, trackVersion: e.target.value })}
                  placeholder=""
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">{L.metadataLanguage}</Label>
                <DictionaryCombobox
                  value={f.language || ""}
                  onChange={(v) => setF({ ...f, language: v })}
                  options={[{ value: "", label: L.notSpecifiedOpt }, ...langOpts.options]}
                  placeholder={L.selectLanguage}
                />
              </div>
            </div>
            </div>
            </CardContent>
          </Card>

          {/* ── Card 3: Display Artists, Contributors, Genre, etc. ──── */}
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm transition-all hover:border-border/80 hover:shadow-md hover:shadow-primary/5">
            <CardContent className="p-6 space-y-6">

            {/* Display Artists */}
            <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{L.displayArtists}</h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {L.displayArtistsDesc}
              </p>
            </div>
            <DisplayArtistsEditor
              hideTitle
              value={f.displayArtists}
              onChange={(v) => setF({ ...f, displayArtists: v })}
            />
            </div>

            <Separator className="opacity-20" />

            {/* Contributors */}
            <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold inline-flex items-center gap-1.5">
                {L.contributors} <InfoTip text={L.contributorsTip} />
              </h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {L.contributorsDescPart1}{" "}
                <a href="https://help.apple.com/itc/musicstyleguide/" target="_blank" rel="noopener noreferrer"
                  className="text-primary underline">{L.appleStyleGuide}</a>.{" "}
                {L.contributorsDescPart2}
              </p>
            </div>

            {/* Writers */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">{L.writers}</h4>
              <WritersEditor hideTitle value={f.writers} onChange={(v) => setF({ ...f, writers: v })} />
            </div>

            <Separator className="opacity-20" />

            {/* Performers */}
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold">{L.performers} <span className="text-muted-foreground font-normal">— {L.optionalUpper}</span></h4>
                <p className="text-[11px] text-muted-foreground">{L.requiredForApple}</p>
              </div>
              <PerformersEditor hideTitle value={f.performers} onChange={(v) => setF({ ...f, performers: v })} />
            </div>

            <Separator className="opacity-20" />

            {/* Production & Engineering */}
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold">{L.productionEngineering} <span className="text-rose-400 font-normal">— {L.requiredLower}</span></h4>
                <p className="text-[11px] text-muted-foreground">{L.productionHint}</p>
              </div>
              <ProductionEditor hideTitle value={f.production} onChange={(v) => setF({ ...f, production: v })} />
            </div>
            </div>

            <Separator className="opacity-20" />

            {/* Genre */}
            <div className="space-y-4">
            <h3 className="text-lg font-semibold">{L.genre}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">{L.genre}</Label>
                <DictionaryCombobox
                  value={f.genre || ""}
                  onChange={(v) => setF({ ...f, genre: v, subgenre: (SUBGENRES[v] ?? []).includes(f.subgenre) ? f.subgenre : "" })}
                  options={[{ value: "", label: L.notSelectedOpt }, ...genreOptionsWith(f.genre)]}
                  placeholder={L.pleaseSelect}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">{L.subgenres}</Label>
                <DictionaryCombobox
                  value={f.subgenre || ""}
                  onChange={(v) => setF({ ...f, subgenre: v })}
                  options={[{ value: "", label: L.notSelectedOpt }, ...subgenreOptionsFor(f.genre, f.subgenre)]}
                  placeholder={L.pleaseSelect}
                />
              </div>
            </div>
            </div>

            <Separator className="opacity-20" />

            {/* Recording */}
            <div className="space-y-4">
            <h3 className="text-lg font-semibold">{L.recording}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">{L.recordingYear}</Label>
                <Select
                  value={f.recordingYear ? String(f.recordingYear) : "none"}
                  onValueChange={(v) => setF({ ...f, recordingYear: v === "none" ? null : Number(v) })}
                >
                  <SelectTrigger><SelectValue placeholder={L.selectYear} /></SelectTrigger>
                  <SelectContent className="max-h-48">
                    <SelectItem value="none">{L.notSpecifiedOpt}</SelectItem>
                    {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">{L.countryOfRecording}</Label>
                <DictionaryCombobox
                  value={f.countryOfRecording || ""}
                  onChange={(v) => setF({ ...f, countryOfRecording: v })}
                  options={[{ value: "", label: L.notSpecifiedOpt }, ...countryOpts.options]}
                  placeholder={L.selectCountry}
                />
              </div>
            </div>
            </div>

            <Separator className="opacity-20" />

            {/* Classification */}
            <div className="space-y-5">
            <h3 className="text-lg font-semibold">{L.classification}</h3>

            {/* Audio Style + Explicit Status side by side */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-semibold inline-flex items-center gap-1">
                  {L.audioStyle} <InfoTip text={L.audioStyleTip} />
                </Label>
                <RadioGroup
                  value={f.audioStyle}
                  onValueChange={(v) => setF({ ...f, audioStyle: v as FormState["audioStyle"] })}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="instrumental" id="style-instrumental" />
                    <Label htmlFor="style-instrumental" className="text-sm font-normal cursor-pointer">{L.instrumental}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="vocal" id="style-vocal" />
                    <Label htmlFor="style-vocal" className="text-sm font-normal cursor-pointer">{L.vocal}</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold inline-flex items-center gap-1">
                  {L.explicitStatus} <InfoTip text={L.explicitStatusTip} />
                </Label>
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
                    <Label htmlFor="exp-clean" className="text-sm font-normal cursor-pointer">{L.nonExplicit}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="explicit" id="exp-explicit" />
                    <Label htmlFor="exp-explicit" className="text-sm font-normal cursor-pointer">{L.explicit}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="censored" id="exp-censored" />
                    <Label htmlFor="exp-censored" className="text-sm font-normal cursor-pointer">{L.censored}</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            {/* Vocal Language + Lyrics — shown only when audioStyle is "vocal" */}
            {f.audioStyle === "vocal" && (
              <div className="space-y-5 pt-1">
                <p className="text-sm text-muted-foreground">
                  {L.lyricsEncourage}
                </p>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">{L.vocalLanguage}</Label>
                  <div className="w-72">
                    <DictionaryCombobox
                      value={f.vocalLanguage || ""}
                      onChange={(v) => setF({ ...f, vocalLanguage: v })}
                      options={langOpts.options}
                      placeholder={L.selectLanguageA}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold">{L.lyrics}</Label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!f.audioUrl || isTranscribing}
                      onClick={async () => {
                        if (!f.audioUrl || isTranscribing) return;
                        setIsTranscribing(true);
                        try {
                          const res = await fetch(`/api/tracks/${trackId}/transcribe-lyrics`, {
                            method: "POST",
                            credentials: "include",
                          });
                          const data = await res.json() as { text?: string; error?: string };
                          if (!res.ok) {
                            toast({
                              title: L.transcribeErrorTitle,
                              description: data.error ?? L.transcribeUnknownError,
                              variant: "destructive",
                            });
                            return;
                          }
                          setF((prev) => ({ ...prev!, lyrics: data.text ?? "" }));
                          toast({ title: L.transcribeDoneTitle, description: L.transcribeDoneDesc });
                        } catch {
                          toast({ title: L.errorToast, description: L.transcribeServerErrorDesc, variant: "destructive" });
                        } finally {
                          setIsTranscribing(false);
                        }
                      }}
                    >
                      {isTranscribing
                        ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        : <Wand2 className="h-4 w-4 mr-1.5" />}
                      {isTranscribing ? L.transcribing : L.transcribeLyrics}
                    </Button>
                    {!f.audioUrl && (
                      <p className="text-sm text-red-400">
                        {L.transcribeNeedAudio}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {L.lyricsHintPart1}{" "}
                    <a href="https://help.apple.com/itc/musicstyleguide/" target="_blank" rel="noopener noreferrer" className="text-primary underline">{L.lyricsHintLink1}</a>.{" "}
                    {L.lyricsHintPart2}{" "}
                    <a href="https://support.apple.com/en-us/101564" target="_blank" rel="noopener noreferrer" className="text-primary underline">{L.lyricsHintLink2}</a>.{" "}
                    {L.lyricsHintPart3}
                  </p>
                  <Textarea
                    value={f.lyrics}
                    onChange={(e) => setF({ ...f, lyrics: e.target.value })}
                    rows={10}
                    className="font-mono text-sm bg-background/40 resize-y"
                    placeholder={L.lyricsPlaceholder}
                  />
                </div>
              </div>
            )}
            </div>
            </CardContent>
          </Card>

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setLocation(`/releases/${releaseId}`)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              {L.back}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={save} disabled={isBusy}>
                {isBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                {L.save}
              </Button>
              {nextTrack && (
                <Button onClick={saveAndGoNext} disabled={isBusy}>
                  {isBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                  {L.saveAndNext}
                </Button>
              )}
            </div>
          </div>

        </div>
      </div>

    </Layout>
  );
}
