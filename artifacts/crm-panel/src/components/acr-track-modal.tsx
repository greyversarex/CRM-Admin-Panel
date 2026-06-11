/**
 * Модальное окно с результатами ACRCloud-проверки для конкретного трека.
 * Аналог "Music recognition matches by ACRCloud" из Symphonic Distribution.
 *
 * Данные: GET /api/distribution/acr/checks?releaseId=X  (фильтр по trackId)
 * Сканирование: POST /api/distribution/acr/scan | scan-full
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ScanSearch, CheckCircle2, AlertTriangle, XCircle,
  Loader2, Play, Zap, Clock, Music2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AcrCheckSegment = {
  index: number; startPct: number; endPct: number;
  status: "matched" | "clean" | "error";
  matchedTitle?: string | null; matchedArtist?: string | null; matchedIsrc?: string | null;
  score?: number | null; error?: string | null; tookMs?: number;
};

type AcrCheck = {
  id: number; releaseId: number | null; trackId: number | null;
  status: string; mode: string; engine: string;
  confidence: string | null;
  matchedTitle: string | null; matchedArtist: string | null;
  matchedIsrc: string | null; matchedLabel: string | null;
  segments: AcrCheckSegment[] | null;
  resultJson: Record<string, unknown> | null;
  errorMessage: string | null;
  scannedBy: number | null; scannedAt: string;
};

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function jpost<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function StatusIcon({ status }: { status: string }) {
  if (status === "matched") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  if (status === "clean")   return <CheckCircle2  className="h-4 w-4 text-emerald-400" />;
  if (status === "pending") return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
  return <XCircle className="h-4 w-4 text-rose-400" />;
}

function StatusBadge({ status }: { status: string }) {
  const cfg =
    status === "matched" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
    status === "clean"   ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
    status === "pending" ? "bg-blue-500/15 text-blue-400 border-blue-500/30" :
                           "bg-rose-500/15 text-rose-400 border-rose-500/30";
  const label =
    status === "matched" ? "Совпадение найдено" :
    status === "clean"   ? "Совпадений нет" :
    status === "pending" ? "Сканируется..." :
    status === "error"   ? "Ошибка" : status;
  return (
    <Badge variant="outline" className={`text-xs ${cfg}`}>
      <StatusIcon status={status} />
      <span className="ml-1">{label}</span>
    </Badge>
  );
}

function parseMatches(check: AcrCheck): Array<{
  platform: string; title: string; artist: string;
  isrc: string; upc: string; releaseDate: string; confidence: string;
}> {
  if (!check.resultJson) return [];
  const rj = check.resultJson;
  const metadata = rj["metadata"] as { music?: Array<Record<string, unknown>> } | undefined;
  const music = metadata?.music ?? [];
  const rows: ReturnType<typeof parseMatches> = [];

  for (const m of music) {
    const title   = typeof m["title"]  === "string" ? m["title"]  : (check.matchedTitle ?? "—");
    const artists = (m["artists"] as Array<{ name?: string }> | undefined)
      ?.map((a) => a.name).filter(Boolean).join(", ")
      ?? (check.matchedArtist ?? "—");
    const extIds  = m["external_ids"]  as { isrc?: string; upc?: string } | undefined;
    const isrc    = extIds?.isrc ?? check.matchedIsrc ?? "—";
    const upc     = extIds?.upc  ?? "—";
    const releaseDate = typeof m["release_date"] === "string" ? m["release_date"] : "—";
    const score   = typeof m["score"] === "number" ? `${m["score"]}%` : (check.confidence ? `${check.confidence}%` : "—");

    const extMeta = m["external_metadata"] as Record<string, unknown> | undefined;
    const platforms = Object.keys(extMeta ?? {}).filter((k) => k !== "_scan_meta");
    if (platforms.length === 0) {
      rows.push({ platform: "—", title, artist: artists, isrc, upc, releaseDate, confidence: score });
    } else {
      for (const p of platforms) {
        rows.push({ platform: p.charAt(0).toUpperCase() + p.slice(1), title, artist: artists, isrc, upc, releaseDate, confidence: score });
      }
    }
  }
  return rows;
}

export interface AcrTrackModalProps {
  releaseId: number;
  trackId: number;
  trackTitle: string;
  onClose: () => void;
}

export function AcrTrackModal({ releaseId, trackId, trackTitle, onClose }: AcrTrackModalProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [scanning, setScanning] = useState<"sample" | "full" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["acr-checks-track", releaseId, trackId],
    queryFn: () => jget<{ checks: AcrCheck[]; configured: boolean }>(
      `/api/distribution/acr/checks?releaseId=${releaseId}`,
    ),
    refetchInterval: (q) => {
      const checks = q.state.data?.checks.filter((c) => c.trackId === trackId) ?? [];
      return checks.some((c) => c.status === "pending") ? 2000 : false;
    },
  });

  const trackChecks = (data?.checks ?? []).filter((c) => c.trackId === trackId);
  const latest = trackChecks[0] ?? null;
  const configured = data?.configured ?? false;

  const runScan = useMutation({
    mutationFn: (mode: "sample" | "full") =>
      jpost(`/api/distribution/acr/${mode === "full" ? "scan-full" : "scan"}`, { releaseId, trackId }),
    onMutate: (mode) => setScanning(mode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["acr-checks-track", releaseId, trackId] });
      qc.invalidateQueries({ queryKey: ["acr-checks-release", releaseId] });
      setScanning(null);
      toast({ title: "Сканирование запущено", description: "Результат появится через несколько секунд." });
    },
    onError: (e: Error) => {
      setScanning(null);
      toast({ variant: "destructive", title: "Ошибка запуска сканирования", description: e.message });
    },
  });

  const matches = latest ? parseMatches(latest) : [];
  const matchedSegments = latest?.segments?.filter((s) => s.status === "matched").length ?? 0;
  const totalSegments   = latest?.segments?.length ?? 0;

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[680px] max-h-[88vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <ScanSearch className="h-4 w-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">Music recognition matches by ACRCloud</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1.5">
                <Music2 className="h-3 w-3 shrink-0" />
                {trackTitle}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка...
            </div>
          )}

          {!isLoading && !latest && (
            <div className="text-center py-8 text-muted-foreground">
              <ScanSearch className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Проверки для этого трека ещё не проводились.</p>
              {!configured && (
                <p className="text-xs mt-1 text-rose-400">ACRCloud не настроен в системе.</p>
              )}
            </div>
          )}

          {latest && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <StatusBadge status={latest.status} />
                  <Badge variant="outline" className="text-xs bg-muted/40">
                    {latest.mode === "full" ? "Полное сканирование" : "Sample scan"}
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-muted/40">
                    {latest.engine === "musicbrainz_isrc" ? "MusicBrainz ISRC" : "ACRCloud"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {fmtDate(latest.scannedAt)}
                </div>
              </div>

              {latest.status === "matched" && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-sm flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium text-amber-300">Совпадение обнаружено:</span>
                    <span className="text-amber-200/80 ml-1">
                      {latest.matchedTitle ?? "неизвестный трек"}
                      {latest.matchedArtist ? ` — ${latest.matchedArtist}` : ""}
                    </span>
                    {latest.confidence && (
                      <span className="ml-2 text-amber-300 font-medium">({latest.confidence}% confidence)</span>
                    )}
                  </div>
                </div>
              )}

              {latest.errorMessage && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/8 p-3 text-sm text-rose-300 flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  {latest.errorMessage}
                </div>
              )}

              {totalSegments > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Сегменты ({matchedSegments} из {totalSegments} совпали)
                  </div>
                  <div className="flex gap-1">
                    {latest.segments!.map((seg) => (
                      <div
                        key={seg.index}
                        title={`Сегмент ${seg.index + 1} (${seg.startPct}–${seg.endPct}%): ${seg.status}${seg.score ? ` · ${seg.score}%` : ""}`}
                        className={`h-5 flex-1 rounded text-[9px] flex items-center justify-center font-bold ${
                          seg.status === "matched" ? "bg-amber-500/60 text-amber-100" :
                          seg.status === "clean"   ? "bg-emerald-500/60 text-emerald-100" :
                                                     "bg-rose-500/60 text-rose-100"
                        }`}
                      >
                        {seg.index + 1}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {matches.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Совпадения на платформах
                  </div>
                  <div className="rounded-lg border overflow-hidden">
                    <div className="grid text-[11px] font-medium text-muted-foreground uppercase tracking-wide bg-muted/40 px-3 py-2"
                      style={{ gridTemplateColumns: "1fr 2fr 1.5fr 1.5fr 1fr" }}
                    >
                      <span>Платформа</span>
                      <span>Трек</span>
                      <span>ISRC</span>
                      <span>Дата</span>
                      <span className="text-right">Conf.</span>
                    </div>
                    <div className="divide-y divide-border/40">
                      {matches.map((m, i) => (
                        <div
                          key={i}
                          className="grid items-center px-3 py-2.5 text-xs gap-2 hover:bg-accent/20"
                          style={{ gridTemplateColumns: "1fr 2fr 1.5fr 1.5fr 1fr" }}
                        >
                          <span className="font-medium text-foreground">{m.platform}</span>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{m.title}</div>
                            <div className="truncate text-muted-foreground">{m.artist}</div>
                          </div>
                          <span className="font-mono text-muted-foreground">{m.isrc}</span>
                          <span className="text-muted-foreground">{m.releaseDate}</span>
                          <span className="text-right font-semibold text-amber-400">{m.confidence}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {trackChecks.length > 1 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    История проверок
                  </div>
                  <div className="space-y-1">
                    {trackChecks.slice(1).map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1 px-2 rounded hover:bg-accent/20">
                        <StatusIcon status={c.status} />
                        <span>{fmtDate(c.scannedAt)}</span>
                        <Badge variant="outline" className="text-[10px]">{c.mode}</Badge>
                        {c.matchedTitle && (
                          <span className="truncate text-foreground/70">→ {c.matchedTitle}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <Separator />
        <div className="px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground">
            {configured ? "ACRCloud подключён" : <span className="text-rose-400">ACRCloud не настроен</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              disabled={!configured || runScan.isPending || latest?.status === "pending"}
              onClick={() => runScan.mutate("sample")}
              className="text-xs gap-1.5"
            >
              {scanning === "sample" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Sample Scan
            </Button>
            <Button
              variant="outline" size="sm"
              disabled={!configured || runScan.isPending || latest?.status === "pending"}
              onClick={() => runScan.mutate("full")}
              className="text-xs gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
            >
              {scanning === "full" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Full Scan
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
