import { useEffect, useState, useCallback } from "react";
import { Globe, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

type Row = {
  territory: string;
  holders_count: number;
  exclusive_count: number;
  rights_types: string[];
};

const RIGHTS_TYPE_LABELS: Record<string, string> = {
  master: "Мастер", sync: "Синхро", mechanical: "Механика", neighboring: "Смежные", all: "Все",
};

export function TerritoriesTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/rights/territories", { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setRows(j.territories ?? []);
    } catch (e) {
      toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">Обзор покрытия по территориям ({rows.length})</div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Обновить
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.length === 0 && (
          <div className="col-span-full text-center text-xs text-muted-foreground py-6">Нет данных по территориям</div>
        )}
        {rows.map((row) => (
          <div key={row.territory} className="rounded-lg border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-blue-400" />
              <div className="font-mono font-semibold">{row.territory}</div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Владельцев:</span>
              <span className="font-medium">{row.holders_count}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Эксклюзив:</span>
              <span className="font-medium">{row.exclusive_count}</span>
            </div>
            {row.rights_types?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {row.rights_types.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]">{RIGHTS_TYPE_LABELS[t] ?? t}</Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
