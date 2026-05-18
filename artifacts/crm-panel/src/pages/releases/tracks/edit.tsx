// Полная страница редактирования трека — Symphonic-style.
// Маршрут: /releases/:releaseId/tracks/:tid
// 5 секций: Audio Details, Spatial Audio ($24.99), Track Details,
// Display Artists, Contributors (Writers/Performers/Production).
// Сохранение через PUT /api/tracks/:id (useUpdateTrack).
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import {
  useGetTrack,
  useUpdateTrack,
  useGetRelease,
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Save, Music2, Headphones, FileAudio, Users, UserPlus,
  AlertTriangle, Plus, Trash2, Languages, Loader2,
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

// Локальное состояние формы — узкий subset Track для PUT /tracks/:id.
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
  // ВАЖНО: пустые строки шлём как null, чтобы Drizzle не писал "" в обязательные
  // unique-поля (ISRC и пр.) — иначе ловим conflict.
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
    // null (а не undefined) — чтобы можно было ОЧИСТИТЬ ранее сохранённое значение.
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
// Spatial-загрузка отличается от обычной AudioUploader: файл крупный (Atmos),
// принимаем wav/flac/m4a; используем тот же presign + confirm pipeline.
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
          <div className="flex-1 min-w-0 text-xs font-mono text-muted-foreground truncate">
            {value}
          </div>
          <Button type="button" variant="outline" size="sm" disabled={isUploading}
            onClick={() => inputRef.current?.click()}>
            Заменить
          </Button>
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

// ─── Metadata translations mini-editor ──────────────────────────────────
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
          Нет переводов. Добавьте, если название трека звучит на другом языке (например, оригинал на таджикском, английская транслитерация для DSP).
        </div>
      )}
      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center">
          <Input
            placeholder="Код языка (en, ru, tg…)"
            value={row.language}
            onChange={(e) => update(i, { language: e.target.value })}
            className="col-span-3 bg-background/40 text-xs"
          />
          <Input
            placeholder="Название на этом языке"
            value={row.title}
            onChange={(e) => update(i, { title: e.target.value })}
            className="col-span-6 bg-background/40 text-xs"
          />
          <Input
            placeholder="Версия (опц.)"
            value={row.version ?? ""}
            onChange={(e) => update(i, { version: e.target.value })}
            className="col-span-2 bg-background/40 text-xs"
          />
          <Button
            variant="ghost" size="sm" className="text-rose-300 col-span-1"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline" size="sm" className="w-full border-dashed"
        onClick={() => onChange([...value, { language: "", title: "", version: null }])}
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Добавить перевод
      </Button>
    </div>
  );
}

// ─── Section card wrapper ───────────────────────────────────────────────
function Section({
  icon: Icon, title, hint, children,
}: { icon: any; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Icon className="h-4 w-4" /> {title}
        </CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
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
  const updateTrack = useUpdateTrack();

  const [f, setF] = useState<FormState | null>(null);
  // Подгружаем форму один раз когда трек получен.
  useEffect(() => {
    if (track) setF(trackToForm(track));
  }, [track?.id, track?.updatedAt]);

  const subgenreOptions = useMemo(
    () => (f?.genre ? SUBGENRES[f.genre] ?? [] : []),
    [f?.genre],
  );

  const save = async () => {
    if (!f || !track) return;
    if (!f.title.trim()) {
      toast({ title: "Название трека обязательно", variant: "destructive" });
      return;
    }
    try {
      // artistId/releaseId намеренно не шлём — бэкенд их не разрешает менять
      // обычным ролям, а у нас цель — лишь обновить метаданные.
      await updateTrack.mutateAsync({
        id: track.id,
        data: { ...formToBody(f), artistId: track.artistId },
      });
      toast({ title: "Сохранено", description: `Трек «${f.title}» обновлён.` });
      void refetch();
    } catch (e: any) {
      toast({
        title: "Не удалось сохранить",
        description: e?.message ?? "Ошибка",
        variant: "destructive",
      });
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

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1 min-w-0">
            <Link href={`/releases/${releaseId}`}>
              <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> К релизу
              </Button>
            </Link>
            <h1 className="text-2xl font-semibold truncate">{f.title || "Без названия"}</h1>
            <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span>Трек #{f.trackNumber ?? "—"}</span>
              <span>·</span>
              <span>Артист: {track.artistName}</span>
              {release?.title && (<><span>·</span><span>Релиз: {release.title}</span></>)}
              {f.isrc && (<><span>·</span><span className="font-mono">{f.isrc}</span></>)}
            </div>
          </div>
          <div className="flex items-center gap-2 sticky top-2">
            <Button
              variant="outline"
              onClick={() => setLocation(`/releases/${releaseId}`)}
              disabled={updateTrack.isPending}
            >
              Отмена
            </Button>
            <Button onClick={save} disabled={updateTrack.isPending}>
              {updateTrack.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Сохраняю…</>
              ) : (
                <><Save className="h-4 w-4 mr-1.5" /> Сохранить</>
              )}
            </Button>
          </div>
        </div>

        {/* 1. Audio Details */}
        <Section
          icon={FileAudio}
          title="Аудио (стерео) и базовые сведения"
          hint="Это основной мастер-файл, который пойдёт на все DSP."
        >
          <AudioUploader
            value={f.audioUrl}
            trackId={track.id}
            durationSeconds={f.durationSeconds}
            onChange={(path, dur) => setF({ ...f, audioUrl: path, durationSeconds: dur ?? f.durationSeconds })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">ISRC</Label>
              <Input
                value={f.isrc}
                onChange={(e) => setF({ ...f, isrc: e.target.value })}
                placeholder="USRC17607839"
                className="bg-background/40 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">Длительность</Label>
              <Input value={fmtDuration(f.durationSeconds)} readOnly className="bg-background/20 font-mono" />
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Вычисляется автоматически из аудио.
              </p>
            </div>
            <div>
              <Label className="text-xs">Год записи</Label>
              <Input
                type="number" min={1900} max={2100}
                value={f.recordingYear ?? ""}
                onChange={(e) => setF({ ...f, recordingYear: e.target.value ? Number(e.target.value) : null })}
                className="bg-background/40"
              />
            </div>
            <div>
              <Label className="text-xs">Страна записи</Label>
              <Select
                value={f.countryOfRecording || "none"}
                onValueChange={(v) => setF({ ...f, countryOfRecording: v === "none" ? "" : v })}
              >
                <SelectTrigger className="bg-background/40"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Не указано</SelectItem>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Язык метаданных</Label>
              <Select
                value={f.language || "none"}
                onValueChange={(v) => setF({ ...f, language: v === "none" ? "" : v })}
              >
                <SelectTrigger className="bg-background/40"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Не указано</SelectItem>
                  {LANGS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Старт превью (сек)</Label>
              <Input
                type="number" min={0}
                value={f.clipStartSeconds}
                onChange={(e) => setF({ ...f, clipStartSeconds: Math.max(0, Number(e.target.value) || 0) })}
                className="bg-background/40"
              />
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                С какой секунды DSP проиграет 30-секундное превью.
              </p>
            </div>
          </div>
        </Section>

        {/* 2. Spatial Audio */}
        <Section
          icon={Headphones}
          title="Spatial Audio (Dolby Atmos)"
          hint="Дополнительная услуга, +$24.99 за трек. Apple Music показывает значок Dolby Atmos, если файл загружен."
        >
          {f.spatialAudioUrl ? (
            <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 flex items-center gap-2 text-xs">
              <Badge className="bg-violet-500/20 border-violet-500/40 text-violet-200">Dolby Atmos</Badge>
              <span className="text-muted-foreground">
                Биллинг: {track.spatialBillingStatus === "charged"
                  ? "оплачено"
                  : track.spatialBillingStatus === "pending"
                  ? "будет списано $24.99 при отправке релиза"
                  : track.spatialBillingStatus === "waived"
                  ? "освобождено"
                  : "не активно"}
              </span>
            </div>
          ) : (
            <div className="rounded-md border border-border/40 bg-background/40 p-3 text-xs text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
              Spatial-файл не загружен. Загрузка добавит $24.99 к счёту релиза.
            </div>
          )}
          <SpatialAudioUploader
            value={f.spatialAudioUrl}
            trackId={track.id}
            onChange={(path) => setF({ ...f, spatialAudioUrl: path })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Spatial ISRC</Label>
              <Input
                value={f.spatialIsrc}
                onChange={(e) => setF({ ...f, spatialIsrc: e.target.value })}
                placeholder="Отдельный ISRC для Atmos-версии"
                className="bg-background/40 font-mono"
              />
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Если оставить пустым — будет использоваться основной ISRC.
              </p>
            </div>
            <div>
              <Label className="text-xs">AI в spatial-версии</Label>
              <Select
                value={f.spatialAiUsage || "none"}
                onValueChange={(v) => setF({ ...f, spatialAiUsage: v as FormState["spatialAiUsage"] })}
              >
                <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без AI</SelectItem>
                  <SelectItem value="some">Частично</SelectItem>
                  <SelectItem value="all">Полностью AI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        {/* 3. Track Details */}
        <Section
          icon={Music2}
          title="Детали трека"
          hint="Эта метадата отправляется на все DSP — следите за орфографией."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Название *</Label>
              <Input
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
                className="bg-background/40"
              />
            </div>
            <div>
              <Label className="text-xs">Версия (Remix, Acoustic…)</Label>
              <Input
                value={f.trackVersion}
                onChange={(e) => setF({ ...f, trackVersion: e.target.value })}
                placeholder="например: Radio Edit"
                className="bg-background/40"
              />
            </div>
            <div>
              <Label className="text-xs">Жанр</Label>
              <Select
                value={f.genre || "none"}
                onValueChange={(v) => setF({ ...f, genre: v === "none" ? "" : v, subgenre: "" })}
              >
                <SelectTrigger className="bg-background/40"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Не указано</SelectItem>
                  {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Поджанр</Label>
              <Select
                value={f.subgenre || "none"}
                onValueChange={(v) => setF({ ...f, subgenre: v === "none" ? "" : v })}
                disabled={subgenreOptions.length === 0}
              >
                <SelectTrigger className="bg-background/40">
                  <SelectValue placeholder={subgenreOptions.length === 0 ? "Выберите жанр" : "—"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Не указано</SelectItem>
                  {subgenreOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Explicit-статус</Label>
              <Select
                value={f.explicitStatus}
                onValueChange={(v) => setF({
                  ...f,
                  explicitStatus: v as FormState["explicitStatus"],
                  isExplicit: v === "explicit",
                })}
              >
                <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="non_explicit">Чистая версия</SelectItem>
                  <SelectItem value="explicit">EXPLICIT</SelectItem>
                  <SelectItem value="censored">Цензурированная</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">AI в треке</Label>
              <Select
                value={f.aiUsage}
                onValueChange={(v) => setF({ ...f, aiUsage: v as FormState["aiUsage"] })}
              >
                <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без AI</SelectItem>
                  <SelectItem value="some">Частично (инструменты/беки)</SelectItem>
                  <SelectItem value="all">Полностью сгенерировано AI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Тип аудио</Label>
              <Select
                value={f.audioStyle}
                onValueChange={(v) => setF({ ...f, audioStyle: v as FormState["audioStyle"] })}
              >
                <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vocal">С вокалом</SelectItem>
                  <SelectItem value="instrumental">Инструментал</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {f.audioStyle === "vocal" && (
              <div>
                <Label className="text-xs">Язык вокала</Label>
                <Select
                  value={f.vocalLanguage || "none"}
                  onValueChange={(v) => setF({ ...f, vocalLanguage: v === "none" ? "" : v })}
                >
                  <SelectTrigger className="bg-background/40"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Не указано</SelectItem>
                    {LANGS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">ISWC (если есть)</Label>
              <Input
                value={f.iswc}
                onChange={(e) => setF({ ...f, iswc: e.target.value })}
                placeholder="T-123.456.789-0"
                className="bg-background/40 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">Номер трека на релизе</Label>
              <Input
                type="number" min={1}
                value={f.trackNumber ?? ""}
                onChange={(e) => setF({ ...f, trackNumber: e.target.value ? Number(e.target.value) : null })}
                className="bg-background/40"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Текст песни (опционально)</Label>
              {f.isExplicit && (
                <span className="text-[10px] text-amber-300">⚠ Содержит EXPLICIT — это нужно отметить и в DSP</span>
              )}
            </div>
            <Textarea
              value={f.lyrics}
              onChange={(e) => setF({ ...f, lyrics: e.target.value })}
              rows={6}
              placeholder="Если оставите пустым — DSP покажут трек без синхро-текста."
              className="bg-background/40 font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Languages className="h-3 w-3" /> Переводы названия трека
            </Label>
            <MetadataTranslationsEditor
              value={f.metadataTranslations}
              onChange={(v) => setF({ ...f, metadataTranslations: v })}
            />
          </div>
        </Section>

        {/* 4. Display Artists */}
        <Section
          icon={Users}
          title="Исполнители на DSP"
          hint="Эти имена будут показаны под названием трека (как у Symphonic)."
        >
          <DisplayArtistsEditor
            value={f.displayArtists}
            onChange={(v) => setF({ ...f, displayArtists: v })}
          />
        </Section>

        {/* 5. Contributors */}
        <Section
          icon={UserPlus}
          title="Авторы и участники"
          hint="Авторы (writers) обязательны для DSP. Доли должны в сумме давать 100 %."
        >
          <WritersEditor
            value={f.writers}
            onChange={(v) => setF({ ...f, writers: v })}
          />
          <PerformersEditor
            value={f.performers}
            onChange={(v) => setF({ ...f, performers: v })}
          />
          <ProductionEditor
            value={f.production}
            onChange={(v) => setF({ ...f, production: v })}
          />
        </Section>

        {/* Bottom save bar (дубликат для удобства) */}
        <div className="flex justify-end gap-2 py-4 border-t border-border/40">
          <Button variant="outline" onClick={() => setLocation(`/releases/${releaseId}`)}>
            Отмена
          </Button>
          <Button onClick={save} disabled={updateTrack.isPending}>
            {updateTrack.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Сохраняю…</>
            ) : (
              <><Save className="h-4 w-4 mr-1.5" /> Сохранить</>
            )}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
