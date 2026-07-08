import { useState, useMemo, useEffect } from "react";
import { useListDspCatalog, type DspCatalogItem } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, LayoutGrid, List, HelpCircle, Globe } from "lucide-react";
import { assetHref } from "@/components/asset-uploader";
import { useLang } from "@/lib/i18n";
import { useCatalogOptions } from "./use-catalog";

const CATEGORY_ORDER = ["streaming", "download", "video", "social", "fingerprinting"];

// Географическое покрытие площадок (реальные регионы присутствия). Используется
// в режиме «Карта покрытия». Первый регион считается основным для группировки.
type CoverageRegion =
  | "worldwide" | "russia_cis" | "europe" | "north_america"
  | "india" | "china" | "asia" | "mena" | "africa";

const REGION_ORDER: CoverageRegion[] = [
  "worldwide", "russia_cis", "europe", "north_america",
  "india", "china", "asia", "mena", "africa",
];

const COVERAGE: Record<string, CoverageRegion[]> = {
  spotify: ["worldwide"], apple_music: ["worldwide"], amazon_music: ["worldwide"],
  youtube_music: ["worldwide"], youtube_content: ["worldwide"], deezer: ["worldwide"],
  tidal: ["worldwide"], soundcloud: ["worldwide"], tiktok: ["worldwide"],
  meta: ["worldwide"], mixcloud: ["worldwide"], shazam: ["worldwide"],
  cap_cut: ["worldwide"], audiomack: ["worldwide"], beatport: ["worldwide"],
  pandora: ["north_america"], napster: ["north_america", "europe"], iheartradio: ["north_america"],
  yandex_music: ["russia_cis"], vk_music: ["russia_cis"], zvuk: ["russia_cis"],
  jiosaavn: ["india"], gaana: ["india"], resso: ["india", "asia"],
  kkbox: ["asia"], netease: ["china"], tencent: ["china"], alibaba: ["china"],
  anghami: ["mena"], boom_play: ["africa"],
};

function primaryRegion(code: string): CoverageRegion {
  return COVERAGE[code]?.[0] ?? "worldwide";
}

/**
 * Inline-контент выбора DSP-площадок (Symphonic-style). Контролируемый:
 * value — выбранные коды, onChange вызывается сразу при изменении.
 * Используется и на странице «Доступность релиза» (встроенно), и внутри
 * модалки DspPickerDialog (мастер создания релиза).
 */
export function DspPickerInline({
  value, onChange,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
}) {
  const { t } = useLang();
  const { data: catalog = [] } = useListDspCatalog();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list" | "map">("grid");

  // Доставляемые площадки — те, у кого настроен DDEX-транспорт (ddexPartyId).
  // Остальные показываем в секции Unavailable: их нельзя выбрать.
  const isDeliverable = (d: DspCatalogItem) => !!d.ddexPartyId;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? catalog.filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q))
      : catalog;
  }, [catalog, query]);

  const unavailable = useMemo(() => filtered.filter((d) => !isDeliverable(d)), [filtered]);
  const deliverable = useMemo(() => filtered.filter(isDeliverable), [filtered]);

  const grouped = useMemo(() => {
    const m = new Map<string, DspCatalogItem[]>();
    for (const d of deliverable) {
      if (!m.has(d.category)) m.set(d.category, []);
      m.get(d.category)!.push(d);
    }
    return Array.from(m.entries()).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  }, [deliverable]);

  const groupedByRegion = useMemo(() => {
    const m = new Map<CoverageRegion, DspCatalogItem[]>();
    for (const d of deliverable) {
      const r = primaryRegion(d.code);
      if (!m.has(r)) m.set(r, []);
      m.get(r)!.push(d);
    }
    return REGION_ORDER.filter((r) => m.has(r)).map((r) => [r, m.get(r)!] as const);
  }, [deliverable]);

  const allDeliverableCodes = useMemo(
    () => catalog.filter(isDeliverable).map((d) => d.code),
    [catalog],
  );
  const allSelected =
    allDeliverableCodes.length > 0 && allDeliverableCodes.every((c) => value.includes(c));
  const selectedCount = value.length;

  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  const toggleAll = (codes: string[]) => {
    const allOn = codes.every((c) => value.includes(c));
    onChange(allOn ? value.filter((c) => !codes.includes(c)) : Array.from(new Set([...value, ...codes])));
  };

  const toggleEverything = () => {
    onChange(allSelected
      ? value.filter((c) => !allDeliverableCodes.includes(c))
      : Array.from(new Set([...value, ...allDeliverableCodes])));
  };

  const gridCls = view === "list" ? "space-y-2" : "grid grid-cols-2 sm:grid-cols-3 gap-2";

  const sections =
    view === "map"
      ? groupedByRegion.map(([region, items]) => ({
          key: region,
          title: t.releaseWizard.dspCoverageRegions[region as keyof typeof t.releaseWizard.dspCoverageRegions] ?? region,
          items,
        }))
      : grouped.map(([cat, items]) => ({
          key: cat,
          title: t.releaseWizard.dspCategories[cat as keyof typeof t.releaseWizard.dspCategories] ?? cat,
          items,
        }));

  return (
    <div className="space-y-4">
      {/* Toolbar: view toggle + "All / N selected" */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button" onClick={toggleEverything}
          className="inline-flex items-center gap-2 text-sm"
        >
          <Checkbox checked={allSelected} className="pointer-events-none" />
          {allSelected ? (
            <span><span className="font-semibold text-primary">{t.releaseWizard.allLabel}</span> {t.releaseWizard.partnersSelectedLabel}</span>
          ) : (
            <span><span className="font-semibold text-primary">{selectedCount}</span> {t.releaseWizard.partnersSelectedLabel}</span>
          )}
        </button>
        <div className="flex items-center gap-0.5 rounded-md border border-border/50 p-0.5">
          <button
            type="button" onClick={() => setView("list")} title={t.releaseWizard.listView}
            className={`p-1.5 rounded transition ${view === "list" ? "bg-accent" : "hover:bg-accent/50"}`}
          ><List className="h-4 w-4" /></button>
          <button
            type="button" onClick={() => setView("grid")} title={t.releaseWizard.gridView}
            className={`p-1.5 rounded transition ${view === "grid" ? "bg-accent" : "hover:bg-accent/50"}`}
          ><LayoutGrid className="h-4 w-4" /></button>
          <button
            type="button" onClick={() => setView("map")} title={t.releaseWizard.mapView}
            className={`p-1.5 rounded transition ${view === "map" ? "bg-accent" : "hover:bg-accent/50"}`}
          ><Globe className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t.releaseWizard.searchPartners} className="pl-9 bg-background/40"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Body */}
      <div className="space-y-6">
        {/* Unavailable (not connected for delivery) */}
        {unavailable.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2.5">
              {t.releaseWizard.unavailable} <span className="text-muted-foreground font-normal">{unavailable.length}</span>
            </h4>
            <div className={gridCls}>
              {unavailable.map((d) => (
                <DspRow key={d.code} dsp={d} checked={false} disabled onToggle={() => {}} view={view} />
              ))}
            </div>
          </div>
        )}

        {/* Category / region sections */}
        {sections.map((s) => {
          const codes = s.items.map((i) => i.code);
          const allOn = codes.length > 0 && codes.every((c) => value.includes(c));
          return (
            <div key={s.key}>
              <h4 className="text-sm font-semibold mb-2">{s.title}</h4>
              <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2.5 cursor-pointer w-fit">
                <Checkbox checked={allOn} onCheckedChange={() => toggleAll(codes)} />
                {t.releaseWizard.selectAllPartners}
              </label>
              <div className={gridCls}>
                {s.items.map((d) => (
                  <DspRow key={d.code} dsp={d} checked={value.includes(d.code)} onToggle={() => toggle(d.code)} view={view} />
                ))}
              </div>
            </div>
          );
        })}

        {sections.length === 0 && unavailable.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">{t.releaseWizard.noPartnersFound}</div>
        )}
      </div>
    </div>
  );
}

/** Partner Selection — модальная обёртка (мастер создания релиза). */
export function DspPickerDialog({
  open, onOpenChange, value, onChange,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  value: string[];
  onChange: (codes: string[]) => void;
}) {
  const { t } = useLang();
  const [draft, setDraft] = useState<string[]>(value);

  useEffect(() => {
    if (open) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value.join(",")]);

  const apply = () => { onChange(draft); onOpenChange(false); };
  const cancel = () => { setDraft(value); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={(b) => { if (!b) cancel(); }}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogTitle className="text-lg">{t.releaseWizard.partnerSelection}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <DspPickerInline value={draft} onChange={setDraft} />
        </div>
        <DialogFooter className="px-6 py-4 border-t border-border/40">
          <Button variant="outline" onClick={cancel}>{t.createRelease.cancel}</Button>
          <Button onClick={apply}>{t.createRelease.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Категории площадок дистрибуции для группировки «по назначению» на странице
// «Выбор площадок». Ключи совпадают с t.releaseWizard.dspCategories.
const OUTLET_CATEGORY_ORDER = ["streaming", "video", "social", "ringtone", "fingerprinting", "other"];

// Идентификатор площадки → категория. Значение опции равно этому идентификатору
// (в справочнике у площадок нет отдельного кода, поэтому используется id).
const OUTLET_CATEGORY: Record<string, string> = {
  // Стриминг и магазины
  "6140": "streaming", "49803": "streaming", "6157": "streaming", "22025": "streaming",
  "25240": "streaming", "329": "streaming", "22023": "streaming", "106551": "streaming",
  "35141": "streaming", "425775": "streaming", "511702": "streaming", "516188": "streaming",
  "516181": "streaming", "41259": "streaming", "173993": "streaming", "516338": "streaming",
  "25437": "streaming", "25438": "streaming", "1018521": "streaming", "626396": "streaming",
  "626402": "streaming", "1407384": "streaming", "37197": "streaming", "6139": "streaming",
  "554234": "streaming", "764128": "streaming", "-1": "streaming", "-2": "streaming",
  // Видео
  "21859": "video", "436356": "video", "510125": "video", "792408": "video",
  // Соцсети и UGC
  "526258": "social", "1407523": "social",
  // Рингтоны и гудки
  "1216": "ringtone", "49856": "ringtone", "2588": "ringtone",
  // Распознавание контента
  "510131": "fingerprinting", "516342": "fingerprinting",
};

function categorizeOutlet(value: string, label: string): string {
  const mapped = OUTLET_CATEGORY[value];
  if (mapped) return mapped;
  const n = label.toLowerCase();
  if (/gudok|goodok|гудок|ringback|jingle|privet/.test(n)) return "ringtone";
  if (/acr|audible magic|fingerprint/.test(n)) return "fingerprinting";
  if (/content id/.test(n)) return "video";
  if (/youtube|tiktok|kuaishou|dou\s?yin/.test(n)) return "video";
  if (/facebook|instagram|oculus|servo|snap/.test(n)) return "social";
  return "other";
}

/**
 * Выбор площадок дистрибуции, сгруппированных по назначению (стриминг, видео,
 * соцсети, рингтоны, распознавание, прочее). Контролируемый: value/onChange —
 * идентификаторы выбранных площадок. Используется на странице «Доступность
 * релиза» и в мастере создания релиза.
 */
export function OutletPickerInline({
  value, onChange,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
}) {
  const { t } = useLang();
  const { options, isLoading } = useCatalogOptions("outlet", { valueKey: "code" });
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
      : options;
  }, [options, query]);

  const grouped = useMemo(() => {
    const m = new Map<string, { value: string; label: string }[]>();
    for (const o of filtered) {
      const cat = categorizeOutlet(o.value, o.label);
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(o);
    }
    return Array.from(m.entries()).sort((a, b) => {
      const ia = OUTLET_CATEGORY_ORDER.indexOf(a[0]);
      const ib = OUTLET_CATEGORY_ORDER.indexOf(b[0]);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  }, [filtered]);

  const allCodes = useMemo(() => options.map((o) => o.value), [options]);
  const allSelected = allCodes.length > 0 && allCodes.every((c) => value.includes(c));
  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  const toggleEverything = () =>
    onChange(allSelected ? value.filter((c) => !allCodes.includes(c)) : Array.from(new Set([...value, ...allCodes])));
  const toggleGroup = (codes: string[]) => {
    const allOn = codes.every((c) => value.includes(c));
    onChange(allOn ? value.filter((c) => !codes.includes(c)) : Array.from(new Set([...value, ...codes])));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button type="button" onClick={toggleEverything} className="inline-flex items-center gap-2 text-sm">
          <Checkbox checked={allSelected} className="pointer-events-none" />
          <span>
            <span className="font-semibold text-primary">{allSelected ? t.releaseWizard.allLabel : value.length}</span>{" "}
            {t.releaseWizard.partnersSelectedLabel}
          </span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t.releaseWizard.searchPartners} className="pl-9 bg-background/40"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-8">…</div>
      ) : grouped.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">{t.releaseWizard.noPartnersFound}</div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, items]) => {
            const codes = items.map((i) => i.value);
            const allOn = codes.length > 0 && codes.every((c) => value.includes(c));
            const title = t.releaseWizard.dspCategories[cat as keyof typeof t.releaseWizard.dspCategories] ?? cat;
            return (
              <div key={cat}>
                <h4 className="text-sm font-semibold mb-2">
                  {title} <span className="text-muted-foreground font-normal">{items.length}</span>
                </h4>
                <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2.5 cursor-pointer w-fit">
                  <Checkbox checked={allOn} onCheckedChange={() => toggleGroup(codes)} />
                  {t.releaseWizard.selectAllPartners}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {items.map((o) => {
                    const checked = value.includes(o.value);
                    return (
                      <button
                        key={o.value} type="button" onClick={() => toggle(o.value)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-md border text-left transition w-full ${checked ? "bg-primary/5 border-primary/40" : "bg-background/30 border-border/50 hover:bg-accent/40"}`}
                      >
                        <Checkbox checked={checked} className="pointer-events-none shrink-0" />
                        <span className="text-sm truncate flex-1">{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Витрины Broma16 — модальная обёртка (мастер создания релиза). */
export function OutletPickerDialog({
  open, onOpenChange, value, onChange,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  value: string[];
  onChange: (codes: string[]) => void;
}) {
  const { t } = useLang();
  const [draft, setDraft] = useState<string[]>(value);
  useEffect(() => {
    if (open) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value.join(",")]);
  const apply = () => { onChange(draft); onOpenChange(false); };
  const cancel = () => { setDraft(value); onOpenChange(false); };
  return (
    <Dialog open={open} onOpenChange={(b) => { if (!b) cancel(); }}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogTitle className="text-lg">{t.releaseWizard.partnerSelection}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <OutletPickerInline value={draft} onChange={setDraft} />
        </div>
        <DialogFooter className="px-6 py-4 border-t border-border/40">
          <Button variant="outline" onClick={cancel}>{t.createRelease.cancel}</Button>
          <Button onClick={apply}>{t.createRelease.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DspRow({
  dsp, checked, disabled, onToggle, view,
}: {
  dsp: DspCatalogItem;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  view: "grid" | "list" | "map";
}) {
  const { t } = useLang();
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      title={disabled ? t.releaseWizard.partnerNotConnected : undefined}
      className={`flex items-center gap-2.5 p-2.5 rounded-md border text-left transition w-full
        ${disabled
          ? "bg-muted/20 border-border/30 opacity-60 cursor-not-allowed"
          : checked
            ? "bg-primary/5 border-primary/40"
            : "bg-background/30 border-border/50 hover:bg-accent/40"}`}
    >
      <Checkbox checked={checked && !disabled} disabled={disabled} className="pointer-events-none shrink-0" />
      {disabled ? (
        <div className="h-7 w-7 rounded bg-muted/40 flex items-center justify-center text-muted-foreground shrink-0">
          <HelpCircle className="h-4 w-4" />
        </div>
      ) : dsp.logoUrl ? (
        <img src={assetHref(dsp.logoUrl)} alt="" className="h-7 w-7 rounded object-cover bg-muted shrink-0" />
      ) : (
        <div className="h-7 w-7 rounded bg-muted/40 flex items-center justify-center text-[10px] uppercase text-muted-foreground shrink-0">
          {dsp.code.slice(0, 2)}
        </div>
      )}
      <span className="text-sm truncate flex-1">{dsp.name}</span>
    </button>
  );
}
