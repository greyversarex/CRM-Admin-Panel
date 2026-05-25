import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListArtists, useListLabels, useCreateRelease,
  getListReleasesQueryKey, getGetReleaseCountsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Barcode, CheckCircle2, AlertCircle, Loader2, ChevronRight, ChevronLeft,
  Disc3, Music2, Layers, FolderArchive, Plus, Trash2,
} from "lucide-react";
import { RELEASE_TYPES, GENRES, SUBGENRES, LANGS } from "@/components/release-wizard/types";
import { CoverUploader } from "@/components/asset-uploader";

type UpcChoice = "have" | "need" | null;
type Step = "upc" | "details";

type UpcCheckResult =
  | { available: true }
  | { available: false; reason: string; conflictRelease?: { id: number; title: string; status: string } };

const RELEASE_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  single: Music2, album: Disc3, ep: Layers, compilation: FolderArchive,
};
const RELEASE_TYPE_HINTS: Record<string, string> = {
  single: "1–3 трека, не более 30 минут общей длительности.",
  album: "От 6 треков или 30+ минут общей длительности.",
  ep: "4–6 треков или до 30 минут общей длительности.",
  compilation: "Сборник треков нескольких исполнителей.",
};

async function checkUpcAvailability(upc: string): Promise<UpcCheckResult> {
  const r = await fetch(`/api/releases/check-upc?upc=${encodeURIComponent(upc)}`, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const CURRENT_YEAR = new Date().getFullYear();

type Translation = { language: string; title: string; version?: string };

export default function CreateRelease() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>("upc");

  // ── Step 1: Release Type + UPC ───────────────────────────────────────────
  const [releaseType, setReleaseType] = useState<"single" | "album" | "ep" | "compilation">("single");
  const [upcChoice, setUpcChoice] = useState<UpcChoice>(null);
  const [upc, setUpc] = useState("");
  const [upcCheckLoading, setUpcCheckLoading] = useState(false);
  const [upcCheck, setUpcCheck] = useState<UpcCheckResult | null>(null);
  useEffect(() => { setUpcCheck(null); }, [upc]);

  async function handleCheckUpc() {
    const clean = upc.trim();
    if (!/^\d{8,14}$/.test(clean)) {
      setUpcCheck({ available: false, reason: "UPC должен содержать 8–14 цифр." });
      return;
    }
    setUpcCheckLoading(true);
    try {
      setUpcCheck(await checkUpcAvailability(clean));
    } catch (e: any) {
      setUpcCheck({ available: false, reason: `Ошибка проверки: ${e?.message ?? "сеть"}` });
    } finally {
      setUpcCheckLoading(false);
    }
  }

  const canGoDetails =
    upcChoice === "need" ||
    (upcChoice === "have" && upcCheck && upcCheck.available);

  // ── Step 2: Release Details (Symphonic 1:1) ──────────────────────────────
  const [coverUrl, setCoverUrl]     = useState<string>("");
  const [coverAiUsage, setCoverAiUsage] = useState<"" | "none" | "some" | "all">("");
  const [title, setTitle]           = useState("");
  const [releaseVersion, setReleaseVersion] = useState("");
  const [language, setLanguage]     = useState("Tajik");
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [artistId, setArtistId]     = useState<number | null>(null);
  const [isVariousArtists, setIsVariousArtists] = useState(false);
  const [labelId, setLabelId]       = useState<number | null>(null);
  const [genre, setGenre]           = useState<string>("");
  const [subgenre, setSubgenre]     = useState<string>("");
  const [cLineYear, setCLineYear]   = useState<number | "">(CURRENT_YEAR);
  const [cLine, setCLine]           = useState("");
  const [pLineYear, setPLineYear]   = useState<number | "">(CURRENT_YEAR);
  const [pLine, setPLine]           = useState("");
  const [isCompilation, setIsCompilation] = useState<boolean | null>(null);

  const subgenresFor = genre ? (SUBGENRES[genre] ?? []) : [];
  useEffect(() => { if (subgenre && !subgenresFor.includes(subgenre)) setSubgenre(""); }, [genre, subgenre, subgenresFor]);

  const { data: artistsData } = useListArtists({ limit: 200, page: 1 } as never);
  const artists = useMemo(() => artistsData?.data ?? [], [artistsData]);
  const { data: labelsData } = useListLabels({ limit: 200, page: 1 } as never);
  const labels = useMemo(() => labelsData?.data ?? [], [labelsData]);

  // Авто-подставляем «свой» артист/лейбл из сессии.
  useEffect(() => {
    if (!user) return;
    if (user.role === "artist" && user.artistId && !artistId) setArtistId(user.artistId);
    if (user.role === "label" && user.labelId && !labelId) setLabelId(user.labelId);
  }, [user, artistId, labelId]);

  const artistOptions = useMemo(() => {
    if (!user) return artists;
    if (user.role === "artist") return artists.filter(a => a.id === user.artistId);
    if (user.role === "label") return artists.filter(a => a.labelId === user.labelId);
    return artists;
  }, [artists, user]);

  // Двусторонняя синхронизация releaseType ↔ isCompilation, чтобы не уходил
  // противоречивый payload (например, type=compilation + isCompilation=false).
  useEffect(() => {
    if (releaseType === "compilation" && isCompilation !== true) setIsCompilation(true);
    if (releaseType !== "compilation" && isCompilation === true) setIsCompilation(false);
  }, [releaseType, isCompilation]);

  const createMut = useCreateRelease({
    mutation: {
      onSuccess: async (rel: any) => {
        await Promise.all([
          qc.invalidateQueries({ queryKey: getListReleasesQueryKey() }),
          qc.invalidateQueries({ queryKey: getGetReleaseCountsQueryKey() }),
        ]);
        toast({ title: "Черновик создан", description: `Релиз «${rel.title}» открыт для редактирования.` });
        setLocation(`/releases/${rel.id}`);
      },
      onError: (e: any) => {
        toast({
          title: "Не удалось создать релиз",
          description: e?.response?.data?.error ?? e?.message ?? "Неизвестная ошибка",
          variant: "destructive",
        });
      },
    },
  } as never);

  const canCreate =
    title.trim().length >= 1 &&
    artistId != null &&
    coverAiUsage !== "" &&
    !!genre &&
    isCompilation !== null &&
    !createMut.isPending;

  function addTranslation() {
    setTranslations((prev) => [...prev, { language: "", title: "", version: "" }]);
  }
  function updateTranslation(idx: number, patch: Partial<Translation>) {
    setTranslations((prev) => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));
  }
  function removeTranslation(idx: number) {
    setTranslations((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate() {
    if (!artistId) return;
    // Чистим пустые переводы (без языка или названия не сохраняем).
    const cleanedTranslations = translations
      .filter((t) => t.language.trim() && t.title.trim())
      .map((t) => ({
        language: t.language.trim(),
        title: t.title.trim(),
        version: t.version?.trim() || null,
      }));

    const body: any = {
      title: title.trim(),
      releaseType,
      artistId,
      labelId: labelId ?? undefined,
      releaseVersion: releaseVersion.trim() || undefined,
      coverUrl: coverUrl || undefined,
      coverAiUsage: coverAiUsage || undefined,
      language: language || undefined,
      genre: genre || undefined,
      subgenre: subgenre || undefined,
      cLine: cLine.trim() || undefined,
      cLineYear: cLineYear === "" ? undefined : Number(cLineYear),
      pLine: pLine.trim() || undefined,
      pLineYear: pLineYear === "" ? undefined : Number(pLineYear),
      isCompilation: isCompilation === true,
      isVariousArtists,
      metadataTranslations: cleanedTranslations,
    };
    if (upcChoice === "have") {
      body.upc = upc.trim();
      body.upcRequestPending = false;
    } else if (upcChoice === "need") {
      body.upcRequestPending = true;
    }
    createMut.mutate({ data: body });
  }

  return (
    <Layout>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border/50 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/releases")} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Назад
          </Button>
          <div className="h-4 w-px bg-border/60" />
          <h1 className="text-sm font-semibold">Новый релиз</h1>
        </div>

        {/* Step pills */}
        <div className="flex items-center gap-2 text-xs">
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-colors ${
            step === "upc" ? "bg-primary text-primary-foreground" : "bg-emerald-500/15 text-emerald-400"
          }`}>
            {step !== "upc" && <CheckCircle2 className="h-3 w-3" />}
            1 · UPC
          </span>
          <div className="w-6 h-px bg-border" />
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-colors ${
            step === "details" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}>
            2 · Детали
          </span>
        </div>

        <div className="w-24" />
      </div>

      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">

        {/* ─── STEP 1: UPC Gate ─────────────────────────────────────────── */}
        {step === "upc" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Есть ли у вас UPC?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                UPC — это 12–13-значный штрихкод релиза. Если релиз уже выходил — введите его. Иначе мы присвоим автоматически.
              </p>
            </div>

            <RadioGroup
              value={upcChoice ?? ""}
              onValueChange={(v) => { setUpcChoice(v as UpcChoice); setUpcCheck(null); }}
              className="space-y-3"
            >
              {[
                {
                  value: "have",
                  title: "У меня есть UPC",
                  hint: "Подходит, если релиз уже выходил у других дистрибьюторов или физически. Мы проверим, что код не занят.",
                  testid: "upc-choice-have",
                },
                {
                  value: "need",
                  title: "Мне нужен UPC",
                  hint: "Мы присвоим UPC автоматически при отправке на модерацию. Бесплатно.",
                  testid: "upc-choice-need",
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  data-testid={opt.testid}
                  className={`flex items-start gap-4 rounded-xl border p-5 cursor-pointer transition-all ${
                    upcChoice === opt.value
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/60 hover:border-border hover:bg-muted/20"
                  }`}
                >
                  <RadioGroupItem value={opt.value} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-sm">{opt.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>

            {upcChoice === "have" && (
              <div className="rounded-xl border border-border/60 bg-muted/10 p-5 space-y-3">
                <FieldLabel htmlFor="upc" className="text-sm font-medium">UPC код</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="upc" data-testid="input-upc"
                    placeholder="Например, 5901234123457"
                    value={upc}
                    onChange={(e) => setUpc(e.target.value.replace(/[^\d]/g, "").slice(0, 14))}
                    className="font-mono"
                  />
                  <Button onClick={handleCheckUpc} disabled={!upc.trim() || upcCheckLoading} data-testid="button-check-upc">
                    {upcCheckLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Проверить"}
                  </Button>
                </div>
                {upcCheck?.available && (
                  <Alert className="border-emerald-500/40 bg-emerald-500/10">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <AlertDescription className="text-emerald-400">UPC свободен и может быть использован.</AlertDescription>
                  </Alert>
                )}
                {upcCheck && !upcCheck.available && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {upcCheck.reason}
                      {upcCheck.conflictRelease && (
                        <span className="ml-2 text-xs opacity-80">
                          Конфликт: «{upcCheck.conflictRelease.title}»{" "}
                          <Badge variant="outline" className="ml-1">{upcCheck.conflictRelease.status}</Badge>
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep("details")} disabled={!canGoDetails} data-testid="button-upc-next" size="lg" className="px-8">
                Далее <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Release Details ──────────────────────────────────── */}
        {step === "details" && (
          <div className="space-y-8">
            <div>
              <h2 className="text-xl font-semibold">Детали релиза</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Заполните метаданные по стандартам Apple Music / Spotify. После создания вы сможете загрузить треки.
              </p>
            </div>

            {/* ─── Release Type tiles ─────────────────────────────────── */}
            <section className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Тип релиза</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {RELEASE_TYPES.map((rt) => {
                  const Icon = RELEASE_TYPE_ICONS[rt.value] ?? Music2;
                  const active = releaseType === rt.value;
                  return (
                    <button
                      key={rt.value}
                      type="button"
                      onClick={() => setReleaseType(rt.value)}
                      data-testid={`release-type-${rt.value}`}
                      className={`text-left rounded-xl border p-4 transition-all hover:shadow-sm ${
                        active
                          ? "border-primary bg-primary/8 shadow-md shadow-primary/10"
                          : "border-border/60 hover:border-border hover:bg-muted/20"
                      }`}
                    >
                      <Icon className={`h-5 w-5 mb-3 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      <div className={`font-semibold text-sm ${active ? "text-primary" : ""}`}>{rt.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{RELEASE_TYPE_HINTS[rt.value]}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="h-px bg-border/40" />

            {/* ─── Cover Art ──────────────────────────────────────────── */}
            <section className="space-y-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Обложка</div>
              <div className="flex gap-6 items-start">
                <CoverUploader value={coverUrl || null} onChange={(p) => setCoverUrl(p ?? "")} attach={false} />
                <div className="flex-1 space-y-3">
                  <div>
                    <FieldLabel className="text-sm font-medium">
                      Использовался ли AI при создании обложки? <span className="text-rose-400">*</span>
                    </FieldLabel>
                    <p className="text-xs text-muted-foreground mt-1">
                      Обязательное поле — требование Apple Music и Spotify.
                    </p>
                  </div>
                  <RadioGroup value={coverAiUsage} onValueChange={(v) => setCoverAiUsage(v as any)} className="space-y-2">
                    {[
                      { value: "none", label: "Нет — создано без AI" },
                      { value: "some", label: "Частично — AI помог в создании" },
                      { value: "all",  label: "Полностью создано с помощью AI" },
                    ].map((opt) => (
                      <label key={opt.value} className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer text-sm transition-all ${
                        coverAiUsage === opt.value ? "border-primary bg-primary/5" : "border-border/50 hover:border-border hover:bg-muted/15"
                      }`}>
                        <RadioGroupItem value={opt.value} />
                        {opt.label}
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              </div>
            </section>

            <div className="h-px bg-border/40" />

            {/* ─── Title / Version / Language ─────────────────────────── */}
            <section className="space-y-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Название и язык</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="title" className="text-sm">Название релиза <span className="text-rose-400">*</span></FieldLabel>
                  <Input id="title" data-testid="input-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Без featuring и (Remix)" />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="version" className="text-sm">Версия</FieldLabel>
                  <Input id="version" data-testid="input-version" value={releaseVersion} onChange={(e) => setReleaseVersion(e.target.value)} placeholder="Deluxe, Remastered, Live…" />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel className="text-sm">Язык метаданных <span className="text-rose-400">*</span></FieldLabel>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {/* Translations */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Переводы метаданных (необязательно)</span>
                  <Button type="button" variant="outline" size="sm" onClick={addTranslation}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Добавить перевод
                  </Button>
                </div>
                {translations.map((t, i) => (
                  <div key={i} className="grid grid-cols-[140px_1fr_180px_auto] gap-2 items-end bg-muted/15 border border-border/40 rounded-lg p-3">
                    <div className="space-y-1">
                      <FieldLabel className="text-[10px] text-muted-foreground">Язык</FieldLabel>
                      <Select value={t.language} onValueChange={(v) => updateTranslation(i, { language: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{LANGS.filter((l) => l.value !== language).map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <FieldLabel className="text-[10px] text-muted-foreground">Название</FieldLabel>
                      <Input className="h-8 text-xs" value={t.title} onChange={(e) => updateTranslation(i, { title: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <FieldLabel className="text-[10px] text-muted-foreground">Версия</FieldLabel>
                      <Input className="h-8 text-xs" value={t.version ?? ""} onChange={(e) => updateTranslation(i, { version: e.target.value })} placeholder="(необязательно)" />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTranslation(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>

            <div className="h-px bg-border/40" />

            {/* ─── Primary Artist ─────────────────────────────────────── */}
            <section className="space-y-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Исполнитель</div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <FieldLabel className="text-sm">Основной исполнитель <span className="text-rose-400">*</span></FieldLabel>
                  <Select value={artistId ? String(artistId) : ""} onValueChange={(v) => setArtistId(Number(v))}>
                    <SelectTrigger data-testid="select-artist"><SelectValue placeholder="Выберите артиста" /></SelectTrigger>
                    <SelectContent>{artistOptions.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {artistOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">В каталоге нет артистов. Добавьте артиста в разделе «Артисты».</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Дополнительных артистов (featuring, remixer и т.д.) добавите внутри релиза после создания.
                  </p>
                </div>
                <label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border border-border/50 p-3 hover:bg-muted/15 transition-colors">
                  <Checkbox checked={isVariousArtists} onCheckedChange={(v) => setIsVariousArtists(!!v)} className="mt-0.5" />
                  <span>
                    Various Artists
                    <span className="block text-[11px] text-muted-foreground">Отметьте, если релиз содержит 5+ разных артистов.</span>
                  </span>
                </label>
              </div>
            </section>

            <div className="h-px bg-border/40" />

            {/* ─── Genre / Subgenre / UPC ──────────────────────────────── */}
            <section className="space-y-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Жанр и штрихкод</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <FieldLabel className="text-sm">Жанр <span className="text-rose-400">*</span></FieldLabel>
                  <Select value={genre} onValueChange={setGenre}>
                    <SelectTrigger><SelectValue placeholder="Выберите жанр" /></SelectTrigger>
                    <SelectContent>{GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel className="text-sm">Сабжанр</FieldLabel>
                  <Select value={subgenre} onValueChange={setSubgenre} disabled={subgenresFor.length === 0}>
                    <SelectTrigger><SelectValue placeholder={subgenresFor.length === 0 ? "—" : "Выберите"} /></SelectTrigger>
                    <SelectContent>{subgenresFor.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel className="text-sm">UPC</FieldLabel>
                  {upcChoice === "have"
                    ? <Input value={upc} readOnly className="font-mono bg-muted/30 cursor-not-allowed" />
                    : <Input value="" readOnly placeholder="Будет присвоен автоматически" className="bg-muted/30 cursor-not-allowed text-muted-foreground" />
                  }
                </div>
              </div>
            </section>

            <div className="h-px bg-border/40" />

            {/* ─── Label / P-Line / C-Line ─────────────────────────────── */}
            <section className="space-y-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Лейбл и права</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <FieldLabel className="text-sm">Лейбл</FieldLabel>
                  <Select value={labelId ? String(labelId) : "none"} onValueChange={(v) => setLabelId(v === "none" ? null : Number(v))} disabled={user?.role === "label"}>
                    <SelectTrigger data-testid="select-label"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без лейбла</SelectItem>
                      {labels.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel className="text-sm">℗ Правообладатель записи</FieldLabel>
                  <div className="flex gap-2">
                    <Input type="number" min={1900} max={2100} className="w-20 shrink-0" value={pLineYear} onChange={(e) => setPLineYear(e.target.value ? Number(e.target.value) : "")} />
                    <Input value={pLine} onChange={(e) => setPLine(e.target.value)} placeholder="Tajik Music" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel className="text-sm">© Правообладатель композиции</FieldLabel>
                  <div className="flex gap-2">
                    <Input type="number" min={1900} max={2100} className="w-20 shrink-0" value={cLineYear} onChange={(e) => setCLineYear(e.target.value ? Number(e.target.value) : "")} />
                    <Input value={cLine} onChange={(e) => setCLine(e.target.value)} placeholder="Tajik Music" />
                  </div>
                </div>
              </div>
            </section>

            <div className="h-px bg-border/40" />

            {/* ─── Compilation ────────────────────────────────────────── */}
            <section className="space-y-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Сборник</div>
              <RadioGroup
                value={isCompilation === null ? "" : isCompilation ? "yes" : "no"}
                onValueChange={(v) => setIsCompilation(v === "yes")}
                className="grid grid-cols-2 gap-3"
              >
                {[
                  { value: "no",  label: "Нет",  hint: "Обычный релиз одного или нескольких артистов" },
                  { value: "yes", label: "Да",   hint: "Сборник треков нескольких разных артистов" },
                ].map((opt) => (
                  <label key={opt.value} className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer text-sm transition-all ${
                    (isCompilation === null ? "" : isCompilation ? "yes" : "no") === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border/50 hover:border-border hover:bg-muted/15"
                  }`}>
                    <RadioGroupItem value={opt.value} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="font-medium">{opt.label}</span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </section>

            {/* ─── Bottom action bar ──────────────────────────────────── */}
            <div className="sticky bottom-0 -mx-4 px-6 py-4 bg-background/95 backdrop-blur border-t border-border/50 flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep("upc")} data-testid="button-back-upc">
                <ChevronLeft className="h-4 w-4 mr-1" /> Назад
              </Button>
              <Button onClick={handleCreate} disabled={!canCreate} data-testid="button-create-release" size="lg" className="px-8">
                {createMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Сохранить черновик
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
