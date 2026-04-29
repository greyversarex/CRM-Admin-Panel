/**
 * Finance / Commissions tab — глобальные/per-label/per-artist/per-DSP правила.
 */
import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { adminApi, fmtDate } from "@/lib/admin-api";

interface CommissionRule {
  id: number;
  scope: string;
  labelId: number | null;
  artistId: number | null;
  dspCode: string | null;
  percentage: string;
  effectiveFrom: string;
  enabled: boolean;
  notes: string | null;
  createdAt: string;
}

export function CommissionsTab() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ scope: "global", labelId: "", artistId: "", dspCode: "", percentage: "15", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi<{ rules: CommissionRule[] }>("/api/finance/commissions");
      setRules(r.rules);
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    try {
      const body: Record<string, unknown> = {
        scope: form.scope,
        percentage: Number(form.percentage),
        notes: form.notes || null,
      };
      if (form.scope === "label" && form.labelId) body.labelId = Number(form.labelId);
      if (form.scope === "artist" && form.artistId) body.artistId = Number(form.artistId);
      if (form.scope === "dsp" && form.dspCode) body.dspCode = form.dspCode;
      await adminApi("/api/finance/commissions", { method: "POST", body: JSON.stringify(body) });
      setOpen(false); setForm({ scope: "global", labelId: "", artistId: "", dspCode: "", percentage: "15", notes: "" });
      await load();
      toast({ title: "Правило создано" });
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  const remove = async (id: number) => {
    if (!confirm("Удалить правило?")) return;
    try {
      await adminApi(`/api/finance/commissions/${id}`, { method: "DELETE" });
      await load();
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Правила комиссий</h3>
          <p className="text-xs text-muted-foreground">Удержание дистрибьютора. Применяется при расчёте роялти.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh-commissions">
            <RefreshCw className="h-4 w-4 mr-1" /> Обновить
          </Button>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="button-add-commission"><Plus className="h-4 w-4 mr-1" /> Добавить</Button>
        </div>
      </div>

      <div className="rounded-md border bg-card divide-y">
        {rules.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Нет правил. Создайте первое.</div>
        ) : rules.map((r) => (
          <div key={r.id} className="p-3 flex items-center justify-between" data-testid={`row-commission-${r.id}`}>
            <div className="flex items-center gap-3">
              <Badge variant={r.enabled ? "default" : "secondary"}>{r.scope}</Badge>
              <div className="text-sm">
                <div className="font-medium">{Number(r.percentage).toFixed(2)}%</div>
                <div className="text-xs text-muted-foreground">
                  {r.labelId ? `label #${r.labelId} ` : ""}{r.artistId ? `artist #${r.artistId} ` : ""}{r.dspCode ? `DSP=${r.dspCode} ` : ""}
                  · с {fmtDate(r.effectiveFrom)}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => void remove(r.id)} data-testid={`button-delete-commission-${r.id}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Новое правило комиссии</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Область</Label>
              <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v }))}>
                <SelectTrigger data-testid="select-commission-scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Глобально</SelectItem>
                  <SelectItem value="label">По лейблу</SelectItem>
                  <SelectItem value="artist">По артисту</SelectItem>
                  <SelectItem value="dsp">По DSP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.scope === "label" && (<div><Label>ID лейбла</Label><Input type="number" value={form.labelId} onChange={(e) => setForm((f) => ({ ...f, labelId: e.target.value }))} data-testid="input-commission-label" /></div>)}
            {form.scope === "artist" && (<div><Label>ID артиста</Label><Input type="number" value={form.artistId} onChange={(e) => setForm((f) => ({ ...f, artistId: e.target.value }))} data-testid="input-commission-artist" /></div>)}
            {form.scope === "dsp" && (<div><Label>Код DSP (spotify, apple, ...)</Label><Input value={form.dspCode} onChange={(e) => setForm((f) => ({ ...f, dspCode: e.target.value }))} data-testid="input-commission-dsp" /></div>)}
            <div><Label>Процент</Label><Input type="number" step="0.01" value={form.percentage} onChange={(e) => setForm((f) => ({ ...f, percentage: e.target.value }))} data-testid="input-commission-percentage" /></div>
            <div><Label>Заметки</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} data-testid="input-commission-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => void create()} data-testid="button-save-commission">Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
