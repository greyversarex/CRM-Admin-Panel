import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ImageIcon, Save } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  useCreateRelease, useListArtists, useListLabels,
  getListReleasesQueryKey, getGetReleaseCountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const RELEASE_TYPES = ["single", "album", "ep", "compilation"] as const;
const GENRES = ["Pop", "Dance Pop", "Tajik Folk", "Hip Hop", "Rock", "Electronic", "R&B", "Classical", "Jazz", "World"];
const LANGS = ["English", "Tajik", "Russian", "Persian", "Uzbek", "Arabic"];

export default function CreateRelease() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createRelease = useCreateRelease();
  const { data: artistsData } = useListArtists({ limit: 100 });
  const { data: labelsData } = useListLabels({ limit: 100 });

  const [form, setForm] = useState({
    title: "",
    releaseType: "single" as (typeof RELEASE_TYPES)[number],
    artistId: 0,
    labelId: null as number | null,
    upc: "",
    coverUrl: "",
    genre: "Pop",
    releaseDate: "",
    language: "English",
    isExplicit: false,
    pLine: "",
    cLine: "",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const onSubmit = async () => {
    if (!form.title.trim() || !form.artistId) {
      toast({ title: "Missing fields", description: "Title and Primary Artist are required.", variant: "destructive" });
      return;
    }
    try {
      const payload: any = {
        title: form.title.trim(),
        releaseType: form.releaseType,
        artistId: form.artistId,
        labelId: form.labelId ?? null,
        upc: form.upc || null,
        coverUrl: form.coverUrl || null,
        genre: form.genre || null,
        releaseDate: form.releaseDate || null,
        language: form.language || null,
        isExplicit: form.isExplicit,
        territories: ["WW"],
        pLine: form.pLine || null,
        cLine: form.cLine || null,
      };
      const created = await createRelease.mutateAsync({ data: payload });
      queryClient.invalidateQueries({ queryKey: getListReleasesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReleaseCountsQueryKey() });
      toast({ title: "Release created", description: `"${created.title}" added as ${form.releaseType}.` });
      setLocation(`/releases/${created.id}`);
    } catch (e: any) {
      toast({ title: "Failed to create release", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-5 max-w-5xl">
        <button onClick={() => setLocation("/releases")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start px-2 py-1 rounded hover:bg-accent/40">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Releases
        </button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Release</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Fill in metadata for your album, EP, or single. You'll add tracks and audio after creation.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Release Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Release Title *">
                <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Kosh Kabutar Mebudam" className="bg-background/40" />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Release Type *">
                  <Select value={form.releaseType} onValueChange={(v) => set("releaseType", v as any)}>
                    <SelectTrigger className="bg-background/40 capitalize"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RELEASE_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Metadata Language">
                  <Select value={form.language} onValueChange={(v) => set("language", v)}>
                    <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Primary Artist *">
                  <Select value={form.artistId ? String(form.artistId) : ""} onValueChange={(v) => set("artistId", Number(v))}>
                    <SelectTrigger className="bg-background/40"><SelectValue placeholder="Select artist…" /></SelectTrigger>
                    <SelectContent>
                      {artistsData?.data.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Label">
                  <Select value={form.labelId ? String(form.labelId) : "none"} onValueChange={(v) => set("labelId", v === "none" ? null : Number(v))}>
                    <SelectTrigger className="bg-background/40"><SelectValue placeholder="Independent" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Independent</SelectItem>
                      {labelsData?.data.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Genre">
                  <Select value={form.genre} onValueChange={(v) => set("genre", v)}>
                    <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="UPC (optional)">
                  <Input value={form.upc} onChange={(e) => set("upc", e.target.value)} placeholder="195502855390" className="bg-background/40 font-mono" />
                </Field>
                <Field label="Release Date">
                  <Input type="date" value={form.releaseDate} onChange={(e) => set("releaseDate", e.target.value)} className="bg-background/40" />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="℗ Line">
                  <Input value={form.pLine} onChange={(e) => set("pLine", e.target.value)} placeholder="2026 Tajik Music" className="bg-background/40" />
                </Field>
                <Field label="© Line">
                  <Input value={form.cLine} onChange={(e) => set("cLine", e.target.value)} placeholder="2026 Tajik Music" className="bg-background/40" />
                </Field>
              </div>

              <div className="flex items-center justify-between p-3 rounded-md bg-background/40 border border-border/50">
                <div>
                  <Label className="text-sm">Explicit Content</Label>
                  <p className="text-xs text-muted-foreground">Mark this release as explicit on DSPs.</p>
                </div>
                <Switch checked={form.isExplicit} onCheckedChange={(v) => set("isExplicit", v)} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50 h-fit">
            <CardHeader><CardTitle className="text-base">Cover Art</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="aspect-square rounded-lg overflow-hidden bg-muted border border-border/50">
                {form.coverUrl
                  ? <img src={form.coverUrl} alt="Cover" className="h-full w-full object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
                  : <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground/50 gap-2 bg-gradient-to-br from-indigo-900/20 to-violet-900/30">
                      <ImageIcon className="h-10 w-10" />
                      <span className="text-xs">No cover</span>
                    </div>}
              </div>
              <Field label="Cover URL">
                <Input value={form.coverUrl} onChange={(e) => set("coverUrl", e.target.value)} placeholder="https://…" className="bg-background/40" />
              </Field>
              <p className="text-[10px] text-muted-foreground/70">3000×3000 px, square JPG/PNG recommended.</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-2 sticky bottom-0">
          <Button variant="outline" onClick={() => setLocation("/releases")}>Cancel</Button>
          <Button onClick={onSubmit} disabled={createRelease.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {createRelease.isPending ? "Saving…" : "Save Release"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
