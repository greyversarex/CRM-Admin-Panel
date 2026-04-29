/**
 * Analytics / Realtime Alerts tab — алерты в реальном времени (spike/drop/fraud/payment_failed).
 */
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { adminApi, fmtDate } from "@/lib/admin-api";

interface Alert {
  id: number;
  kind: string;
  severity: string;
  message: string;
  entityType: string | null;
  entityId: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

const SEV_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline", medium: "secondary", high: "default", critical: "destructive",
};

export function RealtimeTab() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [form, setForm] = useState({ kind: "spike", severity: "medium", message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter === "open" ? "?status=open" : "";
      const r = await adminApi<{ alerts: Alert[]; openCount: number }>(`/api/analytics/realtime-alerts${qs}`);
      setAlerts(r.alerts); setOpenCount(r.openCount);
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setLoading(false);
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    try {
      await adminApi("/api/analytics/realtime-alerts", { method: "POST", body: JSON.stringify(form) });
      setOpen(false); setForm({ kind: "spike", severity: "medium", message: "" });
      await load();
      toast({ title: "Алерт создан" });
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  const resolve = async (id: number, resolved: boolean) => {
    try {
      await adminApi(`/api/analytics/realtime-alerts/${id}`, { method: "PATCH", body: JSON.stringify({ resolved }) });
      await load();
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Алерты реального времени</h3>
          <p className="text-xs text-muted-foreground">Открытых: <Badge variant={openCount > 0 ? "destructive" : "secondary"}>{openCount}</Badge></p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as "open" | "all")}>
            <SelectTrigger className="w-32" data-testid="select-alert-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Только открытые</SelectItem>
              <SelectItem value="all">Все</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh-alerts">
            <RefreshCw className="h-4 w-4 mr-1" /> Обновить
          </Button>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="button-add-alert"><Plus className="h-4 w-4 mr-1" /> Создать</Button>
        </div>
      </div>

      <div className="rounded-md border bg-card divide-y">
        {alerts.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Алертов нет.</div>
        ) : alerts.map((a) => (
          <div key={a.id} className="p-3 flex items-center justify-between" data-testid={`row-alert-${a.id}`}>
            <div className="flex items-center gap-3">
              {a.resolvedAt ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-orange-500" />}
              <div className="text-sm">
                <div className="font-medium">
                  {a.message}
                  <Badge variant="outline" className="ml-2">{a.kind}</Badge>
                  <Badge variant={SEV_VARIANT[a.severity] ?? "secondary"} className="ml-2">{a.severity}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.entityType ? `${a.entityType}#${a.entityId} · ` : ""}{fmtDate(a.createdAt)}
                  {a.resolvedAt ? ` · решено ${fmtDate(a.resolvedAt)}` : ""}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void resolve(a.id, !a.resolvedAt)} data-testid={`button-toggle-alert-${a.id}`}>
              {a.resolvedAt ? "Открыть" : "Решить"}
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Новый алерт</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Тип</Label>
              <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
                <SelectTrigger data-testid="select-alert-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spike">Всплеск</SelectItem>
                  <SelectItem value="drop">Падение</SelectItem>
                  <SelectItem value="fraud">Мошенничество</SelectItem>
                  <SelectItem value="takedown">Takedown</SelectItem>
                  <SelectItem value="system_error">Системная ошибка</SelectItem>
                  <SelectItem value="payment_failed">Сбой платежа</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Важность</Label>
              <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>
                <SelectTrigger data-testid="select-alert-severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Низкая</SelectItem>
                  <SelectItem value="medium">Средняя</SelectItem>
                  <SelectItem value="high">Высокая</SelectItem>
                  <SelectItem value="critical">Критическая</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Сообщение</Label><Input value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} data-testid="input-alert-message" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => void create()} data-testid="button-save-alert">Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
