import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListArtists, useListLabels, useCreateRelease, useCreateArtist, useUpdateReleaseArtists,
  getListReleasesQueryKey, getGetReleaseCountsQueryKey, getListArtistsQueryKey,
  type ReleaseArtistRef,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { HelpCircle, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GENRES, SUBGENRES, LANGS } from "@/components/release-wizard/types";
import { CoverUploader } from "@/components/asset-uploader";
import { MultiArtistPicker } from "@/components/release-wizard/multi-artist-picker";

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
  const [cLineYear, setCLineYear]       = useState<number | "">(CURRENT_YEAR);
  const [cLine, setCLine]               = useState("");
  const [pLineYear, setPLineYear]       = useState<number | "">(CURRENT_YEAR);
  const [pLine, setPLine]               = useState("");
  const [isCompilation, setIsCompilation] = useState<boolean | null>(null);
  const [addArtistDialogOpen, setAddArtistDialogOpen] = useState(false);
  const [quickArtistName, setQuickArtistName] = useState("");
  const createArtistMut = useCreateArtist();

  const subgenresFor = genre ? (SUBGENRES[genre] ?? []) : [];
  useEffect(() => { if (subgenre && !subgenresFor.includes(subgenre)) setSubgenre(""); }, [genre]);

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

  useEffect(() => {
    if (!user) return;
    if (user.role === "label" && user.labelId && !labelId) setLabelId(user.labelId);
  }, [user]);

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
      const created = await createArtistMut.mutateAsync({
        data: {
          name,
          labelId: user?.role === "label" ? (user.labelId ?? null) : null,
          status: "active",
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
      setQuickArtistName("");
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

          {/* ── Cover Art ────────────────────────────────────────────────── */}
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm transition-all hover:border-border/80 hover:shadow-md hover:shadow-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg inline-flex items-center gap-1.5">
                {L.coverArt}
                <InfoTip text={L.coverArtTip} />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
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
            </CardContent>
          </Card>

          {/* ── Release Details ──────────────────────────────────────────── */}
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm transition-all hover:border-border/80 hover:shadow-md hover:shadow-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{L.releaseDetails}</CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-6">
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
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
                  <Select value={tr.language} onValueChange={v => updateTranslation(i, { language: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {LANGS.filter(l => l.value !== language).map(l => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
            </CardContent>
          </Card>

          {/* ── Primary Artists ──────────────────────────────────────────── */}
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm transition-all hover:border-border/80 hover:shadow-md hover:shadow-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg inline-flex items-center gap-1.5">
                {L.primaryArtists}
                <InfoTip text={L.primaryArtistsTip} />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-3">
              <MultiArtistPicker
                value={pickerArtists}
                onChange={setReleaseArtists}
                labelId={user?.role === "label" ? user.labelId : null}
                lockedArtistId={user?.role === "artist" ? user.artistId : null}
              />
              {(user?.role === "admin" || user?.role === "manager" || user?.role === "label") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setAddArtistDialogOpen(true)}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                  {L.addNewArtist}
                </Button>
              )}
              <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                <Checkbox checked={isVariousArtists} onCheckedChange={v => setIsVariousArtists(!!v)} />
                <span>
                  {L.variousArtists}
                  <span className="block text-[11px] text-muted-foreground">{L.variousArtistsHint}</span>
                </span>
              </label>
            </CardContent>
          </Card>

          {/* ── Metadata & Rights ────────────────────────────────────────── */}
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm transition-all hover:border-border/80 hover:shadow-md hover:shadow-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{L.metadataRights}</CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-6">
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
              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger><SelectValue placeholder={L.pleaseSelect} /></SelectTrigger>
                <SelectContent>
                  {GENRES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">{L.subgenres}</FieldLabel>
              <Select value={subgenre} onValueChange={setSubgenre} disabled={subgenresFor.length === 0}>
                <SelectTrigger><SelectValue placeholder={L.pleaseSelect} /></SelectTrigger>
                <SelectContent>
                  {subgenresFor.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Label / CLine / PLine ────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">{L.labelName}</FieldLabel>
              <Select
                value={labelId ? String(labelId) : "none"}
                onValueChange={v => setLabelId(v === "none" ? null : Number(v))}
                disabled={user?.role === "label"}
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
                value=""
                readOnly
                placeholder={L.autoAssigned}
                className="bg-muted/20 cursor-not-allowed text-muted-foreground font-mono"
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
            </CardContent>
          </Card>

        </div>
      </div>

      {/* ── Sticky bottom bar ────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur border-t border-border/50 px-6 py-3 flex items-center justify-between">
        <Button variant="outline" onClick={() => setLocation("/releases")}>
          {L.cancel}
        </Button>
        <Button onClick={handleCreate} disabled={!canCreate} data-testid="button-create-release">
          {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {L.save}
        </Button>
      </div>

      {/* ── Quick Create Artist dialog (Symphonic-style) ─────────────────── */}
      <Dialog
        open={addArtistDialogOpen}
        onOpenChange={(o) => { setAddArtistDialogOpen(o); if (!o) setQuickArtistName(""); }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{L.createArtist}</DialogTitle>
            <DialogDescription>
              {L.createArtistDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              value={quickArtistName}
              onChange={e => setQuickArtistName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && quickArtistName.trim()) handleQuickCreateArtist(); }}
              placeholder={L.artistNamePlaceholder}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddArtistDialogOpen(false)}>
              {L.cancel}
            </Button>
            <Button
              onClick={handleQuickCreateArtist}
              disabled={!quickArtistName.trim() || createArtistMut.isPending}
            >
              {createArtistMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {L.createArtist}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
    </TooltipProvider>
  );
}
