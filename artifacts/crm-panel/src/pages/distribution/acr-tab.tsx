/**
 * Distribution / ACRCloud tab — список проверок аудио-отпечатка + запуск новой.
 */
import { useEffect, useState, useCallback } from "react";
import { ScanSearch, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { adminApi, fmtDate } from "@/lib/admin-api";

interface AcrCheck {
  id: number;
  releaseId: number | null;
  trackId: number | null;
  status: string;
  confidence: string | null;
  matchedTitle: string | null;
  matchedArtist: string | null;
  errorMessage: string | null;
  scannedAt: string;
}

export function AcrTab() {
  const [checks, setChecks] = useState<AcrCheck[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [releaseId, setReleaseId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi<{ checks: AcrCheck[]; configured: boolean }>("/api/distribution/acr/checks");
      setChecks(r.checks); setConfigured(r.configured);
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const scan = async () => {
    if (!releaseId) { toast({ title: "Укажите ID релиза", variant: "destructive" }); return; }
    try {
      await adminApi("/api/distribution/acr/scan", { method: "POST", body: JSON.stringify({ releaseId: Number(releaseId) }) });
      toast({ title: "Проверка запущена" });
      setReleaseId("");
      await load();
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">ACRCloud — проверка аудио</h3>
          <p className="text-xs text-muted-foreground">
            Сравнение аудио-отпечатка трека с глобальной базой.
            {configured
              ? <Badge variant="default" className="ml-2">credentials configured</Badge>
              : <Badge variant="destructive" className="ml-2">credentials not configured</Badge>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh-acr">
          <RefreshCw className="h-4 w-4 mr-1" /> Обновить
        </Button>
      </div>

      <div className="rounded-md border bg-card p-3 flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs">ID релиза для сканирования</Label>
          <Input type="number" value={releaseId} onChange={(e) => setReleaseId(e.target.value)} data-testid="input-acr-release-id" />
        </div>
        <Button onClick={() => void scan()} data-testid="button-acr-scan"><ScanSearch className="h-4 w-4 mr-1" /> Запустить</Button>
      </div>

      <div className="rounded-md border bg-card divide-y">
        {checks.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Проверок ещё не было.</div>
        ) : checks.map((c) => (
          <div key={c.id} className="p-3 flex items-center justify-between" data-testid={`row-acr-${c.id}`}>
            <div className="flex items-center gap-3">
              {c.status === "matched"
                ? <AlertTriangle className="h-4 w-4 text-orange-500" />
                : c.status === "clean"
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : c.status === "error"
                ? <AlertTriangle className="h-4 w-4 text-destructive" />
                : <RefreshCw className="h-4 w-4 text-muted-foreground" />}
              <div className="text-sm">
                <div className="font-medium">
                  Release #{c.releaseId} {c.trackId ? `· Track #${c.trackId}` : ""}
                  <Badge variant={c.status === "matched" ? "destructive" : c.status === "error" ? "secondary" : "outline"} className="ml-2">{c.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.matchedTitle ? `Совпадение: «${c.matchedTitle}» — ${c.matchedArtist ?? "?"} (${c.confidence ?? "?"}%) · ` : ""}
                  {c.errorMessage ? `${c.errorMessage} · ` : ""}
                  {fmtDate(c.scannedAt)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
