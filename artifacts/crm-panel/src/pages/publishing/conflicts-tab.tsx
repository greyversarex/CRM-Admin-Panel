/**
 * Publishing / Conflicts tab — split overlap, duplicate ISWC, unclaimed share.
 */
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, AlertOctagon, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { adminApi, fmtDate } from "@/lib/admin-api";

interface Conflict {
  id: number;
  workId: number | null;
  conflictType: string;
  severity: string;
  description: string;
  resolved: boolean;
  detectedAt: string;
}

export function ConflictsTab() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi<{ conflicts: Conflict[] }>("/api/publishing/conflicts");
      setConflicts(r.conflicts);
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const detect = async () => {
    try {
      const r = await adminApi<{ added: number }>("/api/publishing/conflicts/detect", { method: "POST" });
      toast({ title: `Сканирование завершено: добавлено ${r.added}` });
      await load();
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  const toggle = async (c: Conflict) => {
    try {
      await adminApi(`/api/publishing/conflicts/${c.id}`, { method: "PATCH", body: JSON.stringify({ resolved: !c.resolved }) });
      await load();
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Конфликты прав</h3>
          <p className="text-xs text-muted-foreground">Дубликаты ISWC, перекрытия split'ов, нераспределённые доли.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh-conflicts">
            <RefreshCw className="h-4 w-4 mr-1" /> Обновить
          </Button>
          <Button size="sm" onClick={() => void detect()} data-testid="button-detect-conflicts">
            <ScanSearch className="h-4 w-4 mr-1" /> Запустить сканирование
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card divide-y">
        {conflicts.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Конфликтов нет.</div>
        ) : conflicts.map((c) => (
          <div key={c.id} className="p-3 flex items-center justify-between" data-testid={`row-conflict-${c.id}`}>
            <div className="flex items-center gap-3">
              <AlertOctagon className={`h-4 w-4 ${c.resolved ? "text-muted-foreground" : "text-orange-500"}`} />
              <div className="text-sm">
                <div className="font-medium">
                  Work #{c.workId} · {c.description}
                  <Badge variant="outline" className="ml-2">{c.conflictType}</Badge>
                  <Badge variant={c.severity === "high" ? "destructive" : "secondary"} className="ml-2">{c.severity}</Badge>
                  {c.resolved && <Badge variant="secondary" className="ml-2">resolved</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{fmtDate(c.detectedAt)}</div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void toggle(c)} data-testid={`button-toggle-conflict-${c.id}`}>
              {c.resolved ? "Открыть" : "Решить"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
