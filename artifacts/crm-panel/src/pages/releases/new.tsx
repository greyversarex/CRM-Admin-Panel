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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { GENRES, SUBGENRES, LANGS } from "@/components/release-wizard/types";
import { CoverUploader } from "@/components/asset-uploader";

const CURRENT_YEAR = new Date().getFullYear();
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
    <Layout>
      <div className="max-w-3xl mx-auto py-8 px-4 pb-24">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Release details</h1>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            We follow strict guidelines as set forth by Apple Music, Spotify and more.
            Upload artwork, enter the title, choose the release type, and add your project artists.
          </p>
        </div>

        <div className="space-y-8">

          {/* ── Cover Art ────────────────────────────────────────────────── */}
          <div>
            <FieldLabel className="text-sm font-medium mb-3 block">Cover Art ?</FieldLabel>
            <div className="flex gap-6 items-start">
              <div className="shrink-0">
                <CoverUploader value={coverUrl || null} onChange={p => setCoverUrl(p ?? "")} attach={false} />
              </div>
              <div className="flex-1 pt-1">
                <p className="text-sm font-medium mb-3">
                  What amount of generative AI tools were used in the creation of this cover art?
                </p>
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
              <FieldLabel htmlFor="version" className="text-sm">Release Version (Optional)?</FieldLabel>
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
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Metadata translations (optional)</span>
              <Button type="button" variant="outline" size="sm" onClick={addTranslation}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add translation
              </Button>
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
            <FieldLabel className="text-sm font-medium block">Primary Artists</FieldLabel>
            <Select
              value={artistId ? String(artistId) : ""}
              onValueChange={v => setArtistId(Number(v))}
            >
              <SelectTrigger data-testid="select-artist">
                <SelectValue placeholder="Select artist" />
              </SelectTrigger>
              <SelectContent>
                {artistOptions.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
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
              <FieldLabel className="text-sm">Compilation</FieldLabel>
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
    </Layout>
  );
}
