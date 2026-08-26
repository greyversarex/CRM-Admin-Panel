// ─── Release Availability (полноценная страница) ────────────────────────────
// Открывается кнопкой «Edit» в карточке Timeline на странице релиза. Полностью
// повторяет страницу «Release Availability» в Symphonic: одна страница с тремя
// секциями —
//   1) Release Timeline  — дата релиза + расширенные настройки (время, UTC);
//   2) Territory Rights   — переключатель «Весь мир» (World Wide);
//   3) Partner Selection  — выбор витрин Broma16 через OutletPickerInline.
// Все правки держатся локально и сохраняются ОДНОЙ кнопкой «Сохранить»:
//   • дата/время/территории → PUT /releases/:id (полный набор полей, иначе бэк
//     делает set(parsed.data) и сбрасывает zod-default поля);
//   • витрины → PUT /releases/:id/distribution-outlets (реальный канал Broma16,
//     а не мёртвый release_dsps), только если их меняли.
import { useParams, useLocation } from "wouter";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useGetRelease, useUpdateRelease,
  getGetReleaseQueryKey,
  type ReleaseDetail, type CreateReleaseBody,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label as FieldLabel } from "@/components/ui/label";
import { OutletPickerInline } from "@/components/release-wizard/dsp-picker";
import { useCatalogOptions } from "@/components/release-wizard/use-catalog";
import { COUNTRIES, countryName } from "@/lib/countries";
import { useLang } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronDown, AlertTriangle, HelpCircle, Pencil, Save, Search, X } from "lucide-react";

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

function TerritoryPicker({
  selected, onChange, query, onQueryChange, lang, disabled,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
  query: string;
  onQueryChange: (q: string) => void;
  lang: "ru" | "en";
  disabled?: boolean;
}) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? COUNTRIES.filter(
        (c) =>
          c.ru.toLowerCase().includes(q) ||
          c.en.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q),
      )
    : COUNTRIES;

  const toggle = (code: string) =>
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);

  return (
    <div className="space-y-3">
      {selected.length === 0 ? (
        <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2.5 leading-relaxed">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            «Весь мир» выключен и ни одна территория не выбрана. При сохранении
            релиз не уйдёт на площадки — выберите хотя бы одну страну ниже.
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((code) => (
            <button
              key={code}
              type="button"
              disabled={disabled}
              onClick={() => toggle(code)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-primary/40 bg-primary/10 text-xs"
            >
              {countryName(code, lang)}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск страны…"
          className="pl-9 bg-background/40"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="max-h-64 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 pr-1">
        {filtered.map((c) => (
          <label
            key={c.code}
            className="flex items-center gap-2 p-2 rounded-md border border-border/40 bg-background/30 hover:bg-accent/40 cursor-pointer text-sm"
          >
            <Checkbox
              checked={selected.includes(c.code)}
              onCheckedChange={() => toggle(c.code)}
              disabled={disabled}
            />
            <span className="truncate">{lang === "ru" ? c.ru : c.en}</span>
          </label>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-xs text-muted-foreground py-4">
            Страны не найдены.
          </div>
        )}
      </div>
    </div>
  );
}

function AvailabilityEditor({ release }: { release: ReleaseDetail }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { lang } = useLang();
  const updateRelease = useUpdateRelease();
  // Витрины Broma16 (release.broma16DistributionOutlets) — реальный канал
  // доставки. Читаем/сохраняем через /releases/:id/distribution-outlets
  // (тот же эндпоинт, что и мастер), а НЕ release_dsps (мёртвый DDEX-путь).
  const { data: serverDsps = [] } = useQuery<string[]>({
    queryKey: ["release-outlets", release.id],
    queryFn: async () => {
      const res = await fetch(`/api/releases/${release.id}/distribution-outlets`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as string[];
    },
  });
  // Словарь витрин Broma16 — нужен, чтобы при сохранении отсеять устаревшие
  // коды, которых уже нет в словаре (иначе PUT вернёт 400 и заблокирует
  // сохранение). Тот же кэш react-query, что и в пикере, — лишнего запроса нет.
  const { options: outletOptions } = useCatalogOptions("outlet", { valueKey: "code" });
  const updateOutlets = useMutation({
    mutationFn: async (outlets: string[]) => {
      const res = await fetch(`/api/releases/${release.id}/distribution-outlets`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlets }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = (j?.error as string) ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
    },
  });

  const backToRelease = () => setLocation(`/releases/${release.id}`);

  // ── Release Timeline
  const [date, setDate] = useState(
    release.releaseDate ? String(release.releaseDate).slice(0, 10) : "",
  );
  const initialTime = normalizeHHMM(release.releaseTime) ?? "00:00";
  const [time, setTime] = useState(initialTime);
  const [origDate, setOrigDate] = useState(
    release.originalReleaseDate ? String(release.originalReleaseDate).slice(0, 10) : "",
  );
  // ── Что означает выбранная дата
  //
  // Тип публикации Broma16 определяется самой датой, отдельного переключателя
  // нет: будущая дата — новый релиз, прошлая — тот, что уже выходил. Пороги
  // взяты из их документации: новому нужно минимум 2 дня форы на доставку в
  // магазины, уже вышедшему — минимум 2 дня назад.
  const [upc, setUpc] = useState(release.upc ?? "");

  const dayOffset = useMemo(() => {
    if (!date) return null;
    const target = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(target.getTime())) return null;
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((target.getTime() - todayUtc) / 86_400_000);
  }, [date]);

  const isPastDate = dayOffset !== null && dayOffset < 0;

  const humanDate = (offsetDays: number) => {
    const d = new Date(Date.now() + offsetDays * 86_400_000);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  };

  const dateHint = useMemo((): { tone: "good" | "bad" | "past"; text: string } | null => {
    if (dayOffset === null) return null;
    if (dayOffset <= -2) {
      return {
        tone: "past",
        text:
          "Дата в прошлом — значит релиз уже выходил на площадках. Отправим его как перенос " +
          "каталога: площадки поймут, что запись не новая, а прослушивания и статистика сохранятся. " +
          "Для этого нужен его прежний штрихкод — поле ниже.",
      };
    }
    if (dayOffset < 0) {
      return {
        tone: "bad",
        text:
          `Дата в прошлом, но слишком свежая. Для уже вышедшего релиза Broma16 требует минимум ` +
          `два дня назад — то есть не позже ${humanDate(-2)}.`,
      };
    }
    if (dayOffset < 2) {
      return {
        tone: "bad",
        text:
          `Слишком близко: Broma16 не успеет доставить релиз в магазины. Самое раннее — ` +
          `${humanDate(2)}. Если релиз уже где-то выходил, поставьте его настоящую прошлую дату.`,
      };
    }
    if (dayOffset < 7) {
      return {
        tone: "good",
        text:
          `Новый релиз, выйдет ${humanDate(dayOffset)}. Броме этого хватит, но площадки ` +
          `рассматривают заявки в плейлисты заранее — если рассчитываете на них, берите ` +
          `${humanDate(7)} или дальше.`,
      };
    }
    return {
      tone: "good",
      text: `Новый релиз, выйдет ${humanDate(dayOffset)}. Запаса хватает и для заявок в плейлисты.`,
    };
  }, [dayOffset]);

  const [preorderDate, setPreorderDate] = useState(
    release.preorderDate ? String(release.preorderDate).slice(0, 10) : "",
  );
  const [showAdvanced, setShowAdvanced] = useState(
    initialTime !== "00:00" || !!origDate || !!preorderDate,
  );

  // ── Territory Rights
  const territories = release.territories ?? ["WW"];
  const [worldWide, setWorldWide] = useState(territories.includes("WW"));
  const [selectedTerritories, setSelectedTerritories] = useState<string[]>(
    territories.filter((t) => t !== "WW"),
  );
  const [territoryQuery, setTerritoryQuery] = useState("");

  // ── Partner Selection. serverDsps приходит асинхронно — синхронизируем
  // локальный выбор один раз по приходу, пока пользователь его не трогал.
  const [dsps, setDsps] = useState<string[]>([]);
  const dspTouched = useRef(false);
  const [showPartners, setShowPartners] = useState(false);
  const allOutletCodes = useMemo(() => outletOptions.map((o) => o.value), [outletOptions]);
  // Площадки, на которые релиз не поедет, и признак «выбраны все».
  const notSelected = useMemo(
    () => outletOptions.filter((o) => !dsps.includes(o.value)),
    [outletOptions, dsps],
  );
  const allSelected = outletOptions.length > 0 && notSelected.length === 0;
  useEffect(() => {
    if (!dspTouched.current) {
      if (serverDsps.length > 0) {
        setDsps(serverDsps);
      } else if (allOutletCodes.length > 0) {
        // Новый релиз — по умолчанию выбираем все доступные площадки.
        setDsps(allOutletCodes);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverDsps.join(","), allOutletCodes.join(",")]);

  const saving = updateRelease.isPending || updateOutlets.isPending;

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
      originalReleaseDate: origDate || null,
      preorderDate:      preorderDate || null,
      upc:               upc.trim() || null,
      pLine:             release.pLine ?? null,
      cLine:             release.cLine ?? null,
      isExplicit:        !!release.isExplicit,
      isCompilation:     !!release.isCompilation,
      isVariousArtists:  !!release.isVariousArtists,
      upcRequestPending: !!release.upcRequestPending,
      // Весь мир → ["WW"]; иначе сохраняем выбранные конкретные территории.
      territories:       worldWide ? ["WW"] : selectedTerritories,
    } as CreateReleaseBody;
    try {
      await updateRelease.mutateAsync({ id: release.id, data });
      // Площадки сохраняем ВСЕГДА, а не только если пользователь их трогал:
      // на экране может стоять дефолт «все выбраны», которого ещё нет в базе, —
      // «Сохранить» обязан зафиксировать ровно то, что показано (иначе проверка
      // готовности продолжит говорить «не выбрано ни одной площадки»).
      // Словарь загружен → шлём только известные коды (устаревшие отбрасываем,
      // чтобы не ловить 400); пока словарь не загружен — шлём как есть.
      {
        const known = new Set(outletOptions.map((o) => o.value));
        const outletsToSave = outletOptions.length > 0 ? dsps.filter((c) => known.has(c)) : dsps;
        await updateOutlets.mutateAsync(outletsToSave);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetReleaseQueryKey(release.id) }),
        qc.invalidateQueries({ queryKey: ["release-outlets", release.id] }),
        // Освежаем карточку «Отправка в Broma16» (она показывает счётчик витрин).
        qc.invalidateQueries({ queryKey: ["broma16-push", release.id] }),
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
          <FormField label="Дата появления на площадках">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-background/40 max-w-xs h-11 text-base"
            />
            <p className="text-xs text-muted-foreground/80 mt-1.5">
              День, когда релиз должен появиться в Spotify, Apple Music и остальных.
              Это не дата записи и не дата загрузки сюда.
            </p>
            {dateHint && (
              <div
                className={`mt-2.5 rounded-md border px-3 py-2 text-xs leading-relaxed ${
                  dateHint.tone === "bad"
                    ? "border-rose-500/30 bg-rose-500/5 text-rose-200"
                    : dateHint.tone === "past"
                      ? "border-sky-500/30 bg-sky-500/5 text-sky-200"
                      : "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
                }`}
              >
                {dateHint.text}
              </div>
            )}
          </FormField>

          {/* Дата в прошлом означает, что релиз уже выходил. Тогда нужен его
              прежний штрихкод: новый создавать нельзя, иначе на площадках
              появится вторая запись той же песни с обнулённой статистикой. */}
          {isPastDate && (
            <FormField label="Оригинальный UPC">
              <Input
                value={upc}
                onChange={(e) => setUpc(e.target.value.replace(/\D/g, "").slice(0, 14))}
                placeholder="например 8721466979915"
                className="bg-background/40 max-w-xs h-11 text-base font-mono"
                inputMode="numeric"
              />
              <p className="text-xs text-muted-foreground/80 mt-1.5">
                Штрихкод, с которым релиз выходил раньше. Найти его можно в кабинете прежнего
                дистрибьютора или на странице релиза в Spotify. Новый код создавать нельзя —
                площадки не свяжут релиз со старой записью, и все прослушивания начнутся с нуля.
              </p>
              {!upc.trim() && (
                <p className="text-xs text-amber-300/90 mt-1.5">
                  Без него отправить не получится: для уже вышедшего релиза Broma16 требует прежний код.
                </p>
              )}
            </FormField>
          )}

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
              <div className="mt-4 space-y-5">
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
                <FormField label="Оригинальная дата выхода">
                  <Input
                    type="date"
                    value={origDate}
                    onChange={(e) => setOrigDate(e.target.value)}
                    className="bg-background/40 max-w-xs h-11 text-base"
                  />
                  <p className="text-xs text-muted-foreground/80 mt-1.5">
                    Справочное поле для нашего учёта. Площадкам уходит только дата выше —
                    для уже вышедшего релиза ставьте настоящую дату выхода именно туда.
                  </p>
                </FormField>
                <FormField label="Дата предзаказа / pre-save">
                  <Input
                    type="date"
                    value={preorderDate}
                    onChange={(e) => setPreorderDate(e.target.value)}
                    className="bg-background/40 max-w-xs h-11 text-base"
                  />
                  <p className="text-xs text-muted-foreground/80 mt-1.5">
                    Дата, с которой релиз можно сохранить заранее (pre-save). Должна
                    быть раньше даты релиза.
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
          {worldWide ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Релиз будет доступен во всех текущих и будущих территориях мира. Чтобы
              выбрать территории вручную, отключите «Весь мир».
            </p>
          ) : (
            <TerritoryPicker
              selected={selectedTerritories}
              onChange={setSelectedTerritories}
              query={territoryQuery}
              onQueryChange={setTerritoryQuery}
              lang={lang}
              disabled={saving}
            />
          )}
        </CardContent>
      </Card>

      {/* ── 3. Partner Selection ─────────────────────────────────────────── */}
      <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm transition-all hover:border-border/80 hover:shadow-md hover:shadow-primary/5">
        <CardContent className="p-6 space-y-5">
          <h3 className="text-lg font-semibold">Выбор площадок</h3>

          {/* Сводка по центру: сколько выбрано и кнопка раскрытия. Пока список
              свёрнут, главное — понять охват одним взглядом, а не читать
              описание. */}
          <div className="flex flex-col items-center gap-2 py-2">
            <p className="text-xl">
              {allSelected ? (
                <>
                  <span className="font-bold text-emerald-400">Все</span>
                  {" "}<span className="font-medium">площадки выбраны</span>
                </>
              ) : (
                <>
                  <span className="font-bold text-primary">{dsps.length}</span>
                  {" "}<span className="font-medium">из {outletOptions.length}{" "}
                  {dsps.length === 1 ? "площадка выбрана" : "площадок выбрано"}</span>
                </>
              )}
            </p>
            <Button variant="outline" size="sm" className="bg-card" onClick={() => setShowPartners((v) => !v)}>
              <Pencil className="h-4 w-4 mr-1.5" />
              {showPartners ? "Скрыть площадки" : "Показать площадки"}
            </Button>
          </div>

          {showPartners && (
            <div className="pt-2 border-t border-border/40">
              <OutletPickerInline
                value={dsps}
                onChange={(codes) => { dspTouched.current = true; setDsps(codes); }}
              />
            </div>
          )}

          {/* Невыбранные площадки — то, куда релиз НЕ поедет. Это важнее
              списка выбранных: пропущенную витрину замечают уже после
              публикации, когда исправлять поздно. */}
          {!showPartners && notSelected.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="text-sm font-medium text-muted-foreground">
                Не выбрано <span className="text-foreground">{notSelected.length}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {notSelected.map((o) => (
                  <div
                    key={o.value}
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm"
                    title="Релиз не будет отправлен на эту площадку"
                  >
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{o.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
