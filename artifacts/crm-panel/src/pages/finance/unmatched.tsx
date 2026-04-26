import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Search, AlertTriangle, ChevronLeft, Link2, CheckCircle2 } from "lucide-react";

interface UnmatchedRow {
  id: number;
  importId: number;
  dsp: string;
  period: string;
  rawIsrc: string | null;
  rawTitle: string | null;
  rawArtist: string | null;
  revenue: number;
  currency: string;
  countryCode: string | null;
  streams: number;
  resolved: boolean;
  createdAt: string;
  filename: string | null;
}

interface UnmatchedListResponse {
  data: UnmatchedRow[];
  pagination: { total: number; limit: number; offset: number };
  pendingRevenue: number;
}

interface TrackSuggestion {
  id: number;
  title: string;
  isrc: string | null;
  releaseId: number | null;
  releaseTitle: string | null;
  artistId: number;
  artistName: string | null;
}

const DSP_LABELS: Record<string, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube_music: "YouTube Music",
  tiktok: "TikTok",
};

type StatusFilter = "pending" | "resolved" | "all";

export default function FinanceUnmatched() {
  const { user } = useAuth();
  const isAdminLike = user?.role === "admin" || user?.role === "manager";

  const [status, setStatus] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [data, setData] = useState<UnmatchedListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerFor, setPickerFor] = useState<UnmatchedRow | null>(null);

  // Debounce поиска по списку (300мс) — чтобы не молотить API на каждый ввод.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const reload = useCallback(async () => {
    if (!isAdminLike) { setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, limit: "100" });
      if (debouncedSearch) params.set("q", debouncedSearch);
      const res = await fetch(`/api/finance/ingest/unmatched?${params}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не удалось загрузить список", description: e?.message });
      setData({ data: [], pagination: { total: 0, limit: 100, offset: 0 }, pendingRevenue: 0 });
    } finally {
      setLoading(false);
    }
  }, [isAdminLike, status, debouncedSearch]);

  useEffect(() => { reload(); }, [reload]);

  if (!isAdminLike) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center gap-3">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <p className="text-muted-foreground">Только для администраторов и менеджеров.</p>
        </div>
      </Layout>
    );
  }

  const totalPending = data?.pagination.total ?? 0;
  const pendingRevenue = data?.pendingRevenue ?? 0;

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/finance">
              <Button variant="ghost" size="sm" data-testid="button-back-to-finance">
                <ChevronLeft className="h-4 w-4 mr-1" /> К финансам
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Нерешённые строки импорта</h1>
              <p className="text-muted-foreground mt-1">
                CSV-строки, у которых ISRC не нашёлся в системе. Сопоставьте их вручную, чтобы доход был зачислен.
              </p>
            </div>
          </div>
        </div>

        {/* KPI */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">В ожидании</CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-20" /> : (
                <div className="text-2xl font-bold text-amber-400" data-testid="text-pending-count">
                  {status === "pending" ? totalPending.toLocaleString() : "—"}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {status === "pending" ? "строк ждут ручного сопоставления" : "переключитесь на «В ожидании» чтобы увидеть"}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Незачисленный доход</CardTitle>
              <Link2 className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-32" /> : (
                <div className="text-2xl font-bold text-amber-400" data-testid="text-pending-revenue">
                  ${pendingRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">сумма по всем pending-строкам</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <Tabs value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <TabsList>
                  <TabsTrigger value="pending"  data-testid="tab-pending">В ожидании</TabsTrigger>
                  <TabsTrigger value="resolved" data-testid="tab-resolved">Сопоставленные</TabsTrigger>
                  <TabsTrigger value="all"      data-testid="tab-all">Все</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по ISRC, треку, артисту..."
                  className="pl-8 h-9 bg-background/50"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search-unmatched"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-background/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Дата</TableHead>
                  <TableHead>DSP</TableHead>
                  <TableHead>Период</TableHead>
                  <TableHead>ISRC</TableHead>
                  <TableHead>Трек</TableHead>
                  <TableHead>Артист</TableHead>
                  <TableHead className="text-right">Доход</TableHead>
                  <TableHead className="text-right">Стримы</TableHead>
                  <TableHead className="text-right">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-5 w-full" /></TableCell></TableRow>
                  ))
                ) : (data?.data.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      {status === "pending"
                        ? "Все строки сопоставлены — потерянного дохода нет."
                        : status === "resolved"
                          ? "Ещё ничего не сопоставлено вручную."
                          : "Нет строк."}
                    </TableCell>
                  </TableRow>
                ) : data!.data.map((r) => (
                  <TableRow key={r.id} className="hover:bg-accent/20" data-testid={`row-unmatched-${r.id}`}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">{DSP_LABELS[r.dsp] ?? r.dsp}</TableCell>
                    <TableCell className="text-xs font-mono">{r.period}</TableCell>
                    <TableCell className="text-xs font-mono">{r.rawIsrc ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate">{r.rawTitle ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm max-w-[140px] truncate">{r.rawArtist ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {r.revenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {r.currency}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{r.streams.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {r.resolved ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Сопоставлено
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPickerFor(r)}
                          data-testid={`button-resolve-${r.id}`}
                        >
                          <Link2 className="h-3 w-3 mr-1" /> Сопоставить
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <ResolvePicker
        row={pickerFor}
        onClose={() => setPickerFor(null)}
        onResolved={() => { setPickerFor(null); reload(); }}
      />
    </Layout>
  );
}

// ─── Picker dialog ───────────────────────────────────────────────────────────
// Открывается по клику «Сопоставить» — Input + debounce + список треков.
// При подтверждении POST /finance/ingest/unmatched/:id/resolve { trackId }.
function ResolvePicker({
  row, onClose, onResolved,
}: {
  row: UnmatchedRow | null;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<TrackSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<TrackSuggestion | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const reqIdRef = useRef(0);

  // Каждый раз при открытии диалога — сбрасываем состояние и
  // подставляем сырое название/артиста как стартовый запрос (если есть).
  useEffect(() => {
    if (!row) return;
    const seed = row.rawTitle || row.rawArtist || row.rawIsrc || "";
    setQuery(seed);
    setDebounced(seed.trim());
    setResults([]);
    setPicked(null);
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!row) return;
    if (debounced.length < 2) { setResults([]); return; }
    const myReq = ++reqIdRef.current;
    setSearching(true);
    (async () => {
      try {
        const res = await fetch(`/api/finance/ingest/track-search?q=${encodeURIComponent(debounced)}&limit=20`, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list: TrackSuggestion[] = await res.json();
        // Гонка: показываем только результаты последнего запроса.
        if (myReq === reqIdRef.current) setResults(list);
      } catch {
        if (myReq === reqIdRef.current) setResults([]);
      } finally {
        if (myReq === reqIdRef.current) setSearching(false);
      }
    })();
  }, [debounced, row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!row || !picked) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/ingest/unmatched/${row.id}/resolve`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: picked.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Не удалось сопоставить",
          description: body?.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      if (body.alreadyAccounted) {
        toast({
          title: "Сопоставлено (без новой проводки)",
          description: `За этот период/трек/страну доход уже был учтён ранее. Строка помечена как разобранная, но новая транзакция не создавалась — иначе доход задвоился бы.`,
        });
      } else {
        toast({
          title: "Готово",
          description: `+$${body.revenue?.toFixed?.(2) ?? body.revenue} ${body.currency} зачислено на «${picked.artistName ?? "артист"}» / «${picked.title}».`,
        });
      }
      onResolved();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Сетевая ошибка", description: e?.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Сопоставить с треком</DialogTitle>
          {row && (
            <DialogDescription asChild>
              <div className="text-sm">
                <span className="text-muted-foreground">CSV-строка: </span>
                <span className="font-mono">{row.rawIsrc ?? "—"}</span>
                <span className="text-muted-foreground"> · </span>
                <span>{row.rawTitle ?? "—"}</span>
                <span className="text-muted-foreground"> · </span>
                <span>{row.rawArtist ?? "—"}</span>
                <span className="text-muted-foreground"> · </span>
                <span className="font-medium">${row.revenue.toFixed(2)} {row.currency}</span>
                <span className="text-muted-foreground"> · </span>
                <span>{DSP_LABELS[row.dsp] ?? row.dsp} {row.period}</span>
              </div>
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Поиск трека по ISRC, названию или артисту (мин. 2 символа)..."
              className="pl-8"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
              data-testid="input-track-search"
            />
          </div>

          <div className="border border-border/50 rounded-md max-h-72 overflow-y-auto">
            {debounced.length < 2 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Введите минимум 2 символа для поиска
              </div>
            ) : searching ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : results.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Ничего не найдено. Попробуйте другой ISRC, название или имя артиста.
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {results.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPicked(t)}
                    className={`w-full text-left p-3 hover:bg-accent/40 transition-colors ${picked?.id === t.id ? "bg-primary/10" : ""}`}
                    data-testid={`option-track-${t.id}`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.artistName ?? "—"} · {t.releaseTitle ?? "—"}
                        </div>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {t.isrc ?? "no ISRC"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {picked && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-400 font-medium mb-1">
                <CheckCircle2 className="h-4 w-4" /> Выбран трек
              </div>
              <div>«{picked.title}» — {picked.artistName ?? "?"} {picked.isrc ? `(${picked.isrc})` : ""}</div>
              {row && (
                <div className="text-xs text-muted-foreground mt-1">
                  Будет создана транзакция на ${row.revenue.toFixed(2)} {row.currency} в адрес этого трека/артиста.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting} data-testid="button-cancel-resolve">
            Отмена
          </Button>
          <Button onClick={submit} disabled={!picked || submitting} data-testid="button-confirm-resolve">
            {submitting ? "Сопоставление..." : "Сопоставить и зачислить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
