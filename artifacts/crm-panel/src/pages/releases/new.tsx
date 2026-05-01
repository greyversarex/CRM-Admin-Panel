import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Save, Plus } from "lucide-react";
import { CoverUploader } from "@/components/asset-uploader";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import {
  useCreateRelease, useListArtists, useListLabels,
  getListReleasesQueryKey, getGetReleaseCountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { ArtistFormDialog } from "@/components/artist-form-dialog";
import { LabelFormDialog } from "@/components/label-form-dialog";

const RELEASE_TYPES = ["single", "album", "ep", "compilation"] as const;
const RELEASE_TYPE_LABELS: Record<string, string> = {
  single: "Сингл",
  album: "Альбом",
  ep: "EP",
  compilation: "Сборник",
};
const GENRES = ["Pop", "Dance Pop", "Tajik Folk", "Hip Hop", "Rock", "Electronic", "R&B", "Classical", "Jazz", "World"];
const LANGS = [
  { value: "Tajik",   label: "Таджикский" },
  { value: "Russian", label: "Русский" },
  { value: "English", label: "Английский" },
  { value: "Persian", label: "Персидский" },
  { value: "Uzbek",   label: "Узбекский" },
  { value: "Arabic",  label: "Арабский" },
];

export default function CreateRelease() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createRelease = useCreateRelease();
  const { user } = useAuth();

  const isArtist = user?.role === "artist";
  const isLabel  = user?.role === "label";
  const isAdminLike = user?.role === "admin" || user?.role === "manager";
  const canCreateArtist = isAdminLike || isLabel;
  const canCreateLabel  = isAdminLike;

  const { data: artistsData } = useListArtists({ limit: 200 });
  const { data: labelsData }  = useListLabels({ limit: 100 });

  const [artistDialogOpen, setArtistDialogOpen] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen]   = useState(false);

  const [form, setForm] = useState({
    title: "",
    releaseType: "single" as (typeof RELEASE_TYPES)[number],
    artistId: 0,
    labelId: null as number | null,
    upc: "",
    coverUrl: "",
    genre: "Tajik Folk",
    releaseDate: "",
    language: "Tajik",
    isExplicit: false,
    pLine: "",
    cLine: "",
  });

  useEffect(() => {
    if (isArtist && user?.artistId) {
      setForm((p) => ({ ...p, artistId: user.artistId! }));
    }
    if (isLabel && user?.labelId) {
      setForm((p) => ({ ...p, labelId: user.labelId! }));
    }
  }, [isArtist, isLabel, user?.artistId, user?.labelId]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const visibleArtists = artistsData?.data
    ? isLabel && user?.labelId
      ? artistsData.data.filter((a: any) => a.labelId === user.labelId)
      : artistsData.data
    : [];

  const onSubmit = async () => {
    if (!form.title.trim() || !form.artistId) {
      toast({ title: "Незаполненные поля", description: "Укажите название релиза и исполнителя.", variant: "destructive" });
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
      toast({
        title: "Релиз создан",
        description: `«${created.title}» добавлен как ${RELEASE_TYPE_LABELS[form.releaseType] ?? form.releaseType}.`,
      });
      setLocation(`/releases/${created.id}`);
    } catch (e: any) {
      toast({ title: "Не удалось создать релиз", description: e?.message ?? "Неизвестная ошибка", variant: "destructive" });
    }
  };

  const myArtist = artistsData?.data?.find((a: any) => a.id === user?.artistId);
  const myLabel  = labelsData?.data?.find((l: any) => l.id === user?.labelId);

  return (
    <Layout>
      <div className="flex flex-col gap-5 max-w-5xl">
        <button
          onClick={() => setLocation("/releases")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start px-2 py-1 rounded hover:bg-accent/40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Назад к релизам
        </button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Создать релиз</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Заполните метаданные альбома, EP или сингла. Треки и аудио добавляются после создания.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Данные релиза</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Название релиза *">
                <Input
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="Кош Кабутар Мебудам"
                  className="bg-background/40"
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Тип релиза *">
                  <Select value={form.releaseType} onValueChange={(v) => set("releaseType", v as any)}>
                    <SelectTrigger className="bg-background/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RELEASE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{RELEASE_TYPE_LABELS[t] ?? t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Язык метаданных">
                  <Select value={form.language} onValueChange={(v) => set("language", v)}>
                    <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {/* Исполнитель */}
              {isArtist ? (
                <Field label="Исполнитель">
                  <div className="flex items-center gap-2 bg-background/40 border border-border/60 rounded-md px-3 py-2 text-sm">
                    <span className="flex-1">{myArtist?.name ?? "Ваш артист"}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">Вы</Badge>
                  </div>
                </Field>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Исполнитель *">
                    <div className="flex items-center gap-2">
                      <Select
                        value={form.artistId ? String(form.artistId) : ""}
                        onValueChange={(v) => set("artistId", Number(v))}
                      >
                        <SelectTrigger className="bg-background/40"><SelectValue placeholder="Выберите исполнителя…" /></SelectTrigger>
                        <SelectContent>
                          {visibleArtists.map((a: any) => (
                            <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {canCreateArtist && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0 bg-background/40"
                          title="Создать нового артиста"
                          onClick={() => setArtistDialogOpen(true)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </Field>
                  {!isLabel && (
                    <Field label="Лейбл">
                      <div className="flex items-center gap-2">
                        <Select
                          value={form.labelId ? String(form.labelId) : "none"}
                          onValueChange={(v) => set("labelId", v === "none" ? null : Number(v))}
                        >
                          <SelectTrigger className="bg-background/40"><SelectValue placeholder="Независимый" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Независимый</SelectItem>
                            {labelsData?.data.map((l: any) => (
                              <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {canCreateLabel && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0 bg-background/40"
                            title="Создать новый лейбл"
                            onClick={() => setLabelDialogOpen(true)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </Field>
                  )}
                </div>
              )}

              {/* Лейбл для label-роли — read-only */}
              {isLabel && (
                <Field label="Лейбл">
                  <div className="flex items-center gap-2 bg-background/40 border border-border/60 rounded-md px-3 py-2 text-sm">
                    <span className="flex-1">{myLabel?.name ?? "Ваш лейбл"}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">Ваш лейбл</Badge>
                  </div>
                </Field>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Жанр">
                  <Select value={form.genre} onValueChange={(v) => set("genre", v)}>
                    <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="UPC (необязательно)">
                  <Input
                    value={form.upc}
                    onChange={(e) => set("upc", e.target.value)}
                    placeholder="195502855390"
                    className="bg-background/40 font-mono"
                  />
                </Field>
                <Field label="Дата релиза">
                  <Input
                    type="date"
                    value={form.releaseDate}
                    onChange={(e) => set("releaseDate", e.target.value)}
                    className="bg-background/40"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="℗ Строка">
                  <Input
                    value={form.pLine}
                    onChange={(e) => set("pLine", e.target.value)}
                    placeholder="2026 Tajik Music"
                    className="bg-background/40"
                  />
                </Field>
                <Field label="© Строка">
                  <Input
                    value={form.cLine}
                    onChange={(e) => set("cLine", e.target.value)}
                    placeholder="2026 Tajik Music"
                    className="bg-background/40"
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between p-3 rounded-md bg-background/40 border border-border/50">
                <div>
                  <Label className="text-sm">Explicit-контент</Label>
                  <p className="text-xs text-muted-foreground">
                    Пометить релиз как explicit на музыкальных площадках.
                  </p>
                </div>
                <Switch checked={form.isExplicit} onCheckedChange={(v) => set("isExplicit", v)} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50 h-fit">
            <CardHeader><CardTitle className="text-base">Обложка</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <CoverUploader
                value={form.coverUrl || null}
                onChange={(p) => set("coverUrl", p ?? "")}
                attach={false}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-2 sticky bottom-0">
          <Button variant="outline" onClick={() => setLocation("/releases")}>Отмена</Button>
          <Button onClick={onSubmit} disabled={createRelease.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {createRelease.isPending ? "Сохранение…" : "Сохранить релиз"}
          </Button>
        </div>

        {canCreateArtist && (
          <ArtistFormDialog
            open={artistDialogOpen}
            onOpenChange={setArtistDialogOpen}
            onSaved={(id) => set("artistId", id)}
          />
        )}
        {canCreateLabel && (
          <LabelFormDialog
            open={labelDialogOpen}
            onOpenChange={setLabelDialogOpen}
            onSaved={(id) => set("labelId", id)}
          />
        )}
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
