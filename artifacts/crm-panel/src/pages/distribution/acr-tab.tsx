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
