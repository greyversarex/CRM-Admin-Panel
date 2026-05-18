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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Barcode, CheckCircle2, AlertCircle, Loader2, ChevronRight, ChevronLeft, Disc3, Music2, Layers, FolderArchive } from "lucide-react";
import { RELEASE_TYPES } from "@/components/release-wizard/types";

type UpcChoice = "have" | "need" | null;
type Step = "upc" | "basics";

type UpcCheckResult =
  | { available: true }
  | { available: false; reason: string; conflictRelease?: { id: number; title: string; status: string } };

const RELEASE_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  single: Music2,
  album: Disc3,
  ep: Layers,
  compilation: FolderArchive,
};

const RELEASE_TYPE_HINTS: Record<string, string> = {
  single: "1–3 трека, не более 30 минут общей длительности.",
  album: "От 6 треков или 30+ минут общей длительности.",
  ep: "4–6 треков или до 30 минут общей длительности.",
  compilation: "Сборник треков нескольких исполнителей.",
};

async function checkUpcAvailability(upc: string): Promise<UpcCheckResult> {
  const r = await fetch(`/api/releases/check-upc?upc=${encodeURIComponent(upc)}`, {
    credentials: "include",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export default function CreateRelease() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>("upc");

  // ── Step 1: UPC Gate ─────────────────────────────────────────────────────
  const [upcChoice, setUpcChoice] = useState<UpcChoice>(null);
  const [upc, setUpc] = useState("");
  const [upcCheckLoading, setUpcCheckLoading] = useState(false);
  const [upcCheck, setUpcCheck] = useState<UpcCheckResult | null>(null);

  // Сбрасываем результат при ручном изменении UPC.
  useEffect(() => { setUpcCheck(null); }, [upc]);

  async function handleCheckUpc() {
    const clean = upc.trim();
    if (!/^\d{8,14}$/.test(clean)) {
      setUpcCheck({ available: false, reason: "UPC должен содержать 8–14 цифр." });
      return;
    }
    setUpcCheckLoading(true);
    try {
      const res = await checkUpcAvailability(clean);
      setUpcCheck(res);
    } catch (e: any) {
      setUpcCheck({ available: false, reason: `Ошибка проверки: ${e?.message ?? "сеть"}` });
    } finally {
      setUpcCheckLoading(false);
    }
  }

  const canGoBasics =
    upcChoice === "need" ||
    (upcChoice === "have" && upcCheck && upcCheck.available);

  // ── Step 2: Basics ───────────────────────────────────────────────────────
  const [releaseType, setReleaseType] = useState<"single" | "album" | "ep" | "compilation">("single");
  const [title, setTitle] = useState("");
  const [releaseVersion, setReleaseVersion] = useState("");
  const [artistId, setArtistId] = useState<number | null>(null);
  const [labelId, setLabelId] = useState<number | null>(null);

  const { data: artistsData } = useListArtists({ limit: 200, page: 1 } as never);
  const artists = useMemo(() => artistsData?.data ?? [], [artistsData]);
  const { data: labelsData } = useListLabels({ limit: 200, page: 1 } as never);
  const labels = useMemo(() => labelsData?.data ?? [], [labelsData]);

  // Авто-подставляем «свой» артист/лейбл из сессии — пользователю не нужно выбирать.
  useEffect(() => {
    if (!user) return;
    if (user.role === "artist" && user.artistId && !artistId) {
      setArtistId(user.artistId);
    }
    if (user.role === "label" && user.labelId && !labelId) {
      setLabelId(user.labelId);
    }
  }, [user, artistId, labelId]);

  // Артисты, доступные для выбора (артист видит только себя; лейбл — артистов лейбла).
  const artistOptions = useMemo(() => {
    if (!user) return artists;
    if (user.role === "artist") return artists.filter(a => a.id === user.artistId);
    if (user.role === "label") return artists.filter(a => a.labelId === user.labelId);
    return artists;
  }, [artists, user]);

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

  const canCreate = title.trim().length >= 1 && artistId != null && !createMut.isPending;

  async function handleCreate() {
    if (!artistId) return;
    const body: any = {
      title: title.trim(),
      releaseType,
      artistId,
      labelId: labelId ?? undefined,
      releaseVersion: releaseVersion.trim() || undefined,
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
      <div className="max-w-3xl mx-auto py-6 space-y-6">
        {/* Header / steps indicator */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Создание релиза</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Шаг {step === "upc" ? "1" : "2"} из 2 — {step === "upc" ? "штрихкод (UPC)" : "основные данные"}
            </p>
          </div>
          <Button variant="ghost" onClick={() => setLocation("/releases")}>Отмена</Button>
        </div>

        {step === "upc" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Barcode className="h-5 w-5" />
                Есть ли у вас UPC для этого релиза?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground">
                UPC (Universal Product Code) — это 12–13-значный штрихкод релиза, по которому DSP-площадки
                (Spotify, Apple Music и т. д.) узнают альбом или сингл. Если у вас уже выпускался релиз с UPC,
                выберите «У меня есть UPC». Если нет — мы выдадим его автоматически при отправке на модерацию.
              </p>

              <RadioGroup
                value={upcChoice ?? ""}
                onValueChange={(v) => { setUpcChoice(v as UpcChoice); setUpcCheck(null); }}
                className="space-y-3"
              >
                <label className="flex items-start gap-3 rounded-md border p-4 cursor-pointer hover-elevate" data-testid="upc-choice-have">
                  <RadioGroupItem value="have" className="mt-1" />
                  <div className="flex-1">
                    <div className="font-medium">У меня есть UPC</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Подходит, если релиз уже выходил на других дистрибьюторах или был выпущен физически.
                      Мы проверим, что UPC не используется в нашем каталоге.
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-md border p-4 cursor-pointer hover-elevate" data-testid="upc-choice-need">
                  <RadioGroupItem value="need" className="mt-1" />
                  <div className="flex-1">
                    <div className="font-medium">Мне нужен UPC</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Мы автоматически присвоим UPC при отправке релиза на модерацию. Это бесплатно
                      и подходит для новых, ранее не публиковавшихся релизов.
                    </div>
                  </div>
                </label>
              </RadioGroup>

              {upcChoice === "have" && (
                <div className="space-y-3 rounded-md border p-4 bg-muted/30">
                  <FieldLabel htmlFor="upc">UPC код</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="upc"
                      data-testid="input-upc"
                      placeholder="Например, 5901234123457"
                      value={upc}
                      onChange={(e) => setUpc(e.target.value.replace(/[^\d]/g, "").slice(0, 14))}
                      className="font-mono"
                    />
                    <Button onClick={handleCheckUpc} disabled={!upc.trim() || upcCheckLoading} data-testid="button-check-upc">
                      {upcCheckLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Проверить"}
                    </Button>
                  </div>

                  {upcCheck && upcCheck.available && (
                    <Alert className="border-emerald-500/50 bg-emerald-500/10">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <AlertDescription>UPC свободен и может быть использован.</AlertDescription>
                    </Alert>
                  )}
                  {upcCheck && !upcCheck.available && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {upcCheck.reason}
                        {upcCheck.conflictRelease && (
                          <div className="mt-1 text-xs">
                            Конфликт: релиз «{upcCheck.conflictRelease.title}»{" "}
                            <Badge variant="outline" className="ml-1">{upcCheck.conflictRelease.status}</Badge>
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setStep("basics")}
                  disabled={!canGoBasics}
                  data-testid="button-upc-next"
                >
                  Далее <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "basics" && (
          <Card>
            <CardHeader>
              <CardTitle>Основные данные</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Release type */}
              <div className="space-y-2">
                <FieldLabel>Тип релиза</FieldLabel>
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
                        className={`text-left rounded-md border p-3 transition hover-elevate ${active ? "border-primary bg-primary/5" : ""}`}
                      >
                        <Icon className={`h-5 w-5 mb-2 ${active ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="font-medium text-sm">{rt.label}</div>
                        <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
                          {RELEASE_TYPE_HINTS[rt.value]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title + version */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FieldLabel htmlFor="title">Название релиза *</FieldLabel>
                  <Input
                    id="title"
                    data-testid="input-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Без указания featuring и (Remix)"
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="version">Версия (необязательно)</FieldLabel>
                  <Input
                    id="version"
                    data-testid="input-version"
                    value={releaseVersion}
                    onChange={(e) => setReleaseVersion(e.target.value)}
                    placeholder="Deluxe, Remastered, Live..."
                  />
                </div>
              </div>

              {/* Artist + label */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FieldLabel>Основной исполнитель *</FieldLabel>
                  <Select
                    value={artistId ? String(artistId) : ""}
                    onValueChange={(v) => setArtistId(Number(v))}
                  >
                    <SelectTrigger data-testid="select-artist">
                      <SelectValue placeholder="Выберите артиста" />
                    </SelectTrigger>
                    <SelectContent>
                      {artistOptions.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {artistOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      В каталоге нет артистов. Сначала добавьте артиста в разделе «Артисты».
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <FieldLabel>Лейбл</FieldLabel>
                  <Select
                    value={labelId ? String(labelId) : "none"}
                    onValueChange={(v) => setLabelId(v === "none" ? null : Number(v))}
                    disabled={user?.role === "label"}
                  >
                    <SelectTrigger data-testid="select-label">
                      <SelectValue placeholder="Без лейбла" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без лейбла</SelectItem>
                      {labels.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* UPC summary (read-only) */}
              <div className="rounded-md border p-3 bg-muted/30 text-sm">
                <div className="font-medium mb-1">UPC</div>
                {upcChoice === "have" ? (
                  <div className="font-mono">{upc}</div>
                ) : (
                  <div className="text-muted-foreground">Будет присвоен автоматически при отправке на модерацию.</div>
                )}
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep("upc")} data-testid="button-back-upc">
                  <ChevronLeft className="h-4 w-4 mr-1" /> Назад
                </Button>
                <Button onClick={handleCreate} disabled={!canCreate} data-testid="button-create-release">
                  {createMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Создать черновик
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
