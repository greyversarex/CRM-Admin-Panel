import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

type DspDeal = {
  id: number;
  dspName: string;
  dealType: "distribution" | "publishing" | "neighbouring" | "sync" | "other";
  status: "draft" | "active" | "expired" | "terminated";
  startsAt: string | null;
  endsAt: string | null;
  revenueShare: string | null;
  territory: string;
  contractRef: string | null;
  notes: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик", active: "Активен", expired: "Истёк", terminated: "Расторгнут",
};
const TYPE_LABELS: Record<string, string> = {
  distribution: "Дистрибуция", publishing: "Издательство",
  neighbouring: "Смежные", sync: "Синхронизация", other: "Прочее",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!r.ok) {
    let m = `HTTP ${r.status}`;
    try { m = (await r.json())?.error ?? m; } catch { /* noop */ }
    throw new Error(m);
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}

export function DspDealsTab() {
  const [deals, setDeals] = useState<DspDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DspDeal | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ deals: DspDeal[] }>("/api/rights/dsp-deals");
      setDeals(r.deals);
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(id: number) {
    if (!confirm("Удалить договор?")) return;
    try { await api(`/api/rights/dsp-deals/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Всего договоров: {deals.length}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Обновить
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Новый договор
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/50 border-b border-border/50">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">DSP</th>
              <th className="px-3 py-2">Тип</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2">Период</th>
              <th className="px-3 py-2">Доля</th>
              <th className="px-3 py-2">Территория</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">Нет договоров</td></tr>
            )}
            {deals.map((d) => (
              <tr key={d.id} className="border-t border-border/30 hover:bg-card/30">
                <td className="px-3 py-2 font-medium">{d.dspName}</td>
                <td className="px-3 py-2">{TYPE_LABELS[d.dealType] ?? d.dealType}</td>
                <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{STATUS_LABELS[d.status] ?? d.status}</Badge></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {d.startsAt ? new Date(d.startsAt).toLocaleDateString("ru-RU") : "—"}
                  {" → "}
                  {d.endsAt ? new Date(d.endsAt).toLocaleDateString("ru-RU") : "∞"}
                </td>
                <td className="px-3 py-2">{d.revenueShare ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{d.territory}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditing(d); setOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-400" onClick={() => remove(d.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DealDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={load} />
    </div>
  );
}

function DealDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: DspDeal | null;
  onSaved: () => Promise<void>;
}) {
  const [dspName, setDspName] = useState("");
  const [dealType, setDealType] = useState<DspDeal["dealType"]>("distribution");
  const [status, setStatus] = useState<DspDeal["status"]>("active");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [revenueShare, setRevenueShare] = useState("");
  const [territory, setTerritory] = useState("WW");
  const [contractRef, setContractRef] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setDspName(editing?.dspName ?? "");
      setDealType(editing?.dealType ?? "distribution");
      setStatus(editing?.status ?? "active");
      setStartsAt(editing?.startsAt?.slice(0, 10) ?? "");
      setEndsAt(editing?.endsAt?.slice(0, 10) ?? "");
      setRevenueShare(editing?.revenueShare ?? "");
      setTerritory(editing?.territory ?? "WW");
      setContractRef(editing?.contractRef ?? "");
      setNotes(editing?.notes ?? "");
    }
  }, [open, editing]);

  async function save() {
    try {
      const body = {
        dspName, dealType, status,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        revenueShare: revenueShare || null,
        territory: territory || "WW",
        contractRef: contractRef || null,
        notes: notes || null,
      };
      if (editing) {
        await api(`/api/rights/dsp-deals/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api("/api/rights/dsp-deals", { method: "POST", body: JSON.stringify(body) });
      }
      await onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Ошибка сохранения", description: String((e as Error).message), variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Редактировать договор" : "Новый договор с DSP"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">DSP</Label><Input value={dspName} onChange={(e) => setDspName(e.target.value)} placeholder="Spotify" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Тип</Label>
              <Select value={dealType} onValueChange={(v) => setDealType(v as DspDeal["dealType"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>).map((k) => (
                    <SelectItem key={k} value={k}>{TYPE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Статус</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DspDeal["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((k) => (
                    <SelectItem key={k} value={k}>{STATUS_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Начало</Label><Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
            <div><Label className="text-xs">Окончание</Label><Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Доля</Label><Input value={revenueShare} onChange={(e) => setRevenueShare(e.target.value)} placeholder="80%" /></div>
            <div><Label className="text-xs">Территория</Label><Input value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="WW" /></div>
          </div>
          <div><Label className="text-xs">Номер контракта</Label><Input value={contractRef} onChange={(e) => setContractRef(e.target.value)} /></div>
          <div><Label className="text-xs">Примечания</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={save}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
