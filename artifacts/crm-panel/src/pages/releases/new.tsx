import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListArtists, useListLabels, useCreateRelease, useCreateArtist,
  getListReleasesQueryKey, getGetReleaseCountsQueryKey, getListArtistsQueryKey,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
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
import { Check, ChevronsUpDown, HelpCircle, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GENRES, SUBGENRES, LANGS } from "@/components/release-wizard/types";
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

const RELEASE_TYPE_OPTIONS = [
  { value: "single",      label: "Single"      },
  { value: "album",       label: "Album"       },
  { value: "ep",          label: "EP"          },
  { value: "compilation", label: "Compilation" },
] as const;

export default function CreateRelease() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [releaseType, setReleaseType] = useState<"single" | "album" | "ep" | "compilation">("single");
  const [coverUrl, setCoverUrl]         = useState("");
  const [coverAiUsage, setCoverAiUsage] = useState<"" | "none" | "some" | "all">("");
  const [title, setTitle]               = useState("");
  const [releaseVersion, setReleaseVersion] = useState("");
  const [language, setLanguage]         = useState("Tajik");
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [artistId, setArtistId]         = useState<number | null>(null);
  const [isVariousArtists, setIsVariousArtists] = useState(false);
  const [labelId, setLabelId]           = useState<number | null>(null);
  const [genre, setGenre]               = useState("");
  const [subgenre, setSubgenre]         = useState("");
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

  const subgenresFor = genre ? (SUBGENRES[genre] ?? []) : [];
  useEffect(() => { if (subgenre && !subgenresFor.includes(subgenre)) setSubgenre(""); }, [genre]);

  const { data: artistsData } = useListArtists({ limit: 200, page: 1 } as never);
  const artists = useMemo(() => artistsData?.data ?? [], [artistsData]);
  const { data: labelsData } = useListLabels({ limit: 200, page: 1 } as never);
  const labels = useMemo(() => labelsData?.data ?? [], [labelsData]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "artist" && user.artistId && !artistId) setArtistId(user.artistId);
    if (user.role === "label" && user.labelId && !labelId) setLabelId(user.labelId);
  }, [user]);

  const artistOptions = useMemo(() => {
    if (!user) return artists;
    if (user.role === "artist") return artists.filter(a => a.id === user.artistId);
    if (user.role === "label") return artists.filter(a => a.labelId === user.labelId);
    return artists;
  }, [artists, user]);

  useEffect(() => {
    if (releaseType === "compilation" && isCompilation !== true) setIsCompilation(true);
    if (releaseType !== "compilation" && isCompilation === true) setIsCompilation(false);
  }, [releaseType]);

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
          description: (e as any)?.response?.data?.error ?? (e as any)?.message ?? "Неизвестная ошибка",
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
    setTranslations(p => [...p, { language: "", title: "", version: "" }]);
  }
  function updateTranslation(idx: number, patch: Partial<Translation>) {
    setTranslations(p => p.map((t, i) => i === idx ? { ...t, ...patch } : t));
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
      setArtistId(created.id);
      setAddArtistDialogOpen(false);
      setQuickArtistName("");
      toast({ title: "Artist created", description: `«${created.name}» added and selected` });
    } catch (e) {
      toast({ title: "Failed to create artist", description: (e as Error).message, variant: "destructive" });
    }
  }

  function handleCreate() {
    if (!artistId) return;
    const cleanedTranslations = translations
      .filter(t => t.language.trim() && t.title.trim())
      .map(t => ({ language: t.language.trim(), title: t.title.trim(), version: t.version?.trim() || null }));

    createMut.mutate({
      data: {
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
        upcRequestPending: true,
        metadataTranslations: cleanedTranslations,
      },
    });
  }

  return (
    <TooltipProvider delayDuration={200}>
    <Layout>
      <div className="max-w-5xl mx-auto py-8 px-4 pb-24">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Release details</h1>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            We follow strict guidelines as set forth by Apple Music, Spotify and more.
            Upload artwork, enter the title, choose the release type, and add your project artists.
          </p>
        </div>

        <div className="space-y-8">

          {/* ── Cover Art ────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <FieldLabel className="text-sm font-medium">Cover Art</FieldLabel>
              <InfoTip text="Recommended size: 3000×3000 px (1000×1000 minimum). Accepted formats: .JPG / .JPEG / .PNG. Once uploaded you will see a preview of your cover art." />
            </div>
            <div className="flex gap-6 items-start">
              <div className="shrink-0 w-52">
                <CoverUploader value={coverUrl || null} onChange={p => setCoverUrl(p ?? "")} attach={false} />
              </div>
              <div className="flex-1 pt-1">
                <div className="flex items-center gap-1.5 mb-3">
                  <p className="text-sm font-medium">
                    What amount of generative AI tools were used in the creation of this cover art?
                  </p>
                  <InfoTip text="Indicate how much AI was used to generate or significantly alter your cover art. DSPs require this disclosure." />
                </div>
                <RadioGroup
                  value={coverAiUsage}
                  onValueChange={v => setCoverAiUsage(v as any)}
                  className="flex gap-6"
                >
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <RadioGroupItem value="none" /> None
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <RadioGroupItem value="some" /> Some
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <RadioGroupItem value="all" /> All
                  </label>
                </RadioGroup>
              </div>
            </div>
          </div>

          {/* ── Release Title / Version / Language ───────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="title" className="text-sm">Release Title</FieldLabel>
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
                <FieldLabel htmlFor="version" className="text-sm">Release Version <span className="text-muted-foreground font-normal">(Optional)</span></FieldLabel>
                <InfoTip text="Use this field to indicate a specific version of the release, e.g. «Deluxe Edition», «Acoustic Version», «Radio Edit». Leave blank for the standard version." />
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
              <FieldLabel className="text-sm">Metadata Language</FieldLabel>
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
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Translation <span className="text-muted-foreground font-normal ml-0.5">(Optional)</span>
              </Button>
              <InfoTip text="Add the release title in another language (e.g. Russian, English). Helps DSPs display metadata correctly in different regions." />
            </div>
            {translations.map((t, i) => (
              <div key={i} className="grid grid-cols-[140px_1fr_160px_32px] gap-2 items-end bg-muted/10 border border-border/40 rounded-lg p-3">
                <div className="space-y-1">
                  <FieldLabel className="text-[10px] text-muted-foreground">Language</FieldLabel>
                  <Select value={t.language} onValueChange={v => updateTranslation(i, { language: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {LANGS.filter(l => l.value !== language).map(l => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <FieldLabel className="text-[10px] text-muted-foreground">Title</FieldLabel>
                  <Input className="h-8 text-xs" value={t.title} onChange={e => updateTranslation(i, { title: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <FieldLabel className="text-[10px] text-muted-foreground">Version</FieldLabel>
                  <Input className="h-8 text-xs" value={t.version ?? ""} onChange={e => updateTranslation(i, { version: e.target.value })} placeholder="(optional)" />
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 self-end" onClick={() => removeTranslation(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* ── Primary Artists ──────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <FieldLabel className="text-sm font-medium">Primary Artists</FieldLabel>
              <InfoTip text="The main performing artist(s) credited on this release. Select from your existing artists or create a new one. If there are 5 or more different artists, check «Various Artists»." />
            </div>
            <Popover open={artistOpen} onOpenChange={setArtistOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={artistOpen}
                  data-testid="select-artist"
                  className="w-full justify-between font-normal h-9 px-3"
                >
                  <span className={artistId ? "" : "text-foreground/40"}>
                    {artistId
                      ? (artistOptions.find(a => a.id === artistId)?.name ?? "Select artist")
                      : "Select artist"}
                  </span>
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
                    placeholder="Search artist..."
                    value={artistSearch}
                    onValueChange={setArtistSearch}
                  />
                  <CommandList className="max-h-[210px]">
                    <CommandEmpty className="py-4 text-sm text-center text-muted-foreground">
                      No artists found.
                    </CommandEmpty>
                    <CommandGroup>
                      {artistOptions
                        .filter(a => a.name.toLowerCase().includes(artistSearch.toLowerCase()))
                        .map(a => (
                          <CommandItem
                            key={a.id}
                            value={String(a.id)}
                            onSelect={() => {
                              setArtistId(a.id);
                              setArtistOpen(false);
                              setArtistSearch("");
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${artistId === a.id ? "opacity-100" : "opacity-0"}`} />
                            {a.name}
                          </CommandItem>
                        ))}
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
                          Add new artist
                        </Button>
                      </div>
                    </>
                  )}
                </Command>
              </PopoverContent>
            </Popover>
            {artistOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">No artists found. Add an artist in the Artists section first.</p>
            )}
            <label className="flex items-center gap-2.5 cursor-pointer text-sm">
              <Checkbox checked={isVariousArtists} onCheckedChange={v => setIsVariousArtists(!!v)} />
              <span>
                Various Artists
                <span className="block text-[11px] text-muted-foreground">Select if 5+ artists.</span>
              </span>
            </label>
          </div>

          {/* ── UPC / Genre / Subgenres ──────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">UPC</FieldLabel>
              <Input
                value=""
                readOnly
                placeholder="Assigned on submission"
                className="bg-muted/20 cursor-not-allowed text-muted-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">Genre</FieldLabel>
              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger><SelectValue placeholder="Please select" /></SelectTrigger>
                <SelectContent>
                  {GENRES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">Subgenres</FieldLabel>
              <Select value={subgenre} onValueChange={setSubgenre} disabled={subgenresFor.length === 0}>
                <SelectTrigger><SelectValue placeholder="Please select" /></SelectTrigger>
                <SelectContent>
                  {subgenresFor.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Label / CLine / PLine ────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">Label Name</FieldLabel>
              <Select
                value={labelId ? String(labelId) : "none"}
                onValueChange={v => setLabelId(v === "none" ? null : Number(v))}
                disabled={user?.role === "label"}
              >
                <SelectTrigger data-testid="select-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Please select</SelectItem>
                  {labels.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">© C Line</FieldLabel>
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
                <Input value={cLine} onChange={e => setCLine(e.target.value)} placeholder="C Line" />
              </div>
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">℗ P Line</FieldLabel>
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
                <Input value={pLine} onChange={e => setPLine(e.target.value)} placeholder="P Line" />
              </div>
            </div>
          </div>

          {/* ── Catalog# / Release Type / Compilation ────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">Catalog#</FieldLabel>
              <Input
                value=""
                readOnly
                placeholder="Auto-assigned"
                className="bg-muted/20 cursor-not-allowed text-muted-foreground font-mono"
              />
              <p className="text-[11px] text-muted-foreground">Your internal identifier for this release.</p>
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="text-sm">Release Type</FieldLabel>
              <Select value={releaseType} onValueChange={v => setReleaseType(v as any)}>
                <SelectTrigger data-testid="select-release-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELEASE_TYPE_OPTIONS.map(rt => (
                    <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <FieldLabel className="text-sm">Compilation</FieldLabel>
                <InfoTip text="A compilation is a release that collects tracks from different artists or from different time periods of the same artist. Most standard releases (singles, albums, EPs) are NOT compilations." />
              </div>
              <div className="space-y-1.5 pt-0.5">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                  <Checkbox
                    checked={isCompilation === true}
                    onCheckedChange={v => setIsCompilation(v ? true : false)}
                  />
                  Yes, this is a compilation
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                  <Checkbox
                    checked={isCompilation === false}
                    onCheckedChange={v => setIsCompilation(v ? false : null)}
                  />
                  No, this is a standard release
                </label>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Sticky bottom bar ────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur border-t border-border/50 px-6 py-3 flex items-center justify-between">
        <Button variant="outline" onClick={() => setLocation("/releases")}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={!canCreate} data-testid="button-create-release">
          {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save
        </Button>
      </div>

      {/* ── Quick Create Artist dialog (Symphonic-style) ─────────────────── */}
      <Dialog
        open={addArtistDialogOpen}
        onOpenChange={(o) => { setAddArtistDialogOpen(o); if (!o) setQuickArtistName(""); }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create Artist</DialogTitle>
            <DialogDescription>
              Type your artist's name accurately (how it should be stylized).
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              value={quickArtistName}
              onChange={e => setQuickArtistName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && quickArtistName.trim()) handleQuickCreateArtist(); }}
              placeholder="Artist name…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddArtistDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleQuickCreateArtist}
              disabled={!quickArtistName.trim() || createArtistMut.isPending}
            >
              {createArtistMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Artist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
    </TooltipProvider>
  );
}
