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

type Item = {
  id: number;
  assetType: "track" | "release";
  trackId: number | null;
  releaseId: number | null;
  ytAssetId: string | null;
  status: "pending" | "registered" | "claimed" | "released" | "rejected";
  claimPolicy: "monetize" | "track" | "block";
  ownership: string;
  notes: string | null;
  registeredAt: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает", registered: "Зарегистрирован", claimed: "Заклеймён",
  released: "Снят", rejected: "Отклонён",
};
const POLICY_LABELS: Record<string, string> = {
  monetize: "Монетизация", track: "Трекинг", block: "Блокировка",
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

export function ContentIdTab() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ items: Item[] }>("/api/rights/content-id");
      setItems(r.items);
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(id: number) {
    if (!confirm("Удалить запись Content ID?")) return;
    try { await api(`/api/rights/content-id/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Активов: {items.length}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Обновить
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Регистрация Content ID
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/50 border-b border-border/50">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Тип</th>
              <th className="px-3 py-2">ID актива</th>
              <th className="px-3 py-2">YT Asset ID</th>
              <th className="px-3 py-2">Политика</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">Нет регистраций</td></tr>
            )}
            {items.map((it) => (
              <tr key={it.id} className="border-t border-border/30 hover:bg-card/30">
                <td className="px-3 py-2">{it.assetType === "track" ? "Трек" : "Релиз"}</td>
                <td className="px-3 py-2 font-mono text-xs">#{it.trackId ?? it.releaseId}</td>
                <td className="px-3 py-2 font-mono text-xs">{it.ytAssetId ?? "—"}</td>
                <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{POLICY_LABELS[it.claimPolicy] ?? it.claimPolicy}</Badge></td>
                <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{STATUS_LABELS[it.status] ?? it.status}</Badge></td>
                <td className="px-3 py-2 text-xs">{it.ownership}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditing(it); setOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-400" onClick={() => remove(it.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ItemDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={load} />
    </div>
  );
}

function ItemDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Item | null;
  onSaved: () => Promise<void>;
}) {
  const [assetType, setAssetType] = useState<"track" | "release">("track");
  const [assetId, setAssetId] = useState<string>("");
  const [ytAssetId, setYtAssetId] = useState("");
  const [status, setStatus] = useState<Item["status"]>("pending");
  const [claimPolicy, setClaimPolicy] = useState<Item["claimPolicy"]>("monetize");
  const [ownership, setOwnership] = useState("WW");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setAssetType(editing?.assetType ?? "track");
      setAssetId(String(editing?.trackId ?? editing?.releaseId ?? ""));
      setYtAssetId(editing?.ytAssetId ?? "");
      setStatus(editing?.status ?? "pending");
      setClaimPolicy(editing?.claimPolicy ?? "monetize");
      setOwnership(editing?.ownership ?? "WW");
      setNotes(editing?.notes ?? "");
    }
  }, [open, editing]);

  async function save() {
    try {
      const numId = Number(assetId);
      if (!Number.isFinite(numId) || numId <= 0) {
        toast({ title: "Ошибка", description: "Укажите ID актива", variant: "destructive" });
        return;
      }
      const body = {
        assetType,
        trackId: assetType === "track" ? numId : null,
        releaseId: assetType === "release" ? numId : null,
        ytAssetId: ytAssetId || null,
        status, claimPolicy, ownership: ownership || "WW",
        notes: notes || null,
      };
      if (editing) {
        await api(`/api/rights/content-id/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api("/api/rights/content-id", { method: "POST", body: JSON.stringify(body) });
      }
      await onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Ошибка сохранения", description: String((e as Error).message), variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Редактировать" : "Новая регистрация Content ID"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Тип</Label>
              <Select value={assetType} onValueChange={(v) => setAssetType(v as "track" | "release")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="track">Трек</SelectItem>
                  <SelectItem value="release">Релиз</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">ID актива</Label><Input type="number" value={assetId} onChange={(e) => setAssetId(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">YouTube Asset ID</Label><Input value={ytAssetId} onChange={(e) => setYtAssetId(e.target.value)} placeholder="A1BcDeFgHiJk..." /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Статус</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Item["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((k) => (
                    <SelectItem key={k} value={k}>{STATUS_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Политика</Label>
              <Select value={claimPolicy} onValueChange={(v) => setClaimPolicy(v as Item["claimPolicy"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(POLICY_LABELS) as Array<keyof typeof POLICY_LABELS>).map((k) => (
                    <SelectItem key={k} value={k}>{POLICY_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">Владение</Label><Input value={ownership} onChange={(e) => setOwnership(e.target.value)} placeholder="WW" /></div>
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
