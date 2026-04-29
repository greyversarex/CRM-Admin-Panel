/**
 * Rights / Freeze tab — заморозка правообладателей (manual override / killswitch).
 */
import { useEffect, useState, useCallback } from "react";
import { Snowflake, Sun, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { adminApi, fmtDate } from "@/lib/admin-api";

interface Holder {
  id: number;
  holderName: string;
  holderType: string;
  rightsType: string;
  sharePct: string;
  territory: string;
  frozen: boolean;
  frozenReason: string | null;
  frozenAt: string | null;
}

export function FreezeTab() {
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<Holder | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi<{ holders: Holder[] } | Holder[]>("/api/rights/holders?limit=100");
      setHolders(Array.isArray(r) ? r : (r.holders ?? []));
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const freeze = async () => {
    if (!target) return;
    if (!reason.trim()) { toast({ title: "Укажите причину", variant: "destructive" }); return; }
    try {
      await adminApi(`/api/rights/holders/${target.id}/freeze`, { method: "POST", body: JSON.stringify({ reason }) });
      toast({ title: "Заморожен" });
      setTarget(null); setReason("");
      await load();
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  const unfreeze = async (h: Holder) => {
    if (!confirm(`Разморозить «${h.holderName}»?`)) return;
    try {
      await adminApi(`/api/rights/holders/${h.id}/unfreeze`, { method: "POST" });
      await load();
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Заморозка правообладателей</h3>
          <p className="text-xs text-muted-foreground">Killswitch: блокирует учёт прав в выплатах и доставках до разморозки.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh-holders">
          <RefreshCw className="h-4 w-4 mr-1" /> Обновить
        </Button>
      </div>

      <div className="rounded-md border bg-card divide-y">
        {holders.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Правообладателей нет.</div>
        ) : holders.map((h) => (
          <div key={h.id} className="p-3 flex items-center justify-between" data-testid={`row-holder-${h.id}`}>
            <div className="flex items-center gap-3">
              {h.frozen ? <Snowflake className="h-4 w-4 text-blue-500" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
              <div className="text-sm">
                <div className="font-medium">
                  {h.holderName}
                  <Badge variant="outline" className="ml-2">{h.holderType}</Badge>
                  <Badge variant="outline" className="ml-2">{h.rightsType}</Badge>
                  <Badge variant="outline" className="ml-2">{Number(h.sharePct).toFixed(2)}% / {h.territory}</Badge>
                  {h.frozen && <Badge variant="destructive" className="ml-2">FROZEN</Badge>}
                </div>
                {h.frozen && (
                  <div className="text-xs text-muted-foreground">
                    {h.frozenReason} · с {fmtDate(h.frozenAt)}
                  </div>
                )}
              </div>
            </div>
            {h.frozen ? (
              <Button variant="outline" size="sm" onClick={() => void unfreeze(h)} data-testid={`button-unfreeze-${h.id}`}>Разморозить</Button>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => setTarget(h)} data-testid={`button-freeze-${h.id}`}>Заморозить</Button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!target} onOpenChange={(o) => { if (!o) setTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Заморозить «{target?.holderName}»</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Причина (обязательно)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-freeze-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Отмена</Button>
            <Button variant="destructive" onClick={() => void freeze()} data-testid="button-confirm-freeze">Заморозить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
