import { useState, useEffect, useCallback } from "react";
import {
  Shield, AlertTriangle, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  RefreshCw, CheckCircle2, XCircle, Clock, Search, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

// ─── Types ──────────────────────────────────────────────────────────────────

type RightsHolder = {
  id: number;
  assetType: "track" | "release";
  trackId: number | null;
  releaseId: number | null;
  assetTitle: string | null;
  holderType: "artist" | "label" | "publisher" | "distributor" | "other";
  holderName: string;
  holderArtistId: number | null;
  holderLabelId: number | null;
  rightsType: "master" | "sync" | "mechanical" | "neighboring" | "all";
  sharePct: number;
  territory: string;
  exclusive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  notes: string | null;
  createdAt: string;
};

type RightsConflict = {
  id: number;
  assetType: "track" | "release";
  trackId: number | null;
  releaseId: number | null;
  assetTitle: string | null;
  conflictType: "dsp_claim" | "acr_flag" | "manual_dispute" | "territorial_overlap";
  claimantName: string;
  claimantInfo: string | null;
  status: "open" | "investigating" | "resolved" | "dismissed" | "escalated";
  priority: "low" | "medium" | "high" | "critical";
  description: string;
  resolutionNote: string | null;
  openedByName: string | null;
  resolvedByName: string | null;
  openedAt: string;
  resolvedAt: string | null;
};

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Label helpers ───────────────────────────────────────────────────────────

const RIGHTS_TYPE_LABELS: Record<string, string> = {
  master: "Мастер", sync: "Синхро", mechanical: "Механика",
  neighboring: "Смежные", all: "Все права",
};
const HOLDER_TYPE_LABELS: Record<string, string> = {
  artist: "Артист", label: "Лейбл", publisher: "Паблишер",
  distributor: "Дистрибьютор", other: "Прочие",
};
const CONFLICT_TYPE_LABELS: Record<string, string> = {
  dsp_claim: "Claim DSP", acr_flag: "ACR-флаг",
  manual_dispute: "Ручной спор", territorial_overlap: "Территориальный конфликт",
};
const STATUS_LABELS: Record<string, string> = {
  open: "Открыт", investigating: "Расследуется",
  resolved: "Решён", dismissed: "Снят", escalated: "Эскалирован",
};
const PRIORITY_LABELS: Record<string, string> = {
  low: "Низкий", medium: "Средний", high: "Высокий", critical: "Критический",
};

function statusBadge(s: string) {
  const colors: Record<string, string> = {
    open: "bg-rose-500/15 text-rose-400 border-rose-500/25",
    investigating: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    resolved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    dismissed: "bg-slate-500/15 text-slate-400 border-slate-500/25",
    escalated: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  };
  return <Badge variant="outline" className={`text-[10px] ${colors[s] ?? ""}`}>{STATUS_LABELS[s] ?? s}</Badge>;
}

function priorityBadge(p: string) {
  const colors: Record<string, string> = {
    low: "bg-slate-500/15 text-slate-400 border-slate-500/25",
    medium: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    high: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    critical: "bg-rose-500/15 text-rose-400 border-rose-500/25",
  };
  return <Badge variant="outline" className={`text-[10px] ${colors[p] ?? ""}`}>{PRIORITY_LABELS[p] ?? p}</Badge>;
}

// ─── Holder Dialog ────────────────────────────────────────────────────────────

type HolderForm = {
  assetType: "track" | "release";
  trackId: string;
  releaseId: string;
  holderType: "artist" | "label" | "publisher" | "distributor" | "other";
  holderName: string;
  holderArtistId: string;
  holderLabelId: string;
  rightsType: "master" | "sync" | "mechanical" | "neighboring" | "all";
  sharePct: string;
  territory: string;
  exclusive: boolean;
  startsAt: string;
  endsAt: string;
  notes: string;
};

const defaultHolderForm = (): HolderForm => ({
  assetType: "track", trackId: "", releaseId: "",
  holderType: "artist", holderName: "", holderArtistId: "", holderLabelId: "",
  rightsType: "master", sharePct: "100", territory: "WW", exclusive: false,
  startsAt: "", endsAt: "", notes: "",
});

function HolderDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: RightsHolder | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<HolderForm>(defaultHolderForm());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        assetType: editing.assetType,
        trackId: editing.trackId?.toString() ?? "",
        releaseId: editing.releaseId?.toString() ?? "",
        holderType: editing.holderType,
        holderName: editing.holderName,
        holderArtistId: editing.holderArtistId?.toString() ?? "",
        holderLabelId: editing.holderLabelId?.toString() ?? "",
        rightsType: editing.rightsType,
        sharePct: String(editing.sharePct),
        territory: editing.territory,
        exclusive: editing.exclusive,
        startsAt: editing.startsAt ? editing.startsAt.slice(0, 10) : "",
        endsAt: editing.endsAt ? editing.endsAt.slice(0, 10) : "",
        notes: editing.notes ?? "",
      });
    } else {
      setForm(defaultHolderForm());
    }
  }, [open, editing]);

  const upd = (k: keyof HolderForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async () => {
    if (!form.holderName.trim()) { toast({ variant: "destructive", title: "Заполните имя владельца" }); return; }
    if (form.assetType === "track" && !form.trackId)     { toast({ variant: "destructive", title: "Укажите ID трека" }); return; }
    if (form.assetType === "release" && !form.releaseId) { toast({ variant: "destructive", title: "Укажите ID релиза" }); return; }
    setBusy(true);
    try {
      const body = {
        assetType: form.assetType,
        trackId: form.trackId    ? parseInt(form.trackId, 10)    : null,
        releaseId: form.releaseId ? parseInt(form.releaseId, 10) : null,
        holderType: form.holderType,
        holderName: form.holderName.trim(),
        holderArtistId: form.holderArtistId ? parseInt(form.holderArtistId, 10) : null,
        holderLabelId:  form.holderLabelId  ? parseInt(form.holderLabelId,  10) : null,
        rightsType: form.rightsType,
        sharePct: parseFloat(form.sharePct) || 100,
        territory: form.territory.trim() || "WW",
        exclusive: form.exclusive,
        startsAt: form.startsAt ? `${form.startsAt}T00:00:00Z` : null,
        endsAt: form.endsAt ? `${form.endsAt}T23:59:59Z` : null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await apiFetch(`/api/rights/holders/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        toast({ title: "Запись обновлена" });
      } else {
        await apiFetch("/api/rights/holders", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Запись добавлена" });
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Редактировать владельца прав" : "Добавить владельца прав"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="space-y-1.5">
            <Label>Тип актива</Label>
            <Select value={form.assetType} onValueChange={(v) => upd("assetType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="track">Трек</SelectItem>
                <SelectItem value="release">Релиз</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{form.assetType === "track" ? "ID трека" : "ID релиза"}</Label>
            <Input
              type="number" min={1}
              value={form.assetType === "track" ? form.trackId : form.releaseId}
              onChange={(e) => upd(form.assetType === "track" ? "trackId" : "releaseId", e.target.value)}
              placeholder={form.assetType === "track" ? "123" : "456"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Тип владельца</Label>
            <Select value={form.holderType} onValueChange={(v) => upd("holderType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(HOLDER_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Имя владельца</Label>
            <Input value={form.holderName} onChange={(e) => upd("holderName", e.target.value)} placeholder="Rустам Назаров" />
          </div>
          {form.holderType === "artist" && (
            <div className="space-y-1.5">
              <Label>ID артиста в системе (если есть)</Label>
              <Input type="number" min={1} value={form.holderArtistId} onChange={(e) => upd("holderArtistId", e.target.value)} placeholder="опционально" />
            </div>
          )}
          {form.holderType === "label" && (
            <div className="space-y-1.5">
              <Label>ID лейбла в системе (если есть)</Label>
              <Input type="number" min={1} value={form.holderLabelId} onChange={(e) => upd("holderLabelId", e.target.value)} placeholder="опционально" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Вид прав</Label>
            <Select value={form.rightsType} onValueChange={(v) => upd("rightsType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RIGHTS_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Доля (%)</Label>
            <Input type="number" min={0} max={100} step={0.1} value={form.sharePct} onChange={(e) => upd("sharePct", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Территория</Label>
            <Input value={form.territory} onChange={(e) => upd("territory", e.target.value)} placeholder="WW или RU,KZ,TJ" />
          </div>
          <div className="space-y-1.5">
            <Label>Действует с</Label>
            <Input type="date" value={form.startsAt} onChange={(e) => upd("startsAt", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Действует до</Label>
            <Input type="date" value={form.endsAt} onChange={(e) => upd("endsAt", e.target.value)} />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              id="exclusive" type="checkbox"
              checked={form.exclusive}
              onChange={(e) => upd("exclusive", e.target.checked)}
              className="h-4 w-4 rounded border border-border"
            />
            <label htmlFor="exclusive" className="text-sm">Эксклюзивные права</label>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Примечания</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => upd("notes", e.target.value)} placeholder="Источник, договор №, особые условия..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button disabled={busy} onClick={onSubmit}>
            {busy ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
            {editing ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Conflict Dialog ──────────────────────────────────────────────────────────

type ConflictForm = {
  assetType: "track" | "release";
  trackId: string;
  releaseId: string;
  conflictType: "dsp_claim" | "acr_flag" | "manual_dispute" | "territorial_overlap";
  claimantName: string;
  claimantInfo: string;
  priority: "low" | "medium" | "high" | "critical";
  description: string;
};

const defaultConflictForm = (): ConflictForm => ({
  assetType: "track", trackId: "", releaseId: "",
  conflictType: "dsp_claim", claimantName: "", claimantInfo: "",
  priority: "medium", description: "",
});

function ConflictDialog({
  open, onOpenChange, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ConflictForm>(defaultConflictForm());
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setForm(defaultConflictForm()); }, [open]);

  const upd = (k: keyof ConflictForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async () => {
    if (!form.claimantName.trim()) { toast({ variant: "destructive", title: "Укажите заявителя" }); return; }
    if (!form.description.trim())  { toast({ variant: "destructive", title: "Заполните описание" }); return; }
    if (form.assetType === "track" && !form.trackId)     { toast({ variant: "destructive", title: "Укажите ID трека" }); return; }
    if (form.assetType === "release" && !form.releaseId) { toast({ variant: "destructive", title: "Укажите ID релиза" }); return; }
    setBusy(true);
    try {
      await apiFetch("/api/rights/conflicts", {
        method: "POST",
        body: JSON.stringify({
          assetType: form.assetType,
          trackId: form.trackId    ? parseInt(form.trackId, 10)    : null,
          releaseId: form.releaseId ? parseInt(form.releaseId, 10) : null,
          conflictType: form.conflictType,
          claimantName: form.claimantName.trim(),
          claimantInfo: form.claimantInfo.trim() || null,
          priority: form.priority,
          description: form.description.trim(),
        }),
      });
      toast({ title: "Конфликт зарегистрирован" });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Зарегистрировать конфликт</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="space-y-1.5">
            <Label>Тип актива</Label>
            <Select value={form.assetType} onValueChange={(v) => upd("assetType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="track">Трек</SelectItem>
                <SelectItem value="release">Релиз</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{form.assetType === "track" ? "ID трека" : "ID релиза"}</Label>
            <Input
              type="number" min={1}
              value={form.assetType === "track" ? form.trackId : form.releaseId}
              onChange={(e) => upd(form.assetType === "track" ? "trackId" : "releaseId", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Тип конфликта</Label>
            <Select value={form.conflictType} onValueChange={(v) => upd("conflictType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CONFLICT_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Приоритет</Label>
            <Select value={form.priority} onValueChange={(v) => upd("priority", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Заявитель</Label>
            <Input value={form.claimantName} onChange={(e) => upd("claimantName", e.target.value)} placeholder="Spotify / ООО «Ромашка»" />
          </div>
          <div className="space-y-1.5">
            <Label>Доп. информация (Claim ID, ссылка)</Label>
            <Input value={form.claimantInfo} onChange={(e) => upd("claimantInfo", e.target.value)} placeholder="Claim #12345678" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Описание</Label>
            <Textarea rows={4} value={form.description} onChange={(e) => upd("description", e.target.value)} placeholder="Подробно опишите суть конфликта..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button disabled={busy} onClick={onSubmit}>
            {busy ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
            Зарегистрировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Conflict Row (expandable) ────────────────────────────────────────────────

function ConflictRow({
  c, isAdmin, onStatusChange, onDelete,
}: {
  c: RightsConflict;
  isAdmin: boolean;
  onStatusChange: (id: number, status: string, note?: string) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newStatus, setNewStatus] = useState(c.status);
  const [note, setNote] = useState(c.resolutionNote ?? "");

  const isClosed = c.status === "resolved" || c.status === "dismissed";

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto] items-center gap-2">
          <div className="min-w-0">
            <span className="font-medium text-sm truncate block">{c.assetTitle ?? `${c.assetType} #${c.trackId ?? c.releaseId}`}</span>
            <span className="text-xs text-muted-foreground">{CONFLICT_TYPE_LABELS[c.conflictType]} · {c.claimantName}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {priorityBadge(c.priority)}
            {statusBadge(c.status)}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-3 bg-muted/10">
          <p className="text-sm whitespace-pre-wrap">{c.description}</p>
          {c.claimantInfo && <p className="text-xs text-muted-foreground">Доп. инфо: {c.claimantInfo}</p>}
          <div className="text-xs text-muted-foreground flex gap-4 flex-wrap">
            <span>Открыт: {new Date(c.openedAt).toLocaleDateString("ru")}{c.openedByName ? ` (${c.openedByName})` : ""}</span>
            {c.resolvedAt && <span>Закрыт: {new Date(c.resolvedAt).toLocaleDateString("ru")}{c.resolvedByName ? ` (${c.resolvedByName})` : ""}</span>}
          </div>
          {c.resolutionNote && (
            <div className="rounded bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-300">
              <span className="font-medium">Резолюция: </span>{c.resolutionNote}
            </div>
          )}

          {isAdmin && !isClosed && (
            <div className="flex gap-2 flex-wrap items-end pt-1">
              <div className="space-y-1">
                <Label className="text-[11px]">Изменить статус</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as typeof newStatus)}>
                  <SelectTrigger className="h-7 text-xs w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-[11px]">Примечание о решении</Label>
                <Input className="h-7 text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Что было сделано..." />
              </div>
              <Button size="sm" className="h-7 text-xs" onClick={() => onStatusChange(c.id, newStatus, note)}>
                Обновить
              </Button>
            </div>
          )}

          {isAdmin && (
            <div className="pt-1 flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-400 hover:text-rose-300" onClick={() => onDelete(c.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Удалить
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function RightsManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "manager";

  // ── Holders state ──────────────────────────────────────────────────────────
  const [holders, setHolders] = useState<RightsHolder[]>([]);
  const [holdersTotal, setHoldersTotal] = useState(0);
  const [holdersPage, setHoldersPage] = useState(1);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [holderTypeFilter, setHolderTypeFilter] = useState("all");
  const [rightsTypeFilter, setRightsTypeFilter] = useState("all");
  const [holderSearch, setHolderSearch] = useState("");
  const [holderDialogOpen, setHolderDialogOpen] = useState(false);
  const [editingHolder, setEditingHolder] = useState<RightsHolder | null>(null);

  // ── Conflicts state ────────────────────────────────────────────────────────
  const [conflicts, setConflicts] = useState<RightsConflict[]>([]);
  const [conflictsTotal, setConflictsTotal] = useState(0);
  const [conflictsPage, setConflictsPage] = useState(1);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [conflictTypeFilter, setConflictTypeFilter] = useState("all");
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);

  const loadHolders = useCallback(async () => {
    setHoldersLoading(true);
    try {
      const params = new URLSearchParams({ page: String(holdersPage), limit: "25" });
      if (holderTypeFilter !== "all") params.set("holder_type", holderTypeFilter);
      if (rightsTypeFilter !== "all") params.set("rights_type", rightsTypeFilter);
      const { data, pagination } = await apiFetch<{ data: RightsHolder[]; pagination: { total: number } }>(`/api/rights/holders?${params}`);
      setHolders(data);
      setHoldersTotal(pagination.total);
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка загрузки", description: (e as Error).message });
    } finally {
      setHoldersLoading(false);
    }
  }, [holdersPage, holderTypeFilter, rightsTypeFilter]);

  const loadConflicts = useCallback(async () => {
    setConflictsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(conflictsPage), limit: "25" });
      if (statusFilter !== "all")       params.set("status", statusFilter);
      if (priorityFilter !== "all")     params.set("priority", priorityFilter);
      if (conflictTypeFilter !== "all") params.set("conflict_type", conflictTypeFilter);
      const { data, pagination } = await apiFetch<{ data: RightsConflict[]; pagination: { total: number } }>(`/api/rights/conflicts?${params}`);
      setConflicts(data);
      setConflictsTotal(pagination.total);
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка загрузки", description: (e as Error).message });
    } finally {
      setConflictsLoading(false);
    }
  }, [conflictsPage, statusFilter, priorityFilter, conflictTypeFilter]);

  useEffect(() => { void loadHolders(); }, [loadHolders]);
  useEffect(() => { void loadConflicts(); }, [loadConflicts]);

  const deleteHolder = async (id: number) => {
    if (!confirm("Удалить запись о владельце прав?")) return;
    try {
      await apiFetch(`/api/rights/holders/${id}`, { method: "DELETE" });
      toast({ title: "Запись удалена" });
      void loadHolders();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    }
  };

  const updateConflictStatus = async (id: number, status: string, note?: string) => {
    try {
      await apiFetch(`/api/rights/conflicts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, resolutionNote: note || undefined }),
      });
      toast({ title: "Статус обновлён" });
      void loadConflicts();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    }
  };

  const deleteConflict = async (id: number) => {
    if (!confirm("Удалить конфликт?")) return;
    try {
      await apiFetch(`/api/rights/conflicts/${id}`, { method: "DELETE" });
      toast({ title: "Конфликт удалён" });
      void loadConflicts();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    }
  };

  const filteredHolders = holderSearch.trim()
    ? holders.filter((h) =>
        h.holderName.toLowerCase().includes(holderSearch.toLowerCase()) ||
        (h.assetTitle ?? "").toLowerCase().includes(holderSearch.toLowerCase())
      )
    : holders;

  const openConflicts   = conflicts.filter((c) => c.status === "open").length;
  const criticalConflicts = conflicts.filter((c) => c.priority === "critical" && c.status !== "resolved" && c.status !== "dismissed").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-violet-400" />
            Управление правами
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Учёт владельцев прав и отслеживание конфликтов по трекам и релизам
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => { setConflictDialogOpen(true); }}>
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-amber-400" /> Конфликт
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" onClick={() => { setEditingHolder(null); setHolderDialogOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Владелец
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Записей о правах", value: holdersTotal, color: "text-violet-400" },
          { label: "Конфликтов", value: conflictsTotal, color: "text-slate-400" },
          { label: "Открытых споров", value: openConflicts, color: openConflicts > 0 ? "text-amber-400" : "text-emerald-400" },
          { label: "Критических", value: criticalConflicts, color: criticalConflicts > 0 ? "text-rose-400" : "text-emerald-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border/50 bg-card p-4">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="holders">
        <TabsList>
          <TabsTrigger value="holders" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Владельцы прав
            {holdersTotal > 0 && <Badge variant="secondary" className="text-[10px] px-1.5 h-4">{holdersTotal}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="conflicts" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Конфликты
            {openConflicts > 0 && <Badge variant="secondary" className="text-[10px] px-1.5 h-4 bg-rose-500/20 text-rose-400">{openConflicts}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: Holders ──────────────────────────────────────────────── */}
        <TabsContent value="holders" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Поиск по имени или активу..."
                value={holderSearch}
                onChange={(e) => setHolderSearch(e.target.value)}
              />
            </div>
            <Select value={holderTypeFilter} onValueChange={setHolderTypeFilter}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Тип владельца" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                {Object.entries(HOLDER_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={rightsTypeFilter} onValueChange={setRightsTypeFilter}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Вид прав" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все виды</SelectItem>
                {Object.entries(RIGHTS_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" className="h-8" onClick={loadHolders} disabled={holdersLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${holdersLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {holdersLoading && holders.length === 0 ? (
            <div className="text-center text-muted-foreground py-16 text-sm">Загрузка…</div>
          ) : filteredHolders.length === 0 ? (
            <div className="text-center text-muted-foreground py-16 text-sm">
              Нет записей о правах.{isAdmin && " Добавьте первого владельца через кнопку выше."}
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Актив</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Владелец</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Права</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Доля</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Территория</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Срок</th>
                    {isAdmin && <th className="px-4 py-2.5 w-16" />}
                  </tr>
                </thead>
                <tbody>
                  {filteredHolders.map((h) => (
                    <tr key={h.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-xs text-muted-foreground">{h.assetType === "track" ? "Трек" : "Релиз"}</div>
                        <div className="font-medium text-sm truncate max-w-44">{h.assetTitle ?? `#${h.trackId ?? h.releaseId}`}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{h.holderName}</div>
                        <div className="text-xs text-muted-foreground">{HOLDER_TYPE_LABELS[h.holderType]}{h.exclusive && " · эксклюзив"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px]">{RIGHTS_TYPE_LABELS[h.rightsType]}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{h.sharePct}%</td>
                      <td className="px-4 py-3 text-sm">{h.territory}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {h.startsAt ? new Date(h.startsAt).toLocaleDateString("ru") : "—"}
                        {h.endsAt ? ` → ${new Date(h.endsAt).toLocaleDateString("ru")}` : h.startsAt ? " → ∞" : ""}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingHolder(h); setHolderDialogOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-400 hover:text-rose-300" onClick={() => deleteHolder(h.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {holdersTotal > 25 && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/30 bg-muted/10">
                  <span className="text-xs text-muted-foreground">Всего {holdersTotal}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={holdersPage <= 1} onClick={() => setHoldersPage((p) => p - 1)}>Назад</Button>
                    <span className="text-xs px-2 py-1">{holdersPage}</span>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={holders.length < 25} onClick={() => setHoldersPage((p) => p + 1)}>Вперёд</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── TAB: Conflicts ─────────────────────────────────────────────── */}
        <TabsContent value="conflicts" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Статус" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Приоритет" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все приоритеты</SelectItem>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={conflictTypeFilter} onValueChange={setConflictTypeFilter}>
              <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Тип конфликта" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                {Object.entries(CONFLICT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" className="h-8" onClick={loadConflicts} disabled={conflictsLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${conflictsLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {conflictsLoading && conflicts.length === 0 ? (
            <div className="text-center text-muted-foreground py-16 text-sm">Загрузка…</div>
          ) : conflicts.length === 0 ? (
            <div className="text-center text-muted-foreground py-16 text-sm">
              Нет зарегистрированных конфликтов.{isAdmin && " Добавьте через кнопку «Конфликт» выше."}
            </div>
          ) : (
            <div className="space-y-2">
              {conflicts.map((c) => (
                <ConflictRow
                  key={c.id} c={c} isAdmin={isAdmin}
                  onStatusChange={updateConflictStatus}
                  onDelete={deleteConflict}
                />
              ))}
              {conflictsTotal > 25 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">Всего {conflictsTotal}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={conflictsPage <= 1} onClick={() => setConflictsPage((p) => p - 1)}>Назад</Button>
                    <span className="text-xs px-2 py-1">{conflictsPage}</span>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={conflicts.length < 25} onClick={() => setConflictsPage((p) => p + 1)}>Вперёд</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <HolderDialog
        open={holderDialogOpen}
        onOpenChange={setHolderDialogOpen}
        editing={editingHolder}
        onSaved={loadHolders}
      />
      <ConflictDialog
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        onSaved={loadConflicts}
      />
    </div>
  );
}
