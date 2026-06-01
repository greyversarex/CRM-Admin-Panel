import { useState, useMemo, useEffect } from "react";
import { useListDspCatalog, type DspCatalogItem } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, LayoutGrid, List, HelpCircle } from "lucide-react";
import { assetHref } from "@/components/asset-uploader";

// English category display names + display order — стиль Symphonic «Partner Selection».
// Источник категорий — серверный dsp_catalog (поле category).
const CATEGORY_DISPLAY: Record<string, string> = {
  streaming: "Streaming & Download",
  download:  "Download Stores",
  social:    "UGC / Rights Management",
  video:     "Video",
  regional:  "Regional",
};
const CATEGORY_ORDER = ["streaming", "download", "social", "video", "regional"];

/** Partner Selection — выбор DSP-площадок (Symphonic-style). */
export function DspPickerDialog({
  open, onOpenChange, value, onChange,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  value: string[];
  onChange: (codes: string[]) => void;
}) {
  const { data: catalog = [] } = useListDspCatalog();
  const [draft, setDraft] = useState<string[]>(value);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  // При каждом открытии синхронизируем draft со свежим value (родитель мог
  // обновить выбор после сохранения и refetch).
  useEffect(() => {
    if (open) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value.join(",")]);

  // Доставляемые площадки — те, у кого настроен DDEX-транспорт (ddexPartyId).
  // Остальные показываем в секции Unavailable: их нельзя выбрать, доставка
  // ещё не подключена.
  const isDeliverable = (d: DspCatalogItem) => !!d.ddexPartyId;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? catalog.filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q))
      : catalog;
  }, [catalog, query]);

  const unavailable = useMemo(() => filtered.filter((d) => !isDeliverable(d)), [filtered]);

  const grouped = useMemo(() => {
    const m = new Map<string, DspCatalogItem[]>();
    for (const d of filtered.filter(isDeliverable)) {
      if (!m.has(d.category)) m.set(d.category, []);
      m.get(d.category)!.push(d);
    }
    return Array.from(m.entries()).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  }, [filtered]);

  const allDeliverableCodes = useMemo(
    () => catalog.filter(isDeliverable).map((d) => d.code),
    [catalog],
  );
  const allSelected =
    allDeliverableCodes.length > 0 && allDeliverableCodes.every((c) => draft.includes(c));
  const selectedCount = draft.length;

  const toggle = (code: string) =>
    setDraft((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const toggleAll = (codes: string[]) => {
    const allOn = codes.every((c) => draft.includes(c));
    setDraft((prev) =>
      allOn ? prev.filter((c) => !codes.includes(c)) : Array.from(new Set([...prev, ...codes])),
    );
  };

  const toggleEverything = () => {
    setDraft((prev) =>
      allSelected
        ? prev.filter((c) => !allDeliverableCodes.includes(c))
        : Array.from(new Set([...prev, ...allDeliverableCodes])),
    );
  };

  const apply = () => { onChange(draft); onOpenChange(false); };
  const cancel = () => { setDraft(value); onOpenChange(false); };

  const gridCls = view === "grid" ? "grid grid-cols-2 sm:grid-cols-3 gap-2" : "space-y-2";

  return (
    <Dialog open={open} onOpenChange={(b) => { if (!b) cancel(); }}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-lg">Partner Selection</DialogTitle>
            <div className="flex items-center gap-0.5 rounded-md border border-border/50 p-0.5">
              <button
                type="button" onClick={() => setView("list")}
                title="List view"
                className={`p-1.5 rounded transition ${view === "list" ? "bg-accent" : "hover:bg-accent/50"}`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button" onClick={() => setView("grid")}
                title="Grid view"
                className={`p-1.5 rounded transition ${view === "grid" ? "bg-accent" : "hover:bg-accent/50"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* "All / N partners selected" toggle */}
          <button
            type="button" onClick={toggleEverything}
            className="inline-flex items-center gap-2 text-sm self-start"
          >
            <Checkbox checked={allSelected} className="pointer-events-none" />
            {allSelected ? (
              <span><span className="font-semibold text-primary">All</span> partners selected</span>
            ) : (
              <span><span className="font-semibold text-primary">{selectedCount}</span> partners selected</span>
            )}
          </button>
        </DialogHeader>

        {/* Search */}
        <div className="px-6 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search partners..." className="pl-9 bg-background/40"
              value={query} onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Unavailable (not connected for delivery) */}
          {unavailable.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2.5">
                Unavailable <span className="text-muted-foreground font-normal">{unavailable.length}</span>
              </h4>
              <div className={gridCls}>
                {unavailable.map((d) => (
                  <DspRow key={d.code} dsp={d} checked={false} disabled onToggle={() => {}} />
                ))}
              </div>
            </div>
          )}

          {/* Category sections */}
          {grouped.map(([cat, items]) => {
            const codes = items.map((i) => i.code);
            const allOn = codes.length > 0 && codes.every((c) => draft.includes(c));
            return (
              <div key={cat}>
                <h4 className="text-sm font-semibold mb-2">{CATEGORY_DISPLAY[cat] ?? cat}</h4>
                <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2.5 cursor-pointer w-fit">
                  <Checkbox checked={allOn} onCheckedChange={() => toggleAll(codes)} />
                  Select All Partners
                </label>
                <div className={gridCls}>
                  {items.map((d) => (
                    <DspRow key={d.code} dsp={d} checked={draft.includes(d.code)} onToggle={() => toggle(d.code)} />
                  ))}
                </div>
              </div>
            );
          })}

          {grouped.length === 0 && unavailable.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">No partners found.</div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border/40">
          <Button variant="outline" onClick={cancel}>Cancel</Button>
          <Button onClick={apply}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DspRow({
  dsp, checked, disabled, onToggle,
}: {
  dsp: DspCatalogItem;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      title={disabled ? "This partner is not yet connected for delivery. Contact your administrator to enable it." : undefined}
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
