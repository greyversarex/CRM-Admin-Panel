/**
 * Rights / History tab — журнал действий по правам, основанный на audit_log.
 */
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { adminApi, fmtDate } from "@/lib/admin-api";

interface AuditEntry {
  id: number;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  createdAt: string;
}

const TYPES = ["", "right_holder", "dsp_deal", "content_id_asset", "ownership_claim", "rights_conflict"];

export function HistoryTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "200" });
      if (type) qs.set("entityType", type);
      const r = await adminApi<{ history: AuditEntry[] }>(`/api/rights/history?${qs}`);
      setEntries(r.history);
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setLoading(false);
  }, [type]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">История прав</h3>
          <p className="text-xs text-muted-foreground">Изменения по правообладателям, DSP-сделкам, claim'ам и Content ID.</p>
        </div>
        <div className="flex gap-2">
          <Select value={type || "all"} onValueChange={(v) => setType(v === "all" ? "" : v)}>
            <SelectTrigger className="w-48" data-testid="select-history-type"><SelectValue placeholder="Все типы" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {TYPES.filter((t) => t).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh-history">
            <RefreshCw className="h-4 w-4 mr-1" /> Обновить
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card divide-y">
        {entries.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Записей нет.</div>
        ) : entries.map((e) => (
          <div key={e.id} className="p-3 flex items-center gap-3" data-testid={`row-history-${e.id}`}>
            <History className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 text-sm">
              <div className="font-medium">
                <Badge variant="outline" className="mr-2">{e.action}</Badge>
                <Badge variant="secondary" className="mr-2">{e.entityType}#{e.entityId ?? "?"}</Badge>
                {e.userEmail ?? "—"} <span className="text-xs text-muted-foreground">({e.userRole ?? "?"})</span>
              </div>
              <div className="text-xs text-muted-foreground">{fmtDate(e.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
