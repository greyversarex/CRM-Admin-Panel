import { useState, useMemo } from "react";
import { useListDspCatalog, type DspCatalogItem } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, CheckCircle2 } from "lucide-react";
import { DSP_CATEGORY_LABELS } from "./types";
import { assetHref } from "@/components/asset-uploader";

/** Modal-picker для выбора DSP-площадок (Step 3 wizard). */
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

  // Каждый раз при открытии модалки — синхронизируем draft с внешним value.
  // Нужно потому что в этом компоненте draft переживает между открытиями.
  if (open && draft.length === 0 && value.length > 0 && !draft.some((c) => value.includes(c))) {
    setDraft(value);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? catalog.filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)) : catalog;
  }, [catalog, query]);

  const grouped = useMemo(() => {
    const m = new Map<string, DspCatalogItem[]>();
    for (const d of filtered) {
      const cat = d.category;
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(d);
    }
    return Array.from(m.entries());
  }, [filtered]);

  const toggle = (code: string) => {
    setDraft((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  };
  const toggleAll = (codes: string[]) => {
    const allOn = codes.every((c) => draft.includes(c));
    setDraft((prev) => allOn ? prev.filter((c) => !codes.includes(c)) : Array.from(new Set([...prev, ...codes])));
  };

  const apply = () => { onChange(draft); onOpenChange(false); };
  const cancel = () => { setDraft(value); onOpenChange(false); };

  const selectedDsp = catalog.filter((d) => draft.includes(d.code));

  return (
    <Dialog open={open} onOpenChange={(b) => { if (!b) cancel(); }}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Выбор площадок (DSP)</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск площадок..." className="pl-9 bg-background/40"
            value={query} onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Tabs defaultValue="all" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="self-start">
            <TabsTrigger value="all">Все ({catalog.length})</TabsTrigger>
            <TabsTrigger value="selected">Выбрано ({draft.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="flex-1 overflow-y-auto pr-1">
            <div className="space-y-4">
              {grouped.map(([category, items]) => {
                // «Выбрать все» применяется только к подключённым DSP (с ddexPartyId);
                // площадки «В разработке» исключаем — пользователь не должен случайно
                // выбрать недоставляемую площадку через bulk-кнопку.
                const selectable = items.filter((i) => !!i.ddexPartyId);
                const allOn = selectable.length > 0 && selectable.every((i) => draft.includes(i.code));
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-2 sticky top-0 bg-background py-1">
                      <h4 className="text-xs uppercase text-muted-foreground tracking-wider">
                        {DSP_CATEGORY_LABELS[category] ?? category}
                      </h4>
                      {selectable.length > 0 && (
                        <button type="button" className="text-xs text-primary hover:underline"
                                onClick={() => toggleAll(selectable.map((i) => i.code))}>
                          {allOn ? "Снять все" : "Выбрать все"}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {items.map((d) => (
                        <DspRow key={d.code} dsp={d} checked={draft.includes(d.code)} onToggle={() => toggle(d.code)} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {grouped.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">Ничего не найдено.</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="selected" className="flex-1 overflow-y-auto pr-1">
            {selectedDsp.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Пока ничего не выбрано. Перейдите в «Все» и отметьте площадки.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {selectedDsp.map((d) => (
                  <DspRow key={d.code} dsp={d} checked onToggle={() => toggle(d.code)} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={cancel}>Отмена</Button>
          <Button onClick={apply}>Сохранить ({draft.length})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DspRow({ dsp, checked, onToggle }: { dsp: DspCatalogItem; checked: boolean; onToggle: () => void }) {
  // DSP без ddexPartyId не подключены по DDEX-протоколу (Yandex/VK/Звук и т.д.).
  // Их нельзя выбирать в релизе — мы не сможем доставить контент туда автоматически.
  // Покажем как «В разработке», блокируем чекбокс. Когда появится коннектор,
  // в dsp_catalog заполнят ddex_party_id или другой transport_code и плашка снимется.
  const disabled = !dsp.ddexPartyId;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      title={disabled ? "Площадка ещё не подключена по DDEX/SFTP. Свяжитесь с администратором — для запуска нужно настроить транспорт." : undefined}
      className={`flex items-center gap-3 p-2 rounded-md border text-left transition
        ${disabled
          ? "bg-muted/20 border-border/30 opacity-60 cursor-not-allowed"
          : checked
            ? "bg-primary/10 border-primary/40"
            : "bg-background/30 border-border/50 hover:bg-accent/40"}`}
    >
      <Checkbox checked={checked && !disabled} disabled={disabled} className="pointer-events-none" />
      {dsp.logoUrl ? (
        <img src={assetHref(dsp.logoUrl)} alt="" className="h-7 w-7 rounded object-cover bg-muted" />
      ) : (
        <div className="h-7 w-7 rounded bg-muted/40 flex items-center justify-center text-[10px] uppercase text-muted-foreground">
          {dsp.code.slice(0, 2)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate flex items-center gap-1.5">
          {dsp.name}
          {disabled && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">
              В разработке
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground">{dsp.code}</div>
      </div>
      {checked && !disabled && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
    </button>
  );
}
