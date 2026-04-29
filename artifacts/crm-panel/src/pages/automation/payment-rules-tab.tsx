/**
 * Automation / Payment Rules tab — авто-одобрение, минимальный порог, плановые выплаты.
 */
import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { adminApi, fmtDate } from "@/lib/admin-api";

interface PaymentRule {
  id: number;
  name: string;
  kind: string;
  thresholdCents: number;
  scheduleCron: string | null;
  enabled: boolean;
  notes: string | null;
  lastRunAt: string | null;
}

const KIND_LABEL: Record<string, string> = {
  auto_approve_below: "Авто-одобрение ниже порога",
  scheduled_payout: "Плановая выплата (cron)",
  min_payout_threshold: "Минимальный порог выплаты",
  auto_reject_failed_kyc: "Авто-отклонение при отказе KYC",
};

export function PaymentRulesTab() {
  const [rules, setRules] = useState<PaymentRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "auto_approve_below", thresholdCents: "10000", scheduleCron: "", enabled: true, notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi<{ rules: PaymentRule[] }>("/api/automation/payment-rules");
      setRules(r.rules);
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    try {
      await adminApi("/api/automation/payment-rules", { method: "POST", body: JSON.stringify({
        name: form.name, kind: form.kind,
        thresholdCents: Number(form.thresholdCents),
        scheduleCron: form.scheduleCron || null,
        enabled: form.enabled, notes: form.notes || null,
      })});
      setOpen(false); setForm({ name: "", kind: "auto_approve_below", thresholdCents: "10000", scheduleCron: "", enabled: true, notes: "" });
      await load();
      toast({ title: "Правило создано" });
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  const toggle = async (r: PaymentRule) => {
    try {
      await adminApi(`/api/automation/payment-rules/${r.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !r.enabled }) });
      await load();
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  const remove = async (id: number) => {
    if (!confirm("Удалить правило?")) return;
    try {
      await adminApi(`/api/automation/payment-rules/${id}`, { method: "DELETE" });
      await load();
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Правила автоматизации платежей</h3>
          <p className="text-xs text-muted-foreground">Автоматическое одобрение, плановые выплаты и пороги.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh-payment-rules">
            <RefreshCw className="h-4 w-4 mr-1" /> Обновить
          </Button>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="button-add-payment-rule"><Plus className="h-4 w-4 mr-1" /> Добавить</Button>
        </div>
      </div>

      <div className="rounded-md border bg-card divide-y">
        {rules.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Нет правил.</div>
        ) : rules.map((r) => (
          <div key={r.id} className="p-3 flex items-center justify-between" data-testid={`row-payment-rule-${r.id}`}>
            <div className="flex items-center gap-3">
              <Switch checked={r.enabled} onCheckedChange={() => void toggle(r)} data-testid={`switch-payment-rule-${r.id}`} />
              <div className="text-sm">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  <Badge variant="outline" className="mr-2">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                  Порог: ${(r.thresholdCents / 100).toFixed(2)}
                  {r.scheduleCron ? ` · ${r.scheduleCron}` : ""}
                  {r.lastRunAt ? ` · last: ${fmtDate(r.lastRunAt)}` : ""}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => void remove(r.id)} data-testid={`button-delete-payment-rule-${r.id}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Новое правило</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Название</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="input-rule-name" /></div>
            <div>
              <Label>Тип</Label>
              <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
                <SelectTrigger data-testid="select-rule-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABEL).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Порог (центы)</Label><Input type="number" value={form.thresholdCents} onChange={(e) => setForm((f) => ({ ...f, thresholdCents: e.target.value }))} data-testid="input-rule-threshold" /></div>
            <div><Label>Cron-расписание (если плановая)</Label><Input placeholder="0 9 * * 1" value={form.scheduleCron} onChange={(e) => setForm((f) => ({ ...f, scheduleCron: e.target.value }))} data-testid="input-rule-cron" /></div>
            <div className="flex items-center gap-2"><Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} data-testid="switch-rule-enabled" /><Label>Включено</Label></div>
            <div><Label>Заметки</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} data-testid="input-rule-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => void create()} data-testid="button-save-rule">Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
