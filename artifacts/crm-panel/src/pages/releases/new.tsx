import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListArtists, useListLabels, useCreateRelease, useCreateArtist, useUpdateReleaseArtists,
  useSearchArtistDspProfiles,
  getListReleasesQueryKey, getGetReleaseCountsQueryKey, getListArtistsQueryKey,
  type ReleaseArtistRef, type DspArtistCandidate,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, ChevronsUpDown, HelpCircle, Loader2, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SUBGENRES, subgenreOptionsFor, genreOptionsWith, LANGS } from "@/components/release-wizard/types";
import { useCatalogOptions } from "@/components/release-wizard/use-catalog";
import { DictionaryCombobox } from "@/components/release-wizard/dictionary-combobox";
import { CoverUploader } from "@/components/asset-uploader";

const CURRENT_YEAR = new Date().getFullYear();

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          className="inline-flex items-center justify-center h-4 w-4 rounded-full text-muted-foreground hover:text-foreground shrink-0 focus:outline-none"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
type Translation = { language: string; title: string; version?: string };

const RELEASE_TYPE_VALUES = ["single", "album", "ep", "compilation"] as const;

export default function CreateRelease() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { t } = useLang();
  const L = t.createRelease;

  const [releaseType, setReleaseType] = useState<"single" | "album" | "ep" | "compilation">("single");
  const [coverUrl, setCoverUrl]         = useState("");
  const [coverAiUsage, setCoverAiUsage] = useState<"" | "none" | "some" | "all">("");
  const [title, setTitle]               = useState("");
  const [releaseVersion, setReleaseVersion] = useState("");
  const [language, setLanguage]         = useState("Tajik");
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [releaseArtists, setReleaseArtists] = useState<ReleaseArtistRef[]>([]);
  const [isVariousArtists, setIsVariousArtists] = useState(false);
  const [labelId, setLabelId]           = useState<number | null>(null);
  const [genre, setGenre]               = useState("");
  const [subgenre, setSubgenre]         = useState("");
  const [catalogNumber, setCatalogNumber] = useState("");
  const [cLineYear, setCLineYear]       = useState<number | "">(CURRENT_YEAR);
  const [cLine, setCLine]               = useState("");
  const [pLineYear, setPLineYear]       = useState<number | "">(CURRENT_YEAR);
  const [pLine, setPLine]               = useState("");
  const [isCompilation, setIsCompilation] = useState<boolean | null>(null);
  const [artistOpen, setArtistOpen] = useState(false);
  const [artistSearch, setArtistSearch] = useState("");
  const [addArtistDialogOpen, setAddArtistDialogOpen] = useState(false);
  const [quickArtistName, setQuickArtistName] = useState("");
  const createArtistMut = useCreateArtist();

  // ── DSP identity mapping (как у Broma16): поиск профилей артиста на
  //    площадках по имени и выбор конкретного профиля (или «не найден»). ──
  const [dspQuery, setDspQuery] = useState("");
  const [spotifySel, setSpotifySel] = useState<string>("none");
  const [appleSel, setAppleSel] = useState<string>("none");
  const [deezerSel, setDeezerSel] = useState<string>("none");
  useEffect(() => {
    const id = setTimeout(() => setDspQuery(quickArtistName.trim()), 450);
    return () => clearTimeout(id);
  }, [quickArtistName]);
  // Сбрасываем выбор при смене запроса — старые кандидаты уже неактуальны.
  useEffect(() => { setSpotifySel("none"); setAppleSel("none"); setDeezerSel("none"); }, [dspQuery]);
  const dspSearch = useSearchArtistDspProfiles(
    { name: dspQuery },
    { query: { enabled: addArtistDialogOpen && dspQuery.length >= 2, staleTime: 60_000 } as any },
  );

  // ── Шаг 2 диалога (как у Broma16): идентификаторы + ID на других площадках ──
  const [quickStep, setQuickStep] = useState<1 | 2>(1);
  const [quickIpi, setQuickIpi] = useState("");
  const [quickIpn, setQuickIpn] = useState("");
  const [quickIsni, setQuickIsni] = useState("");
  const [quickOutlets, setQuickOutlets] = useState<Array<{ outletId: number; outletName: string; idOutletUser: string }>>([]);
  const outletOptionsQ = useQuery({
    queryKey: ["broma16-outlet-options"],
    enabled: addArtistDialogOpen,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch("/api/artists/meta/outlets", { credentials: "include" });
      if (!r.ok) throw new Error("outlets load failed");
      return r.json() as Promise<{ items: Array<{ externalId: string; name: string }> }>;
    },
  });
  const outletOptions = outletOptionsQ.data?.items ?? [];
  function resetQuickDialog() {
    setQuickArtistName(""); setDspQuery(""); setSpotifySel("none"); setAppleSel("none"); setDeezerSel("none");
    setQuickStep(1); setQuickIpi(""); setQuickIpn(""); setQuickIsni(""); setQuickOutlets([]); setOutletUrl("");
  }

  // ── Вставка ссылки на профиль (VK / Яндекс / Звук / YouTube и др.) ──
  // Официальных API у VK/Яндекс/Звук нет, поэтому ID берём из вставленного URL
  // и кладём в общий список outlets (Broma16 доставит на все площадки).
  const [outletUrl, setOutletUrl] = useState("");
  function parseArtistUrl(raw: string): { outletId: number; outletName: string; idOutletUser: string } | null {
    let u: URL;
    try { u = new URL(raw.trim()); } catch { return null; }
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname;
    // Каждое правило: как узнать площадку по хосту, как вытащить ID из пути,
    // и как найти соответствующий outlet в словаре Broma16 по названию.
    const rules: Array<{ host: RegExp; id: RegExp; dict: RegExp }> = [
      { host: /(^|\.)music\.yandex\./, id: /\/artist\/(\d+)/,                 dict: /yandex/i },
      { host: /(^|\.)vk\.(com|ru)$/,   id: /\/artist\/([^/?#]+)/,             dict: /vk music/i },
      { host: /(^|\.)zvuk\.com$/,      id: /\/artist\/(\d+)/,                 dict: /^zvuk/i },
      { host: /(^|\.)youtube\.com$/,   id: /\/(?:channel\/(UC[\w-]+)|(@[\w.-]+))/, dict: /^youtube(?!.*content)/i },
      { host: /(^|\.)open\.spotify\.com$/, id: /\/artist\/([A-Za-z0-9]+)/,    dict: /^spotify/i },
      { host: /(^|\.)deezer\.com$/,    id: /\/artist\/(\d+)/,                 dict: /^deezer/i },
      { host: /(^|\.)music\.apple\.com$/, id: /\/artist\/(?:[^/]+\/)?(\d+)/,  dict: /apple music/i },
    ];
    for (const rule of rules) {
      if (!rule.host.test(host)) continue;
      const m = path.match(rule.id);
      const id = m?.[1] ?? m?.[2];
      if (!id) return null;
      const opt = outletOptions.find((o) => rule.dict.test(o.name));
      if (!opt) return null;
      return { outletId: Number(opt.externalId), outletName: opt.name, idOutletUser: id };
    }
    return null;
  }
  function handleAddOutletFromUrl() {
    const parsed = parseArtistUrl(outletUrl);
    if (!parsed) {
      toast({ title: L.dspUrlParseFailed, variant: "destructive" });
      return;
    }
    setQuickOutlets((p) => {
      // Не плодим дубликаты одной площадки — заменяем ID.
      const i = p.findIndex((r) => r.outletId === parsed.outletId);
      if (i >= 0) return p.map((r, idx) => idx === i ? parsed : r);
      return [...p, parsed];
    });
    setOutletUrl("");
  }

  // Справочники Broma16 (жанр ≈280, язык ≈186); при недоступности — курируемый фолбэк.
  const langOpts = useCatalogOptions("language", { valueKey: "code", fallback: LANGS.map((l) => ({ value: l.value, label: l.label })) });

  const { data: artistsData } = useListArtists({ limit: 200, page: 1 } as never);
  const artists = useMemo(() => artistsData?.data ?? [], [artistsData]);
  const { data: labelsData } = useListLabels({ limit: 200, page: 1 } as never);
  const labels = useMemo(() => labelsData?.data ?? [], [labelsData]);

  const artistOptions = useMemo(() => {
    if (!user) return artists;
    if (user.role === "artist") return artists.filter(a => a.id === user.artistId);
    if (user.role === "label") return artists.filter(a => a.labelId === user.labelId);
    return artists;
  }, [artists, user]);

  // Для роли "label" — автоматически выставляем их лейбл
  useEffect(() => {
    if (!user) return;
    if (user.role === "label" && user.labelId && !labelId) {
      setLabelId(user.labelId);
    }
  }, [user]);

  // Автозаполнение C Line / P Line именем лейбла при выборе или авто-установке
  useEffect(() => {
    if (!labelId || !labels.length) return;
    const found = labels.find(l => l.id === labelId);
    if (found) {
      setCLine(found.name);
      setPLine(found.name);
    }
  }, [labelId, labels]);

  // Инициализируем список артистов для роли artist (ждём загрузки artistOptions)
  useEffect(() => {
    if (!user || user.role !== "artist" || !user.artistId) return;
    if (releaseArtists.length > 0) return; // уже инициализировано
    const myArtist = artistOptions.find(a => a.id === user.artistId);
    if (myArtist) {
      setReleaseArtists([{ artistId: myArtist.id, name: myArtist.name, role: "primary", position: 0 }]);
    }
  }, [user, artistOptions]);

  useEffect(() => {
    if (releaseType === "compilation" && isCompilation !== true) setIsCompilation(true);
    if (releaseType !== "compilation" && isCompilation === true) setIsCompilation(false);
  }, [releaseType]);

  const updateArtistsMut = useUpdateReleaseArtists();

  // Для роли artist: pickerArtists fallback к user.artistId пока список пуст
  const pickerArtists = useMemo<ReleaseArtistRef[]>(() => {
    if (releaseArtists.length > 0) return releaseArtists;
    if (user?.role === "artist" && user.artistId) {
      const a = artistOptions.find(x => x.id === user.artistId);
      if (a) return [{ artistId: a.id, name: a.name, role: "primary", position: 0 }];
    }
    return releaseArtists;
  }, [releaseArtists, user, artistOptions]);

  const primaryArtistId = pickerArtists.find(a => a.role === "primary")?.artistId ?? null;

  const createMut = useCreateRelease({} as never);

  const canCreate =
    title.trim().length >= 1 &&
    primaryArtistId != null &&
    coverAiUsage !== "" &&
    !!genre &&
    isCompilation !== null &&
    !createMut.isPending;

  function addTranslation() {
    setTranslations(p => [...p, { language: "", title: "", version: "" }]);
  }
  function updateTranslation(idx: number, patch: Partial<Translation>) {
    setTranslations(p => p.map((tr, i) => i === idx ? { ...tr, ...patch } : tr));
  }
  function removeTranslation(idx: number) {
    setTranslations(p => p.filter((_, i) => i !== idx));
  }

  async function handleQuickCreateArtist() {
    const name = quickArtistName.trim();
    if (!name) return;
    try {
      // Выбранные профили на площадках (если «не найден» — null, площадка создаст новый).
      const spotifyPick = spotifySel !== "none" ? spotifySel : null;
      const applePick = appleSel !== "none" ? appleSel : null;
      const deezerPick = deezerSel !== "none" ? deezerSel : null;
      const spotifyCand = dspSearch.data?.spotify.results.find((c) => c.id === spotifyPick);
      // Deezer нет среди legacy-колонок — кладём его в общий список outlets
      // (Broma16 сам доставит), если словарь площадок доступен.
      // Финальный дедуп по outletId (последнее значение выигрывает) — ручные
      // строки тоже могут задублировать одну площадку.
      const outletMap = new Map<number, { outletId: number; outletName: string; idOutletUser: string }>();
      for (const o of quickOutlets) outletMap.set(o.outletId, o);
      const outlets = [...outletMap.values()];
      if (deezerPick) {
        const deezerOpt = outletOptions.find((o) => /^deezer/i.test(o.name));
        if (deezerOpt && !outlets.some((o) => o.outletId === Number(deezerOpt.externalId))) {
          outlets.push({ outletId: Number(deezerOpt.externalId), outletName: deezerOpt.name, idOutletUser: deezerPick });
        }
      }
      const created = await createArtistMut.mutateAsync({
        data: {
          name,
          labelId: user?.role === "label" ? (user.labelId ?? null) : null,
          status: "active",
          spotifyId: spotifyPick,
          appleId: applePick,
          // Аватар из Spotify-профиля — приятный бонус для карточки артиста.
          imageUrl: spotifyCand?.imageUrl ?? null,
          ipiNameNumber: quickIpi.trim() || null,
          ipn: quickIpn.trim() || null,
          isni: quickIsni.trim() || null,
          broma16Outlets: outlets
            .filter((o) => o.outletId > 0 && o.idOutletUser.trim() !== "")
            .map((o) => ({ outletId: o.outletId, outletName: o.outletName, idOutletUser: o.idOutletUser.trim() })),
        },
      });
      await qc.invalidateQueries({ queryKey: getListArtistsQueryKey() });
      // Добавляем нового артиста в список: primary если список пуст, иначе featuring
      setReleaseArtists(prev => {
        const hasPrimary = prev.some(a => a.role === "primary");
        return [...prev, {
          artistId: created.id,
          name: created.name,
          role: hasPrimary ? "featuring" : "primary",
          position: prev.length,
        }];
      });
      setAddArtistDialogOpen(false);
      resetQuickDialog();
      toast({ title: L.artistCreatedTitle, description: L.artistCreatedDesc.replace("{name}", created.name) });
    } catch (e) {
      toast({ title: L.artistCreateFailedTitle, description: (e as Error).message, variant: "destructive" });
    }
  }

  async function handleCreate() {
    if (!primaryArtistId) return;
    const cleanedTranslations = translations
      .filter(tr => tr.language.trim() && tr.title.trim())
      .map(tr => ({ language: tr.language.trim(), title: tr.title.trim(), version: tr.version?.trim() || null }));

    try {
      const rel = await createMut.mutateAsync({
        data: {
          title: title.trim(),
          releaseType,
          artistId: primaryArtistId,
          labelId: labelId ?? undefined,
          releaseVersion: releaseVersion.trim() || undefined,
          coverUrl: coverUrl || undefined,
          coverAiUsage: coverAiUsage || undefined,
          language: language || undefined,
          genre: genre || undefined,
          subgenre: subgenre || undefined,
          catalogNumber: catalogNumber.trim() || undefined,
          cLine: cLine.trim() || undefined,
          cLineYear: cLineYear === "" ? undefined : Number(cLineYear),
          pLine: pLine.trim() || undefined,
          pLineYear: pLineYear === "" ? undefined : Number(pLineYear),
          isCompilation: isCompilation === true,
          isVariousArtists,
          upcRequestPending: true,
          metadataTranslations: cleanedTranslations,
        },
      } as never) as any;

      // Если выбрано несколько артистов — сохраняем их
      if (pickerArtists.length > 1) {
        await updateArtistsMut.mutateAsync({
          id: rel.id,
          data: { artists: pickerArtists.map(a => ({ artistId: a.artistId, role: a.role })) },
        } as never);
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: getListReleasesQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetReleaseCountsQueryKey() }),
      ]);
      toast({ title: L.draftCreatedTitle, description: L.draftCreatedDesc.replace("{title}", rel.title) });
      setLocation(`/releases/${rel.id}`);
    } catch (e: any) {
      toast({
        title: L.createFailedTitle,
        description: e?.response?.data?.error ?? e?.message ?? L.unknownError,
        variant: "destructive",
      });
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
    <Layout>
      <div className="max-w-7xl mx-auto py-8 px-4 pb-24">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold">{L.title}</h1>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {L.subtitle}
          </p>
        </div>

        <div className="space-y-6">

          {/* Единый блок: Cover Art + Release Details + Primary Artists + Metadata & Rights */}
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
            <CardContent className="p-6 space-y-8">

            {/* ── Cover Art ────────────────────────────────────────────────── */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold inline-flex items-center gap-1.5">
                {L.coverArt}
                <InfoTip text={L.coverArtTip} />
              </h2>
            <div className="flex gap-6 items-start">
              <div className="shrink-0 w-52">
                <CoverUploader value={coverUrl || null} onChange={p => setCoverUrl(p ?? "")} attach={false} />
              </div>
              <div className="flex-1 pt-1">
                <div className="flex items-center gap-1.5 mb-3">
                  <p className="text-sm font-medium">
                    {L.aiQuestion}
                  </p>
                  <InfoTip text={L.aiTip} />
                </div>
                <RadioGroup
                  value={coverAiUsage}
                  onValueChange={v => setCoverAiUsage(v as any)}
                  className="flex gap-6"
                >
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <RadioGroupItem value="none" /> {L.aiNone}
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <RadioGroupItem value="some" /> {L.aiSome}
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <RadioGroupItem value="all" /> {L.aiAll}
                  </label>
                </RadioGroup>
              </div>
            </div>
            </section>

            <Separator className="bg-border/50" />

            {/* ── Release Details ──────────────────────────────────────────── */}
            <section className="space-y-6">
              <h2 className="text-lg font-semibold">{L.releaseDetails}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="title" className="text-sm">{L.releaseTitle}</FieldLabel>
              <Input
                id="title"
                data-testid="input-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder=""
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <FieldLabel htmlFor="version" className="text-sm">{L.releaseVersion} <span className="text-muted-foreground font-normal">{L.optional}</span></FieldLabel>
                <InfoTip text={L.versionTip} />
              </div>
              <Input
                id="version"
                data-testid="input-version"
                value={releaseVersion}
                onChange={e => setReleaseVersion(e.target.value)}
                placeholder=""
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">{L.metadataLanguage}</FieldLabel>
              <DictionaryCombobox
                value={language}
                onChange={setLanguage}
                options={langOpts.options}
                placeholder={L.pleaseSelect}
              />
            </div>
          </div>

          {/* ── Translations ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addTranslation}>
                <Plus className="h-3.5 w-3.5 mr-1" /> {L.addTranslation} <span className="text-muted-foreground font-normal ml-0.5">{L.optional}</span>
              </Button>
              <InfoTip text={L.translationTip} />
            </div>
            {translations.map((tr, i) => (
              <div key={i} className="grid grid-cols-[140px_1fr_160px_32px] gap-2 items-end bg-muted/10 border border-border/40 rounded-lg p-3">
                <div className="space-y-1">
                  <FieldLabel className="text-sm text-muted-foreground">{L.langLabel}</FieldLabel>
                  <DictionaryCombobox
                    value={tr.language}
                    onChange={v => updateTranslation(i, { language: v })}
                    options={langOpts.options.filter(l => l.value !== language)}
                    placeholder="—"
                    className="h-9 text-sm bg-background/40"
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel className="text-sm text-muted-foreground">{L.titleLabel}</FieldLabel>
                  <Input className="h-9 text-sm" value={tr.title} onChange={e => updateTranslation(i, { title: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <FieldLabel className="text-sm text-muted-foreground">{L.versionLabel}</FieldLabel>
                  <Input className="h-9 text-sm" value={tr.version ?? ""} onChange={e => updateTranslation(i, { version: e.target.value })} placeholder={L.optionalPlaceholder} />
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 self-end" onClick={() => removeTranslation(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
            </section>

            <Separator className="bg-border/50" />

            {/* ── Primary Artists ──────────────────────────────────────────── */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold inline-flex items-center gap-1.5">
                {L.primaryArtists}
                <InfoTip text={L.primaryArtistsTip} />
              </h2>
              <Popover open={isVariousArtists ? false : artistOpen} onOpenChange={v => { if (!isVariousArtists) setArtistOpen(v); }}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={artistOpen}
                    data-testid="select-artist"
                    disabled={isVariousArtists}
                    className="w-full justify-between font-normal min-h-9 h-auto px-3 py-1.5"
                  >
                    {pickerArtists.length > 0 ? (
                      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                        {pickerArtists.map(a => {
                          const chipLocked = user?.role === "artist" && a.artistId === user?.artistId;
                          return (
                            <span
                              key={a.artistId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-primary/15 text-primary border border-primary/25"
                            >
                              {a.name}
                              {a.role === "primary" && (
                                <span className="text-[9px] opacity-60 font-normal">primary</span>
                              )}
                              {!chipLocked && (
                                <span
                                  role="button"
                                  tabIndex={-1}
                                  aria-label={`Убрать ${a.name}`}
                                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setReleaseArtists(prev =>
                                      prev.filter(r => r.artistId !== a.artistId)
                                        .map((r, i) => ({ ...r, position: i }))
                                    );
                                  }}
                                  className="ml-0.5 -mr-0.5 rounded-sm p-0.5 hover:bg-primary/25 cursor-pointer"
                                >
                                  <X className="h-3 w-3" />
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-foreground/40">{L.selectArtist}</span>
                    )}
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="p-0 w-[var(--radix-popover-trigger-width)]"
                  align="start"
                  sideOffset={4}
                >
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder={L.searchArtist}
                      value={artistSearch}
                      onValueChange={setArtistSearch}
                    />
                    <CommandList className="max-h-[210px]">
                      <CommandEmpty className="py-4 text-sm text-center text-muted-foreground">
                        {L.noArtistsFound}
                      </CommandEmpty>
                      <CommandGroup>
                        {artistOptions
                          .filter(a => a.name.toLowerCase().includes(artistSearch.toLowerCase()))
                          .map(a => {
                            const isSelected = pickerArtists.some(r => r.artistId === a.id);
                            const isLocked = user?.role === "artist" && a.id === user.artistId;
                            return (
                              <CommandItem
                                key={a.id}
                                value={String(a.id)}
                                onSelect={() => {
                                  if (isLocked) return;
                                  if (isSelected) {
                                    // убираем артиста
                                    setReleaseArtists(prev =>
                                      prev.filter(r => r.artistId !== a.id)
                                        .map((r, i) => ({ ...r, position: i }))
                                    );
                                  } else {
                                    // добавляем артиста
                                    setReleaseArtists(prev => {
                                      const hasPrimary = prev.some(r => r.role === "primary");
                                      return [...prev, {
                                        artistId: a.id,
                                        name: a.name,
                                        role: hasPrimary ? "featuring" : "primary",
                                        position: prev.length,
                                      }];
                                    });
                                  }
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                                <span className="flex-1">{a.name}</span>
                                {isLocked && <span className="text-[10px] text-muted-foreground ml-2">Primary</span>}
                              </CommandItem>
                            );
                          })}
                      </CommandGroup>
                    </CommandList>
                    {(user?.role === "admin" || user?.role === "manager" || user?.role === "label") && (
                      <>
                        <CommandSeparator />
                        <div className="p-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-primary hover:text-primary"
                            onClick={() => {
                              setArtistOpen(false);
                              setAddArtistDialogOpen(true);
                            }}
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            {L.addNewArtist}
                          </Button>
                        </div>
                      </>
                    )}
                  </Command>
                </PopoverContent>
              </Popover>
              {artistOptions.length === 0 && (
                <p className="text-sm text-muted-foreground">{L.noArtistsHint}</p>
              )}
              <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                <Checkbox
                  checked={isVariousArtists}
                  onCheckedChange={(v) => {
                    const on = !!v;
                    setIsVariousArtists(on);
                    if (on) {
                      setReleaseArtists((prev) =>
                        user?.role === "artist" && user.artistId
                          ? prev.filter((a) => a.artistId === user.artistId)
                          : []
                      );
                    }
                  }}
                />
                <span>
                  {L.variousArtists}
                  <span className="block text-[11px] text-muted-foreground">{L.variousArtistsHint}</span>
                </span>
              </label>
            </section>

            <Separator className="bg-border/50" />

            {/* ── Metadata & Rights ────────────────────────────────────────── */}
            <section className="space-y-6">
              <h2 className="text-lg font-semibold">{L.metadataRights}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">{L.upc}</FieldLabel>
              <Input
                value=""
                readOnly
                placeholder={L.assignedOnSubmission}
                className="bg-muted/20 cursor-not-allowed text-muted-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">{L.genre}</FieldLabel>
              <DictionaryCombobox
                value={genre}
                onChange={(v) => { setGenre(v); if (!(SUBGENRES[v] ?? []).includes(subgenre)) setSubgenre(""); }}
                options={genreOptionsWith(genre)}
                placeholder={L.pleaseSelect}
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">{L.subgenres}</FieldLabel>
              <DictionaryCombobox
                value={subgenre}
                onChange={setSubgenre}
                options={subgenreOptionsFor(genre, subgenre)}
                placeholder={L.pleaseSelect}
              />
            </div>
          </div>

          {/* ── Label / CLine / PLine ────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">{L.labelName}</FieldLabel>
              <Select
                value={labelId ? String(labelId) : "none"}
                onValueChange={v => setLabelId(v === "none" ? null : Number(v))}
              >
                <SelectTrigger data-testid="select-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{L.pleaseSelect}</SelectItem>
                  {labels.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">{L.cLine}</FieldLabel>
              <div className="flex gap-2">
                <Select
                  value={String(cLineYear || CURRENT_YEAR)}
                  onValueChange={v => setCLineYear(Number(v))}
                >
                  <SelectTrigger className="w-24 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 30 }, (_, i) => CURRENT_YEAR - i).map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={cLine} onChange={e => setCLine(e.target.value)} placeholder={L.cLinePlaceholder} />
              </div>
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">{L.pLine}</FieldLabel>
              <div className="flex gap-2">
                <Select
                  value={String(pLineYear || CURRENT_YEAR)}
                  onValueChange={v => setPLineYear(Number(v))}
                >
                  <SelectTrigger className="w-24 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 30 }, (_, i) => CURRENT_YEAR - i).map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={pLine} onChange={e => setPLine(e.target.value)} placeholder={L.pLinePlaceholder} />
              </div>
            </div>
          </div>

          {/* ── Catalog# / Release Type / Compilation ────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">{L.catalogNumber}</FieldLabel>
              <Input
                value={catalogNumber}
                disabled
                readOnly
                placeholder={L.autoAssigned}
                className="bg-background/40 font-mono"
              />
              <p className="text-[11px] text-muted-foreground">{L.catalogHint}</p>
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">{L.releaseType}</FieldLabel>
              <Select value={releaseType} onValueChange={v => setReleaseType(v as any)}>
                <SelectTrigger data-testid="select-release-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELEASE_TYPE_VALUES.map(rt => (
                    <SelectItem key={rt} value={rt}>{L.releaseTypes[rt]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <FieldLabel className="text-sm">{L.compilation}</FieldLabel>
                <InfoTip text={L.compilationTip} />
              </div>
              <div className="space-y-1.5 pt-0.5">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                  <Checkbox
                    checked={isCompilation === true}
                    onCheckedChange={v => setIsCompilation(v ? true : false)}
                  />
                  {L.compilationYes}
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                  <Checkbox
                    checked={isCompilation === false}
                    onCheckedChange={v => setIsCompilation(v ? false : null)}
                  />
                  {L.compilationNo}
                </label>
              </div>
            </div>
          </div>
            </section>
            </CardContent>
          </Card>

          {/* ── Actions ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-2 pb-6">
            <Button variant="outline" style={{ height: 36, boxShadow: "none" }} onClick={() => setLocation("/releases")}>
              {L.cancel}
            </Button>
            <Button style={{ height: 36, boxShadow: "none" }} onClick={handleCreate} disabled={!canCreate} data-testid="button-create-release">
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {L.save}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Quick Create Artist: боковая панель как у Broma16 ────────────── */}
      <Sheet
        open={addArtistDialogOpen}
        onOpenChange={(o) => { setAddArtistDialogOpen(o); if (!o) resetQuickDialog(); }}
      >
        <SheetContent side="right" className="w-full sm:max-w-[440px] flex flex-col overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{L.createArtist}</SheetTitle>
            <SheetDescription>
              {L.createArtistDesc}
            </SheetDescription>
          </SheetHeader>
          {quickStep === 1 && (
          <div className="py-2 space-y-3">
            <Input
              autoFocus
              value={quickArtistName}
              onChange={e => setQuickArtistName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && quickArtistName.trim()) setQuickStep(2); }}
              placeholder={L.artistNamePlaceholder}
            />

            {/* ── Профили на площадках (identity mapping как у Broma16) ── */}
            {dspQuery.length >= 2 && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground leading-snug">{L.dspHint}</p>
                <Tabs defaultValue="spotify">
                  <TabsList className="grid w-full grid-cols-3 h-8">
                    <TabsTrigger value="spotify" className="text-xs">Spotify</TabsTrigger>
                    <TabsTrigger value="apple" className="text-xs">Apple Music</TabsTrigger>
                    <TabsTrigger value="deezer" className="text-xs">Deezer</TabsTrigger>
                  </TabsList>
                  {dspSearch.isLoading ? (
                    <div className="flex items-center gap-2 py-4 justify-center text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> {L.dspSearching}
                    </div>
                  ) : (
                    <>
                      <TabsContent value="spotify" className="mt-2">
                        <DspCandidateList
                          platform="Spotify"
                          result={dspSearch.data?.spotify}
                          selected={spotifySel}
                          onSelect={setSpotifySel}
                          L={L}
                        />
                      </TabsContent>
                      <TabsContent value="apple" className="mt-2">
                        <DspCandidateList
                          platform="Apple Music"
                          result={dspSearch.data?.apple}
                          selected={appleSel}
                          onSelect={setAppleSel}
                          L={L}
                        />
                      </TabsContent>
                      <TabsContent value="deezer" className="mt-2">
                        <DspCandidateList
                          platform="Deezer"
                          result={dspSearch.data?.deezer}
                          selected={deezerSel}
                          onSelect={setDeezerSel}
                          L={L}
                        />
                      </TabsContent>
                    </>
                  )}
                </Tabs>
              </div>
            )}
          </div>
          )}

          {/* ── Шаг 2: идентификаторы + ID на других площадках (как у Broma16) ── */}
          {quickStep === 2 && (
          <div className="py-2 space-y-4 flex-1">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{L.dspIdentifiers}</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1">
                  <FieldLabel className="text-xs">IPI</FieldLabel>
                  <Input value={quickIpi} onChange={(e) => setQuickIpi(e.target.value)} placeholder="IPI" />
                </div>
                <div className="grid gap-1">
                  <FieldLabel className="text-xs">IPN</FieldLabel>
                  <Input value={quickIpn} onChange={(e) => setQuickIpn(e.target.value)} placeholder="IPN" />
                </div>
                <div className="grid gap-1">
                  <FieldLabel className="text-xs">ISNI</FieldLabel>
                  <Input value={quickIsni} onChange={(e) => setQuickIsni(e.target.value)} placeholder="ISNI" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{L.dspOutletsTitle}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">{L.dspOutletsHint}</p>

              {/* Вставка ссылки на профиль — ID достаём из URL автоматически */}
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={outletUrl}
                  onChange={(e) => setOutletUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && outletUrl.trim()) { e.preventDefault(); handleAddOutletFromUrl(); } }}
                  placeholder={L.dspUrlPastePh}
                  disabled={outletOptions.length === 0}
                />
                <Button
                  type="button" variant="secondary" size="sm" className="shrink-0"
                  disabled={!outletUrl.trim() || outletOptions.length === 0}
                  onClick={handleAddOutletFromUrl}
                >
                  {L.dspUrlAdd}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{L.dspUrlPasteHint}</p>

              {quickOutlets.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    value={row.outletId ? String(row.outletId) : ""}
                    onValueChange={(v) => {
                      const opt = outletOptions.find((o) => o.externalId === v);
                      setQuickOutlets((p) => p.map((r, i) => i === idx ? { ...r, outletId: Number(v), outletName: opt?.name ?? "" } : r));
                    }}
                  >
                    <SelectTrigger className="w-[190px] shrink-0">
                      <SelectValue placeholder={L.dspOutletPick} />
                    </SelectTrigger>
                    <SelectContent>
                      {outletOptions.map((o) => (
                        <SelectItem key={o.externalId} value={o.externalId}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    value={row.idOutletUser}
                    onChange={(e) => setQuickOutlets((p) => p.map((r, i) => i === idx ? { ...r, idOutletUser: e.target.value } : r))}
                    placeholder={L.dspOutletIdPh}
                  />
                  <Button
                    type="button" variant="ghost" size="icon" className="shrink-0"
                    onClick={() => setQuickOutlets((p) => p.filter((_, i) => i !== idx))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button" variant="outline" size="sm" className="w-fit"
                disabled={outletOptions.length === 0}
                onClick={() => setQuickOutlets((p) => [...p, { outletId: 0, outletName: "", idOutletUser: "" }])}
              >
                {L.dspAddOutlet}
              </Button>
              {outletOptionsQ.isError && (
                <p className="text-xs text-destructive">{L.dspOutletsLoadError}</p>
              )}
              {!outletOptionsQ.isError && !outletOptionsQ.isLoading && outletOptions.length === 0 && (
                <p className="text-[11px] text-amber-500 leading-snug">{L.dspOutletsEmpty}</p>
              )}
            </div>
          </div>
          )}

          <SheetFooter className="mt-auto pt-4">
            {quickStep === 1 ? (
              <>
                <Button variant="outline" onClick={() => setAddArtistDialogOpen(false)}>
                  {L.cancel}
                </Button>
                <Button onClick={() => setQuickStep(2)} disabled={!quickArtistName.trim()}>
                  {L.dspNext}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setQuickStep(1)} disabled={createArtistMut.isPending}>
                  {L.dspBack}
                </Button>
                <Button
                  onClick={handleQuickCreateArtist}
                  disabled={!quickArtistName.trim() || createArtistMut.isPending}
                >
                  {createArtistMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {L.createArtist}
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Layout>
    </TooltipProvider>
  );
}

// ─── Список кандидатов профиля артиста на площадке ──────────────────────────
// Radio-выбор в стиле Broma16: «не найден» + карточки (аватар, подписчики,
// ссылка на профиль). Для Apple iTunes API не отдаёт фото — рисуем инициал.
function DspCandidateList({
  platform,
  result,
  selected,
  onSelect,
  L,
}: {
  platform: string;
  result: { status: "ok" | "not_configured" | "error"; results: DspArtistCandidate[] } | undefined;
  selected: string;
  onSelect: (v: string) => void;
  L: any;
}) {
  if (result?.status === "not_configured") {
    return <p className="text-xs text-muted-foreground py-3 text-center">{L.dspNotConfigured}</p>;
  }
  if (result?.status === "error") {
    return <p className="text-xs text-destructive py-3 text-center">{L.dspSearchError}</p>;
  }
  return (
    <RadioGroup value={selected} onValueChange={onSelect} className="gap-1.5 max-h-64 overflow-y-auto pr-1">
      <label className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2 cursor-pointer text-sm hover:border-border">
        <span>{L.dspNotFoundOn.replace("{platform}", platform)}</span>
        <RadioGroupItem value="none" />
      </label>
      {(result?.results ?? []).map((c) => (
        <label
          key={c.id}
          className="flex items-center gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2 cursor-pointer hover:border-border"
        >
          {c.imageUrl ? (
            <img src={c.imageUrl} alt={c.name} className="h-10 w-10 rounded object-cover shrink-0" />
          ) : (
            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-sm font-semibold shrink-0">
              {c.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{c.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {c.followers != null && <>{L.dspFollowers.replace("{n}", c.followers.toLocaleString())}{c.genre ? " · " : ""}</>}
              {c.genre ?? ""}
            </p>
            {c.url && (
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] text-primary hover:underline"
              >
                {L.dspGoTo.replace("{platform}", platform)} ↗
              </a>
            )}
          </div>
          <RadioGroupItem value={c.id} />
        </label>
      ))}
    </RadioGroup>
  );
}
