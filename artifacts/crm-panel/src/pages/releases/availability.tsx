// ─── Release Availability (полноценная страница) ────────────────────────────
// Открывается кнопкой «Edit» в карточке Timeline на странице релиза. Полностью
// повторяет страницу «Release Availability» в Symphonic: одна страница с тремя
// секциями —
//   1) Release Timeline  — дата релиза + расширенные настройки (время, UTC);
//   2) Territory Rights   — переключатель «Весь мир» (World Wide);
//   3) Partner Selection  — выбор DSP-площадок через DspPickerDialog.
// Все правки держатся локально и сохраняются ОДНОЙ кнопкой «Сохранить»:
//   • дата/время/территории → PUT /releases/:id (полный набор полей, иначе бэк
//     делает set(parsed.data) и сбрасывает zod-default поля);
//   • площадки → PUT /releases/:id/dsps (отдельный эндпоинт), только если их меняли.
import { useParams, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRelease, useUpdateRelease, useGetReleaseDsps, useUpdateReleaseDsps,
  getGetReleaseQueryKey, getGetReleaseDspsQueryKey,
  type ReleaseDetail, type CreateReleaseBody,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Label as FieldLabel } from "@/components/ui/label";
import { DspPickerDialog } from "@/components/release-wizard/dsp-picker";
import { toast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronDown, AlertTriangle, Pencil, Save } from "lucide-react";

function normalizeHHMM(t?: string | null): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((t ?? "").trim());
  if (!m) return null;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel className="text-sm text-muted-foreground">{label}</FieldLabel>
      {children}
    </div>
  );
}

function DspPill({ name }: { name: string }) {
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2);
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/50 bg-background/40 text-xs">
      <div className="h-5 w-5 rounded-full bg-gradient-to-br from-indigo-500/40 to-violet-500/40 flex items-center justify-center text-[9px] font-bold text-white">
        {initials}
      </div>
      {name}
    </div>
  );
}

function AvailabilityEditor({ release }: { release: ReleaseDetail }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const updateRelease = useUpdateRelease();
  const updateDsps = useUpdateReleaseDsps();
  const { data: serverDsps = [] } = useGetReleaseDsps(release.id);

  const backToRelease = () => setLocation(`/releases/${release.id}`);

  // ── Release Timeline
  const [date, setDate] = useState(
    release.releaseDate ? String(release.releaseDate).slice(0, 10) : "",
  );
  const initialTime = normalizeHHMM(release.releaseTime) ?? "00:00";
  const [time, setTime] = useState(initialTime);
  const [showAdvanced, setShowAdvanced] = useState(initialTime !== "00:00");

  // ── Territory Rights
  const territories = release.territories ?? ["WW"];
  const specificTerritories = territories.filter((t) => t !== "WW");
  const [worldWide, setWorldWide] = useState(territories.includes("WW"));

  // ── Partner Selection. serverDsps приходит асинхронно — синхронизируем
  // локальный выбор один раз по приходу, пока пользователь его не трогал.
  const [dsps, setDsps] = useState<string[]>([]);
  const dspTouched = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (!dspTouched.current) setDsps(serverDsps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverDsps.join(",")]);

  const saving = updateRelease.isPending || updateDsps.isPending;

  const onSave = async () => {
    const data: CreateReleaseBody = {
      title:             release.title,
      releaseType:       release.releaseType as CreateReleaseBody["releaseType"],
      artistId:          release.artistId,
      labelId:           release.labelId ?? null,
      coverUrl:          release.coverUrl ?? null,
      language:          release.language ?? null,
      genre:             release.genre ?? null,
      releaseDate:       date || null,
      releaseTime:       time || null,
      upc:               release.upc ?? null,
      pLine:             release.pLine ?? null,
      cLine:             release.cLine ?? null,
      isExplicit:        !!release.isExplicit,
      isCompilation:     !!release.isCompilation,
      isVariousArtists:  !!release.isVariousArtists,
      upcRequestPending: !!release.upcRequestPending,
      // Весь мир → ["WW"]; иначе сохраняем ранее выбранные конкретные территории
      // (они правятся в «Деталях релиза»), не затирая их.
      territories:       worldWide ? ["WW"] : specificTerritories,
    } as CreateReleaseBody;
    try {
      await updateRelease.mutateAsync({ id: release.id, data });
      if (dspTouched.current) {
        await updateDsps.mutateAsync({ id: release.id, data: { dsps } });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetReleaseQueryKey(release.id) }),
        qc.invalidateQueries({ queryKey: getGetReleaseDspsQueryKey(release.id) }),
      ]);
      toast({ title: "Доступность сохранена", description: "Дата, территории и площадки обновлены." });
      backToRelease();
    } catch (e) {
      toast({ variant: "destructive", title: "Не удалось сохранить", description: (e as Error).message });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <button
        type="button"
        onClick={backToRelease}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" /> Назад к релизу
      </button>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Доступность релиза</h1>
        <p className="text-base text-muted-foreground">
          Спланируйте, когда, где и как выйдет релиз «{release.title}». Рекомендуем
          ставить дату на 4–6 недель вперёд, чтобы:
        </p>
        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
          <li>команда модерации успела проверить и одобрить релиз;</li>
          <li>вы могли воспользоваться маркетинговыми инструментами.</li>
        </ul>
      </header>

      {/* ── 1. Release Timeline ──────────────────────────────────────────── */}
      <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm transition-all hover:border-border/80 hover:shadow-md hover:shadow-primary/5">
        <CardContent className="p-6 space-y-5">
          <h3 className="text-lg font-semibold">Таймлайн релиза</h3>
          <FormField label="Дата релиза">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-background/40 max-w-xs h-11 text-base"
            />
            <p className="text-xs text-muted-foreground/80 mt-1.5">
              Общая дата выхода на всех площадках.
            </p>
          </FormField>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Расширенные настройки
              <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            </button>
            {showAdvanced && (
              <div className="mt-4">
                <FormField label="Время релиза (UTC)">
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="bg-background/40 w-44 h-11 text-base"
                  />
                  <p className="text-xs text-muted-foreground/80 mt-1.5">
                    По умолчанию 00:00 (UTC). Площадки публикуют релиз по этому ориентиру.
                  </p>
                </FormField>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Territory Rights ──────────────────────────────────────────── */}
      <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm transition-all hover:border-border/80 hover:shadow-md hover:shadow-primary/5">
        <CardContent className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Права на территории</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <Switch checked={worldWide} onCheckedChange={setWorldWide} disabled={saving} />
            <span className="text-sm font-medium">Весь мир (World Wide release)</span>
          </label>
          {!worldWide && specificTerritories.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Выбрано: <span className="font-mono">{specificTerritories.join(", ")}</span>
            </div>
          )}
          {!worldWide && specificTerritories.length === 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2.5 leading-relaxed">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                «Весь мир» выключен, конкретные территории не выбраны. При
                сохранении у релиза не останется ни одной территории — он не уйдёт
                на площадки, пока вы не добавите территории вручную через
                «Редактировать» в деталях релиза.
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Релиз будет доступен во всех текущих и будущих территориях мира. Чтобы
            исключить территории, отключите «Весь мир» — тогда нужные территории
            добавляются вручную через «Редактировать» в деталях релиза.
          </p>
        </CardContent>
      </Card>

      {/* ── 3. Partner Selection ─────────────────────────────────────────── */}
      <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm transition-all hover:border-border/80 hover:shadow-md hover:shadow-primary/5">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-row items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Выбор площадок</h3>
            <Button variant="outline" size="sm" className="bg-card" onClick={() => setPickerOpen(true)}>
              <Pencil className="h-4 w-4 mr-1.5" /> Показать площадки
            </Button>
          </div>
          {dsps.length > 0 ? (
            <>
              <div className="text-sm">
                <span className="font-semibold text-primary">{dsps.length}</span>{" "}
                {dsps.length === 1 ? "площадка выбрана" : "площадок выбрано"}
              </div>
              <div className="flex flex-wrap gap-2">
                {dsps.map((d) => <DspPill key={d} name={d} />)}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground border border-dashed border-border/40 rounded-md p-5 text-center">
              Площадки не выбраны. Нажмите «Показать площадки», чтобы выбрать DSP для дистрибуции.
            </div>
          )}
          <DspPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            value={dsps}
            onChange={(codes) => { dspTouched.current = true; setDsps(codes); }}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" size="lg" onClick={backToRelease} disabled={saving}>Отмена</Button>
        <Button size="lg" onClick={onSave} disabled={saving}>
          {saving ? "Сохраняем…" : (<><Save className="h-4 w-4 mr-1.5" /> Сохранить</>)}
        </Button>
      </div>
    </div>
  );
}

export default function ReleaseAvailability() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  const { data: release, isLoading, error } = useGetRelease(id, {
    query: { enabled: Number.isFinite(id) && id > 0, retry: false } as never,
  });

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto p-6 text-sm text-muted-foreground">
          Неверный идентификатор релиза.
        </div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </Layout>
    );
  }

  if (error || !release) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <h2 className="text-xl font-semibold">Релиз не найден</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Не удалось загрузить релиз №{params.id}. Возможно, он был удалён или у вас нет к нему доступа.
          </p>
          <Button variant="outline" className="mt-2" onClick={() => setLocation("/releases")}>
            <ChevronLeft className="h-4 w-4 mr-1" /> К списку релизов
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <AvailabilityEditor release={release} />
    </Layout>
  );
}
