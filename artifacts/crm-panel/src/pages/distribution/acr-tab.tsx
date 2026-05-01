/**
 * Distribution / ACRCloud tab — список проверок аудио-отпечатка + запуск новой.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { ScanSearch, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  matchedIsrc: string | null;
  matchedLabel: string | null;
  resultJson: Record<string, unknown> | null;
  errorMessage: string | null;
  scannedAt: string;
}

export function AcrTab() {
  const [checks, setChecks] = useState<AcrCheck[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Search state
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const releasesQ = useListReleases({ limit: 200 });
  const releases = releasesQ.data?.data ?? [];

  const filtered = query.trim()
    ? releases.filter((r) =>
        r.title.toLowerCase().includes(query.toLowerCase()) ||
        String(r.id).includes(query.trim())
      )
    : releases;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi<{ checks: AcrCheck[]; configured: boolean }>("/api/distribution/acr/checks");
      setChecks(r.checks); setConfigured(r.configured);
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectRelease = (id: number, title: string) => {
    setSelectedId(id);
    setSelectedTitle(title);
    setQuery(title);
    setOpen(false);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setSelectedTitle("");
    setQuery("");
    inputRef.current?.focus();
  };

  const scan = async () => {
    if (!selectedId) { toast({ title: "Выберите релиз", variant: "destructive" }); return; }
    setScanning(true);
    try {
      await adminApi("/api/distribution/acr/scan", { method: "POST", body: JSON.stringify({ releaseId: selectedId }) });
      toast({ title: "Проверка запущена" });
      clearSelection();
      await load();
    } catch (e) { toast({ title: "Ошибка", description: String((e as Error).message), variant: "destructive" }); }
    setScanning(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">ACRCloud — проверка аудио</h3>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="text-xs text-muted-foreground">Сравнение аудио-отпечатка трека с глобальной базой авторских прав.</span>
            {configured
              ? <Badge variant="default">credentials configured</Badge>
              : <Badge variant="destructive">credentials not configured</Badge>}
          </div>
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
        <div className="flex-1 relative">
          <Label className="text-xs mb-1.5 block">Поиск релиза для сканирования</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" style={{ color: "hsl(220 12% 52%)" }} />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedId(null);
                setSelectedTitle("");
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Введите название или ID релиза…"
              className="pl-8 pr-8"
              data-testid="input-acr-release-id"
            />
            {query && (
              <button
                onClick={clearSelection}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                style={{ color: "hsl(220 12% 52%)" }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {open && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border bg-card shadow-xl max-h-52 overflow-y-auto"
            >
              {releasesQ.isLoading ? (
                <div className="p-3 text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Загрузка…
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">Ничего не найдено</div>
              ) : (
                filtered.slice(0, 20).map((r) => (
                  <button
                    key={r.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 flex items-center justify-between gap-2 transition-colors"
                    onMouseDown={(e) => { e.preventDefault(); selectRelease(r.id, r.title); }}
                  >
                    <span className="truncate">{r.title}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {r.status === "pending_review" && (
                        <span className="text-[10px] text-amber-400">на модерации</span>
                      )}
                      <span className="text-[10px] text-muted-foreground/60">#{r.id}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <Button
          onClick={() => void scan()}
          disabled={!selectedId || scanning}
          data-testid="button-acr-scan"
          className="mb-0"
        >
          {scanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ScanSearch className="h-4 w-4 mr-1" />}
          Запустить
        </Button>
      </div>

      <div className="rounded-md border bg-card divide-y">
        {checks.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            Проверок ещё не было.
            <span className="block mt-1 text-xs opacity-60">Найдите релиз выше и нажмите «Запустить».</span>
          </div>
        ) : checks.map((c) => {
          const releaseTitle = releases.find((r) => r.id === c.releaseId)?.title ?? `Релиз #${c.releaseId}`;
          const costTime = (c.resultJson as Record<string, unknown> | null)?.["cost_time"];
          const acrMsg = ((c.resultJson as Record<string, unknown> | null)?.["status"] as Record<string, unknown> | undefined)?.["msg"];
          return (
            <div key={c.id} className="p-4" data-testid={`row-acr-${c.id}`}>
              {/* Header row */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {c.status === "matched"
                    ? <AlertTriangle className="h-5 w-5 text-orange-400" />
                    : c.status === "clean"
                    ? <CheckCircle2 className="h-5 w-5 text-green-400" />
                    : c.status === "error"
                    ? <AlertTriangle className="h-5 w-5 text-destructive" />
                    : <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{releaseTitle}</span>
                    {c.trackId && <span className="text-xs text-muted-foreground">· Трек #{c.trackId}</span>}
                    <Badge
                      variant={c.status === "matched" ? "destructive" : c.status === "error" ? "secondary" : "outline"}
                      className={c.status === "clean" ? "border-green-500/40 text-green-400" : ""}
                    >
                      {c.status === "matched" ? "совпадение" : c.status === "clean" ? "чисто" : c.status === "error" ? "ошибка" : c.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">{fmtDate(c.scannedAt)}</span>
                  </div>

                  {/* Clean — объяснение */}
                  {c.status === "clean" && (
                    <div className="mt-2 rounded-md bg-green-500/8 border border-green-500/20 p-2.5 text-xs text-green-300 space-y-0.5">
                      <div className="font-medium">Совпадений не найдено в базе ACRCloud</div>
                      <div className="text-green-400/70">
                        Аудиофайл был проверен по глобальной базе авторских прав и не обнаружен ни в одной из записей.
                        {typeof costTime === "number" && <span> Время анализа: {costTime.toFixed(2)} с.</span>}
                      </div>
                    </div>
                  )}

                  {/* Matched — детали совпадения */}
                  {c.status === "matched" && (
                    <div className="mt-2 rounded-md bg-orange-500/8 border border-orange-500/20 p-2.5 text-xs space-y-1.5">
                      <div className="font-medium text-orange-300">Обнаружено совпадение с существующей записью</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                        {c.matchedTitle && (
                          <><span className="text-white/50">Название</span><span className="text-foreground font-medium">«{c.matchedTitle}»</span></>
                        )}
                        {c.matchedArtist && (
                          <><span className="text-white/50">Исполнитель</span><span className="text-foreground">{c.matchedArtist}</span></>
                        )}
                        {c.matchedIsrc && (
                          <><span className="text-white/50">ISRC</span><span className="font-mono text-foreground">{c.matchedIsrc}</span></>
                        )}
                        {c.matchedLabel && (
                          <><span className="text-white/50">Лейбл</span><span className="text-foreground">{c.matchedLabel}</span></>
                        )}
                        {c.confidence && (
                          <><span className="text-white/50">Уверенность</span>
                          <span className={Number(c.confidence) >= 80 ? "text-orange-400 font-bold" : "text-foreground"}>
                            {Number(c.confidence).toFixed(1)}%
                          </span></>
                        )}
                        {typeof costTime === "number" && (
                          <><span className="text-white/50">Время анализа</span><span className="text-foreground">{costTime.toFixed(2)} с</span></>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {c.status === "error" && c.errorMessage && (
                    <div className="mt-2 rounded-md bg-destructive/10 border border-destructive/25 p-2.5 text-xs text-destructive/90">
                      {c.errorMessage}
                      {acrMsg && typeof acrMsg === "string" && acrMsg !== c.errorMessage && (
                        <span className="opacity-60"> · {acrMsg}</span>
                      )}
                    </div>
                  )}

                  {/* Pending */}
                  {c.status === "pending" && (
                    <div className="mt-2 text-xs text-muted-foreground">Идёт проверка, обновите страницу через несколько секунд…</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
