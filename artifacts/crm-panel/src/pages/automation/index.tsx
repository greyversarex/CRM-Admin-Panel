import { useEffect, useState, useCallback } from "react";
import { Workflow, Clock, ShieldAlert, Filter, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Layout } from "@/components/layout";
import { toast } from "@/hooks/use-toast";
import { PaymentRulesTab } from "./payment-rules-tab";

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

// ─── Workflow rules: read-only summary linking to Communications ────────────

function WorkflowRulesTab() {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-6">
      <Workflow className="h-7 w-7 text-cyan-400 mb-3" />
      <h3 className="font-semibold mb-1">Правила автоматизации сообщений</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Триггеры и шаблоны сообщений настраиваются в разделе «Коммуникации».
      </p>
      <div className="flex gap-2">
        <Button size="sm" asChild>
          <a href="/communications">Открыть «Коммуникации»</a>
        </Button>
      </div>
    </div>
  );
}

// ─── Scheduled tasks ────────────────────────────────────────────────────────

type ScheduledTask = {
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
};

function ScheduledTab() {
  const [items, setItems] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api<{ tasks: ScheduledTask[] }>("/api/automation/scheduled"); setItems(r.tasks); }
    catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Фоновых задач: {items.length}</div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Обновить
        </Button>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/50 border-b border-border/50">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Задача</th>
              <th className="px-3 py-2">Описание</th>
              <th className="px-3 py-2">Расписание</th>
              <th className="px-3 py-2">Статус</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">Нет задач</td></tr>
            )}
            {items.map((t) => (
              <tr key={t.name} className="border-t border-border/30 hover:bg-card/30">
                <td className="px-3 py-2 font-medium font-mono text-xs">{t.name}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{t.description}</td>
                <td className="px-3 py-2 text-xs">{t.schedule}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={`text-[10px] ${
                    t.enabled ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                              : "bg-slate-500/15 text-slate-400 border-slate-500/25"
                  }`}>
                    {t.enabled ? "Активна" : "Выключена"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Fraud rules ────────────────────────────────────────────────────────────

type FraudRule = {
  id: number;
  name: string;
  ruleType: string;
  threshold: number;
  windowMinutes: number;
  severity: "low" | "medium" | "high" | "critical";
  enabled: boolean;
  notes: string | null;
  createdAt: string;
};

const FRAUD_RULE_TYPES = [
  { value: "spike_streams",  label: "Аномальный всплеск стримов" },
  { value: "low_completion", label: "Низкая дослушанность" },
  { value: "geo_burst",      label: "Гео-всплеск" },
  { value: "duplicate_play", label: "Повторные прослушивания" },
  { value: "stream_botting", label: "Подозрение на бот-трафик" },
  { value: "custom",         label: "Кастомное правило" },
];

const SEVERITY_LABELS: Record<string, string> = {
  low: "Низкая", medium: "Средняя", high: "Высокая", critical: "Критическая",
};

function FraudRulesTab() {
  const [rules, setRules] = useState<FraudRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FraudRule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api<{ rules: FraudRule[] }>("/api/automation/fraud-rules"); setRules(r.rules); }
    catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(id: number) {
    if (!confirm("Удалить правило?")) return;
    try { await api(`/api/automation/fraud-rules/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Правил: {rules.length}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Обновить
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Новое правило
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/50 border-b border-border/50">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Название</th>
              <th className="px-3 py-2">Тип</th>
              <th className="px-3 py-2">Порог</th>
              <th className="px-3 py-2">Окно</th>
              <th className="px-3 py-2">Серьёзность</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">Правил нет</td></tr>
            )}
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-border/30 hover:bg-card/30">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-xs">{FRAUD_RULE_TYPES.find((x) => x.value === r.ruleType)?.label ?? r.ruleType}</td>
                <td className="px-3 py-2 text-xs">{r.threshold ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.windowMinutes ? `${r.windowMinutes} мин` : "—"}</td>
                <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{SEVERITY_LABELS[r.severity]}</Badge></td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={`text-[10px] ${r.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"}`}>
                    {r.enabled ? "Активно" : "Выкл"}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditing(r); setOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-400" onClick={() => remove(r.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FraudRuleDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={load} />
    </div>
  );
}

function FraudRuleDialog({
  open, onOpenChange, editing, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; editing: FraudRule | null; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState("spike_streams");
  const [threshold, setThreshold] = useState<string>("0");
  const [windowMinutes, setWindowMinutes] = useState<string>("60");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setRuleType(editing?.ruleType ?? "spike_streams");
      setThreshold(String(editing?.threshold ?? 0));
      setWindowMinutes(String(editing?.windowMinutes ?? 60));
      setSeverity(editing?.severity ?? "medium");
      setEnabled(editing?.enabled ?? true);
    }
  }, [open, editing]);

  async function save() {
    try {
      const body = {
        name, ruleType,
        threshold: Number(threshold) || 0,
        windowMinutes: Number(windowMinutes) || 60,
        severity, enabled,
      };
      if (editing) await api(`/api/automation/fraud-rules/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else         await api("/api/automation/fraud-rules", { method: "POST", body: JSON.stringify(body) });
      await onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Редактировать правило" : "Новое правило фрод-мониторинга"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Название</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Тип</Label>
            <Select value={ruleType} onValueChange={setRuleType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FRAUD_RULE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Порог</Label><Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="например, 1000" /></div>
            <div><Label className="text-xs">Окно (минуты)</Label><Input type="number" value={windowMinutes} onChange={(e) => setWindowMinutes(e.target.value)} /></div>
          </div>
          <div>
            <Label className="text-xs">Серьёзность</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SEVERITY_LABELS) as Array<keyof typeof SEVERITY_LABELS>).map((k) => (
                  <SelectItem key={k} value={k}>{SEVERITY_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
            <Label htmlFor="enabled" className="text-xs cursor-pointer">Активно</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={save}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Moderation rules ──────────────────────────────────────────────────────

type ModRule = {
  id: number;
  name: string;
  field: string;
  ruleType: "required" | "regex" | "min_length" | "max_length" | "blocklist";
  pattern: string | null;
  minLength: number | null;
  maxLength: number | null;
  blockOnFail: boolean;
  severity: "info" | "warning" | "error";
  notes: string | null;
  enabled: boolean;
  createdAt: string;
};

const MOD_KIND_LABELS: Record<string, string> = {
  required: "Обязательное поле", regex: "Регулярное выражение",
  min_length: "Минимальная длина", max_length: "Максимальная длина",
  blocklist: "Чёрный список слов",
};
const MOD_SEVERITY_LABELS: Record<string, string> = {
  info: "Инфо", warning: "Предупреждение", error: "Ошибка",
};

function ModerationRulesTab() {
  const [rules, setRules] = useState<ModRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ModRule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api<{ rules: ModRule[] }>("/api/automation/moderation-rules"); setRules(r.rules); }
    catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(id: number) {
    if (!confirm("Удалить правило?")) return;
    try { await api(`/api/automation/moderation-rules/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Правил модерации: {rules.length}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Обновить
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Новое правило
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/50 border-b border-border/50">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Название</th>
              <th className="px-3 py-2">Поле</th>
              <th className="px-3 py-2">Тип проверки</th>
              <th className="px-3 py-2">Параметр</th>
              <th className="px-3 py-2">Серьёзность</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">Правил нет</td></tr>
            )}
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-border/30 hover:bg-card/30">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.field}</td>
                <td className="px-3 py-2">{MOD_KIND_LABELS[r.ruleType]}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.ruleType === "min_length" ? r.minLength :
                   r.ruleType === "max_length" ? r.maxLength :
                   (r.pattern ?? "—")}
                </td>
                <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{MOD_SEVERITY_LABELS[r.severity]}</Badge></td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={`text-[10px] ${r.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"}`}>
                    {r.enabled ? "Активно" : "Выкл"}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditing(r); setOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-400" onClick={() => remove(r.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ModRuleDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={load} />
    </div>
  );
}

function ModRuleDialog({
  open, onOpenChange, editing, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; editing: ModRule | null; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [field, setField] = useState("");
  const [ruleType, setRuleType] = useState<ModRule["ruleType"]>("required");
  const [pattern, setPattern] = useState("");
  const [minLength, setMinLength] = useState<string>("");
  const [maxLength, setMaxLength] = useState<string>("");
  const [severity, setSeverity] = useState<ModRule["severity"]>("warning");
  const [blockOnFail, setBlockOnFail] = useState(false);
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setField(editing?.field ?? "");
      setRuleType(editing?.ruleType ?? "required");
      setPattern(editing?.pattern ?? "");
      setMinLength(editing?.minLength != null ? String(editing.minLength) : "");
      setMaxLength(editing?.maxLength != null ? String(editing.maxLength) : "");
      setSeverity(editing?.severity ?? "warning");
      setBlockOnFail(editing?.blockOnFail ?? false);
      setNotes(editing?.notes ?? "");
      setEnabled(editing?.enabled ?? true);
    }
  }, [open, editing]);

  async function save() {
    try {
      const body = {
        name, field, ruleType,
        pattern: pattern || null,
        minLength: minLength ? Number(minLength) : null,
        maxLength: maxLength ? Number(maxLength) : null,
        blockOnFail, severity, enabled,
        notes: notes || null,
      };
      if (editing) await api(`/api/automation/moderation-rules/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else         await api("/api/automation/moderation-rules", { method: "POST", body: JSON.stringify(body) });
      await onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Редактировать" : "Новое правило модерации"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Название</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Запрет нецензурной лексики" /></div>
          <div><Label className="text-xs">Поле</Label><Input value={field} onChange={(e) => setField(e.target.value)} placeholder="release.title" /></div>
          <div>
            <Label className="text-xs">Тип проверки</Label>
            <Select value={ruleType} onValueChange={(v) => setRuleType(v as ModRule["ruleType"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MOD_KIND_LABELS) as Array<keyof typeof MOD_KIND_LABELS>).map((k) => (
                  <SelectItem key={k} value={k}>{MOD_KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(ruleType === "regex" || ruleType === "blocklist") && (
            <div><Label className="text-xs">Паттерн / список через запятую</Label><Input value={pattern} onChange={(e) => setPattern(e.target.value)} /></div>
          )}
          {ruleType === "min_length" && (
            <div><Label className="text-xs">Минимальная длина</Label><Input type="number" value={minLength} onChange={(e) => setMinLength(e.target.value)} /></div>
          )}
          {ruleType === "max_length" && (
            <div><Label className="text-xs">Максимальная длина</Label><Input type="number" value={maxLength} onChange={(e) => setMaxLength(e.target.value)} /></div>
          )}
          <div>
            <Label className="text-xs">Серьёзность</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as ModRule["severity"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MOD_SEVERITY_LABELS) as Array<keyof typeof MOD_SEVERITY_LABELS>).map((k) => (
                  <SelectItem key={k} value={k}>{MOD_SEVERITY_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Примечание</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="m-block" checked={blockOnFail} onChange={(e) => setBlockOnFail(e.target.checked)} className="h-4 w-4" />
            <Label htmlFor="m-block" className="text-xs cursor-pointer">Блокировать публикацию при нарушении</Label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="m-enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
            <Label htmlFor="m-enabled" className="text-xs cursor-pointer">Активно</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={save}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function AutomationPage() {
  return (
    <Layout>
      <div className="space-y-6 p-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-semibold">Автоматизация</h1>
          <p className="text-sm text-muted-foreground mt-1">Workflow-правила, фоновые задачи, фрод-мониторинг и модерация</p>
        </div>

        <Tabs defaultValue="workflow">
          <TabsList>
            <TabsTrigger value="workflow"   className="gap-1.5"><Workflow className="h-3.5 w-3.5" /> Workflow Rules</TabsTrigger>
            <TabsTrigger value="scheduled"  className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Scheduled Tasks</TabsTrigger>
            <TabsTrigger value="fraud"      className="gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Fraud Detection</TabsTrigger>
            <TabsTrigger value="moderation" className="gap-1.5"><Filter className="h-3.5 w-3.5" /> Content Moderation</TabsTrigger>
            <TabsTrigger value="payments"   className="gap-1.5">Платежи</TabsTrigger>
          </TabsList>
          <TabsContent value="workflow"   className="mt-4"><WorkflowRulesTab /></TabsContent>
          <TabsContent value="scheduled"  className="mt-4"><ScheduledTab /></TabsContent>
          <TabsContent value="fraud"      className="mt-4"><FraudRulesTab /></TabsContent>
          <TabsContent value="moderation" className="mt-4"><ModerationRulesTab /></TabsContent>
          <TabsContent value="payments"   className="mt-4"><PaymentRulesTab /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
