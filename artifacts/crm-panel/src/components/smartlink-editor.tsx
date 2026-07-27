/**
 * Боковая панель «Редактирование смартлинка».
 *
 * Открывается из списка смартлинков и с карточки релиза. Собрана по референсу
 * Broma16: General (название, артист, готовая ссылка) → Outlets (витрины с
 * перетаскиванием) → Socials → Theme, снизу «Предпросмотр» и «Готово».
 *
 * Порядок витрин задаётся перетаскиванием и хранится порядком массива — именно
 * в нём они рисуются на публичной странице, поэтому лейбл может поставить
 * приоритетную площадку первой.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  GripVertical, Trash2, Plus, Copy, ExternalLink, Loader2, Check,
} from "lucide-react";
import {
  useSmartlinkOutlets, outletInfo, detectOutlet,
  type SmartLinkDto, type Dsp,
} from "@/lib/smartlink";

async function jput<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "PUT", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    try { throw new Error((JSON.parse(text) as { error?: string }).error ?? text); }
    catch (e) { throw e instanceof Error ? e : new Error(text); }
  }
  return r.json() as Promise<T>;
}

export interface SmartlinkEditorProps {
  link: SmartLinkDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Вызывается после успешного сохранения — список сам себя обновляет. */
  onSaved?: (link: SmartLinkDto) => void;
}

export function SmartlinkEditor({ link, open, onOpenChange, onSaved }: SmartlinkEditorProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: outlets = [] } = useSmartlinkOutlets();

  const [title, setTitle] = useState(link.title);
  const [artist, setArtist] = useState(link.artist);
  const [dsps, setDsps] = useState<Dsp[]>(link.dsps);
  const [socialsEnabled, setSocialsEnabled] = useState(link.socialsEnabled);
  const [socials, setSocials] = useState(link.socials);
  const [theme, setTheme] = useState<"light" | "dark">(link.theme === "dark" ? "dark" : "light");

  // Панель переиспользуется для разных ссылок — при смене подставляем свежие
  // значения, иначе в форме остались бы поля предыдущего смартлинка.
  useEffect(() => {
    setTitle(link.title);
    setArtist(link.artist);
    setDsps(link.dsps);
    setSocialsEnabled(link.socialsEnabled);
    setSocials(link.socials);
    setTheme(link.theme === "dark" ? "dark" : "light");
  }, [link.id, link.title, link.artist, link.dsps, link.socialsEnabled, link.socials, link.theme]);

  const pageUrl = useMemo(
    () => `${window.location.origin}/l/${link.slug}`,
    [link.slug],
  );

  const save = useMutation({
    mutationFn: () => jput<SmartLinkDto>(`/api/marketing/links/${link.id}`, {
      title, artist, dsps, socials, socialsEnabled, theme,
    }),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["smartlinks"] });
      qc.invalidateQueries({ queryKey: ["smartlink-by-release"] });
      onSaved?.(saved);
      toast({ title: "Смартлинк сохранён" });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Не удалось сохранить", description: e.message }),
  });

  // ── Перетаскивание витрин ────────────────────────────────────────────
  // Нативный HTML5 drag&drop: порядок площадок — единственное, что нужно
  // тянуть мышкой, ради этого тащить в проект целую библиотеку незачем.
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function reorder(from: number, to: number) {
    if (from === to) return;
    setDsps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function patchDsp(index: number, patch: Partial<Dsp>) {
    setDsps((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  /** Вставили ссылку — подставляем площадку по домену, если она ещё не выбрана осмысленно. */
  function onUrlChange(index: number, url: string) {
    const detected = detectOutlet(outlets, url);
    const current = dsps[index];
    const shouldRename = detected && (!current.url || current.name === detected.key || !current.name);
    patchDsp(index, {
      url,
      active: url.trim() !== "",
      ...(shouldRename ? { name: detected.key, action: detected.action } : {}),
    });
  }

  const usedKeys = new Set(dsps.map((d) => d.name));
  const available = outlets.filter((o) => !usedKeys.has(o.key));

  function addOutlet() {
    const next = available[0] ?? outlets[0];
    if (!next) return;  // справочник ещё грузится
    setDsps((prev) => [...prev, { name: next.key, url: "", active: false, action: next.action }]);
  }

  const copyLink = () => {
    navigator.clipboard.writeText(pageUrl)
      .then(() => toast({ title: "Ссылка скопирована", description: pageUrl }))
      .catch(() => toast({ variant: "destructive", title: "Буфер обмена недоступен" }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
        <SheetHeader className="px-6 py-4 border-b flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-lg">Редактирование смартлинка</SheetTitle>
          <div className="flex items-center gap-1 pr-6">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyLink} title="Скопировать ссылку">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Открыть страницу">
              <a href={pageUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {/* ── Общее ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-base font-semibold">Общее</h3>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Релиз</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="smartlink-title" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Артист</Label>
              <Input value={artist} onChange={(e) => setArtist(e.target.value)} data-testid="smartlink-artist" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Адрес страницы</Label>
              <div className="flex items-center gap-1.5">
                <Input value={pageUrl} readOnly className="text-muted-foreground bg-muted/40" />
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={copyLink}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </section>

          {/* ── Витрины ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Витрины</h3>
              <span className="text-[11px] text-muted-foreground">
                {dsps.filter((d) => d.url.trim()).length} из {dsps.length} заполнено
              </span>
            </div>

            <div className="space-y-2.5">
              {dsps.map((d, i) => {
                const info = outletInfo(outlets, d.name);
                return (
                  <div
                    key={`${d.name}-${i}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                    onDragLeave={() => setDragOver((v) => (v === i ? null : v))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragFrom.current !== null) reorder(dragFrom.current, i);
                      dragFrom.current = null;
                      setDragOver(null);
                    }}
                    className={`rounded-lg border p-2.5 transition-colors ${
                      dragOver === i ? "border-primary bg-primary/5" : "border-border/50 bg-background/40"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        draggable
                        onDragStart={() => { dragFrom.current = i; }}
                        onDragEnd={() => { dragFrom.current = null; setDragOver(null); }}
                        className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground"
                        title="Перетащите, чтобы изменить порядок"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: info.color }} />
                      <Select value={d.name} onValueChange={(v) => patchDsp(i, { name: v, action: outletInfo(outlets, v).action })}>
                        <SelectTrigger className="h-7 text-xs border-0 bg-transparent px-1 focus:ring-0 w-auto gap-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {outlets.map((o) => (
                            <SelectItem key={o.key} value={o.key} className="text-xs">{o.label}</SelectItem>
                          ))}
                          {/* Площадка не из справочника (пришла из старых данных) — не теряем её. */}
                          {!outlets.some((o) => o.key === d.name) && (
                            <SelectItem value={d.name} className="text-xs">{info.label}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <div className="flex-1" />
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-rose-400"
                        onClick={() => setDsps((prev) => prev.filter((_, idx) => idx !== i))}
                        title="Убрать площадку"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Input
                      value={d.url}
                      onChange={(e) => onUrlChange(i, e.target.value)}
                      placeholder="https://…"
                      className="h-8 text-xs"
                      data-testid={`smartlink-url-${d.name}`}
                    />
                  </div>
                );
              })}
            </div>

            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={addOutlet}>
              <Plus className="h-3.5 w-3.5" /> Добавить витрину
            </Button>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Пустые витрины на публичной странице не показываются. Вставьте ссылку — площадка определится по адресу сама.
            </p>
          </section>

          {/* ── Соцсети ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Соцсети</h3>
              <Switch checked={socialsEnabled} onCheckedChange={setSocialsEnabled} data-testid="smartlink-socials-toggle" />
            </div>
            {socialsEnabled && (
              <div className="space-y-2.5">
                {socials.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      value={s.name}
                      onChange={(e) => setSocials((p) => p.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                      placeholder="Instagram"
                      className="h-8 text-xs w-32 shrink-0"
                    />
                    <Input
                      value={s.url}
                      onChange={(e) => setSocials((p) => p.map((x, idx) => idx === i ? { ...x, url: e.target.value } : x))}
                      placeholder="https://…"
                      className="h-8 text-xs"
                    />
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-rose-400"
                      onClick={() => setSocials((p) => p.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline" size="sm" className="gap-1.5 h-8 text-xs"
                  onClick={() => setSocials((p) => [...p, { name: "", url: "" }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Добавить соцсеть
                </Button>
              </div>
            )}
          </section>

          {/* ── Оформление ────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-base font-semibold">Оформление</h3>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Тема страницы</Label>
              <Select value={theme} onValueChange={(v) => setTheme(v === "dark" ? "dark" : "light")}>
                <SelectTrigger data-testid="smartlink-theme"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Светлая</SelectItem>
                  <SelectItem value="dark">Тёмная</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>
        </div>

        <div className="px-6 py-4 border-t flex items-center gap-2 bg-muted/20">
          <Button variant="outline" className="flex-1" asChild>
            <a href={pageUrl} target="_blank" rel="noopener noreferrer">Предпросмотр</a>
          </Button>
          <Button className="flex-1 gap-1.5" onClick={() => save.mutate()} disabled={save.isPending} data-testid="smartlink-save">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Готово
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
