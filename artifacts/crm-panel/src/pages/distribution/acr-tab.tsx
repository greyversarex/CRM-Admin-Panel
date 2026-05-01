/**
 * Distribution / ACRCloud tab — список проверок аудио-отпечатка + запуск новой.
 */
import { useEffect, useState, useCallback } from "react";
import { ScanSearch, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { adminApi, fmtDate } from "@/lib/admin-api";
import { useListReleases } from "@workspace/api-client-react";

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
  const [scanning, setScanning] = useState(false);
  const [releaseId, setReleaseId] = useState("");

  const releasesQ = useListReleases({ limit: 200 });
  const releases = releasesQ.data?.releases ?? [];

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
    if (!releaseId) { toast({ title: "Выберите релиз", variant: "destructive" }); return; }
    setScanning(true);
    try {
      await adminApi("/api/distribution/acr/scan", { method: "POST", body: JSON.stringify({ releaseId: Number(releaseId) }) });
      toast({ title: "Проверка запущена" });
      setReleaseId("");
      await load();
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setScanning(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">ACRCloud — проверка аудио</h3>
          <p className="text-xs text-muted-foreground">
            Сравнение аудио-отпечатка трека с глобальной базой авторских прав.{" "}
            {configured
              ? <Badge variant="default" className="ml-1">credentials configured</Badge>
              : <Badge variant="destructive" className="ml-1">credentials not configured</Badge>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} data-testid="button-refresh-acr">
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Обновить
        </Button>
      </div>

      {!configured && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-xs text-amber-400">
          Для запуска сканирования укажите ключи ACRCloud в разделе <strong>Настройки → Интеграции</strong> (host, access key, access secret).
        </div>
      )}

      <div className="rounded-md border bg-card p-3 flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs mb-1.5 block">Релиз для сканирования</Label>
          <Select value={releaseId} onValueChange={setReleaseId}>
            <SelectTrigger data-testid="input-acr-release-id">
              <SelectValue placeholder={releasesQ.isLoading ? "Загрузка релизов…" : "Выберите релиз…"} />
            </SelectTrigger>
            <SelectContent>
              {releases.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  #{r.id} — {r.title}
                  {r.status === "pending_review" && (
                    <span className="ml-2 text-amber-400 text-[10px]">(на модерации)</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => void scan()} disabled={!releaseId || scanning} data-testid="button-acr-scan">
          {scanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ScanSearch className="h-4 w-4 mr-1" />}
          Запустить
        </Button>
      </div>

      <div className="rounded-md border bg-card divide-y">
        {checks.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            Проверок ещё не было.{" "}
            <span className="block mt-1 text-xs opacity-60">Выберите релиз выше и нажмите «Запустить», чтобы начать сканирование.</span>
          </div>
        ) : checks.map((c) => (
          <div key={c.id} className="p-3 flex items-center justify-between" data-testid={`row-acr-${c.id}`}>
            <div className="flex items-center gap-3">
              {c.status === "matched"
                ? <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                : c.status === "clean"
                ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                : c.status === "error"
                ? <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                : <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="text-sm">
                <div className="font-medium">
                  {releases.find((r) => r.id === c.releaseId)?.title ?? `Релиз #${c.releaseId}`}
                  {c.trackId ? <span className="text-muted-foreground"> · Трек #{c.trackId}</span> : null}
                  <Badge
                    variant={c.status === "matched" ? "destructive" : c.status === "error" ? "secondary" : "outline"}
                    className="ml-2"
                  >
                    {c.status === "matched" ? "совпадение" : c.status === "clean" ? "чисто" : c.status === "error" ? "ошибка" : c.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.matchedTitle ? `Найдено: «${c.matchedTitle}» — ${c.matchedArtist ?? "?"} (совпадение ${c.confidence ?? "?"}%) · ` : ""}
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
