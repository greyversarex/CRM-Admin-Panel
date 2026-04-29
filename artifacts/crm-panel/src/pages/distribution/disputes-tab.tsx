/**
 * Distribution / Disputes tab — споры по релизам (rights conflicts assetType=release).
 */
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { adminApi, fmtDate } from "@/lib/admin-api";

interface Dispute {
  id: number;
  releaseId: number | null;
  conflictType: string;
  claimantName: string;
  status: string;
  priority: string;
  createdAt: string;
}

export function DisputesTab() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi<{ disputes: Dispute[] }>("/api/distribution/disputes");
      setDisputes(r.disputes);
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Споры по релизам</h3>
          <p className="text-xs text-muted-foreground">Конфликты прав, помеченные как «спор» (DSP claim, ACR flag, manual dispute и т.д.).</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh-disputes">
          <RefreshCw className="h-4 w-4 mr-1" /> Обновить
        </Button>
      </div>

      <div className="rounded-md border bg-card divide-y">
        {disputes.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Споров нет.</div>
        ) : disputes.map((d) => (
          <div key={d.id} className="p-3 flex items-center justify-between" data-testid={`row-dispute-${d.id}`}>
            <div className="flex items-center gap-3">
              <AlertOctagon className="h-4 w-4 text-orange-500" />
              <div className="text-sm">
                <div className="font-medium">
                  Release #{d.releaseId} · {d.claimantName}
                  <Badge variant="outline" className="ml-2">{d.conflictType}</Badge>
                  <Badge variant={d.status === "open" ? "destructive" : "secondary"} className="ml-2">{d.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">Приоритет: {d.priority} · {fmtDate(d.createdAt)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
