/**
 * Проверка ОДНОГО трека по базе ACRCloud (File Scanning).
 *
 * Открывается кнопкой ACRCloud в строке трека. Показывает совпадения в том же
 * виде, что и релиз-уровневая модалка: Scanned Segments / Matched Segment /
 * Label Name / Album / UPC / ISRC / Release Date / Confidence Score / Found On.
 *
 * Данные:   GET  /api/distribution/acr/checks?trackId=X
 * Проверка: POST /api/distribution/acr/file-scan { trackId }
 *
 * Скан идёт минутами, поэтому пока последняя проверка в статусе pending —
 * опрашиваем строку раз в 5 секунд.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScanSearch, Loader2, CheckCircle2, AlertTriangle, XCircle, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MatchCard, mmss, fmtReleaseDate, buildFoundOnUrls, type RichMatch } from "./acr-matches-modal";

const DASH = "—";

/** Нормализованное совпадение с бэкенда (services/acrcloud-file-scan.ts). */
type FsMatch = {
  title: string | null;
  artist: string | null;
  album: string | null;
  label: string | null;
  upc: string | null;
  isrc: string | null;
  releaseDate: string | null;
  confidence: number | null;
  foundOn: string[];
  /** Сырой external_metadata от ACRCloud — из него собираются ссылки на площадки. */
  externalMetadata?: Record<string, unknown> | null;
  matchedFromMs: number | null;
  matchedToMs: number | null;
  segments: number;
  acrid: string | null;
};

type AcrCheck = {
  id: number;
  trackId: number | null;
  status: string;
  mode: string;
  engine: string;
  confidence: string | null;
  matchedTitle: string | null;
  resultJson: Record<string, unknown> | null;
  errorMessage: string | null;
  scannedAt: string;
};

type ChecksResponse = { checks: AcrCheck[]; configured: boolean; fileScanConfigured: boolean };

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function jpost<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    // Бэкенд отдаёт понятный errorMessage даже в 4xx/5xx — вытащим его.
    const text = await r.text();
    try {
      const j = JSON.parse(text) as { errorMessage?: string; error?: string };
      throw new Error(j.errorMessage || j.error || text);
    } catch (e) {
      throw e instanceof Error && e.message !== text ? e : new Error(text);
    }
  }
  return r.json() as Promise<T>;
}

/** FsMatch → RichMatch (то, что умеет рисовать MatchCard). */
function toRichMatch(m: FsMatch): RichMatch {
  const segment =
    m.matchedFromMs != null && m.matchedToMs != null ? `${mmss(m.matchedFromMs)} - ${mmss(m.matchedToMs)}`
    : m.matchedFromMs != null ? mmss(m.matchedFromMs)
    : DASH;

  return {
    title: m.title ?? DASH,
    artist: m.artist ?? DASH,
    scannedSegments: m.segments,
    matchedSegment: segment,
    label: m.label ?? DASH,
    album: m.album ?? DASH,
    upc: m.upc ?? DASH,
    isrc: m.isrc ?? DASH,
    releaseDate: fmtReleaseDate(m.releaseDate) ?? DASH,
    confidence: m.confidence != null ? String(m.confidence) : DASH,
    foundOn: m.foundOn ?? [],
    // Проверки, сделанные до появления ссылок, externalMetadata не содержат —
    // тогда плашки просто останутся некликабельными, без ошибок.
    foundOnUrls: buildFoundOnUrls(m.externalMetadata),
  };
}

function readMatches(check: AcrCheck | undefined): FsMatch[] {
  const raw = check?.resultJson?.["matches"];
  return Array.isArray(raw) ? (raw as FsMatch[]) : [];
}

export interface AcrTrackCheckDialogProps {
  trackId: number;
  trackTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AcrTrackCheckDialog({ trackId, trackTitle, open, onOpenChange }: AcrTrackCheckDialogProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const q = useQuery({
    queryKey: ["acr-track-checks", trackId],
    queryFn: () => jget<ChecksResponse>(`/api/distribution/acr/checks?trackId=${trackId}`),
    enabled: open,
    // Пока скан не закончился — подтягиваем результат сами, чтобы оператору
    // не приходилось закрывать и открывать окно.
    refetchInterval: (query) => {
      const data = query.state.data as ChecksResponse | undefined;
      const latest = data?.checks?.find((c) => c.engine === "acrcloud_fs");
      return latest?.status === "pending" ? 5_000 : false;
    },
  });

  const fsChecks = useMemo(
    () => (q.data?.checks ?? []).filter((c) => c.engine === "acrcloud_fs"),
    [q.data],
  );
  const latest = fsChecks[0];
  const matches = useMemo(() => readMatches(latest).map(toRichMatch), [latest]);
  const configured = q.data?.fileScanConfigured ?? false;
  const scanning = latest?.status === "pending";

  const scan = useMutation({
    mutationFn: () => jpost(`/api/distribution/acr/file-scan`, { trackId }),
    onSuccess: () => {
      toast({ title: "Проверка запущена", description: "Файл ушёл в ACRCloud. Результат появится здесь автоматически." });
      qc.invalidateQueries({ queryKey: ["acr-track-checks", trackId] });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Не удалось запустить проверку", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Music recognition matches by <span className="text-cyan-500">ACRCloud</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground truncate">{trackTitle}</p>
        </DialogHeader>

        {/* ── Панель запуска ── */}
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
          <div className="text-xs text-muted-foreground">
            {!configured ? (
              <span className="inline-flex items-center gap-1.5 text-rose-500">
                <Settings2 className="h-3.5 w-3.5" />
                Не настроено: Настройки → Интеграции → ACRCloud — проверка треков
              </span>
            ) : latest ? (
              <>Последняя проверка: {new Date(latest.scannedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</>
            ) : (
              <>Трек ещё не проверялся</>
            )}
          </div>
          <Button size="sm" className="h-8 gap-1.5" disabled={!configured || scanning || scan.isPending} onClick={() => scan.mutate()}>
            {scanning || scan.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
            {scanning ? "Сканируется…" : latest ? "Проверить заново" : "Проверить"}
          </Button>
        </div>

        {/* ── Результат ── */}
        {q.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Загружаем историю проверок…
          </div>
        ) : scanning ? (
          <div className="py-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Сканируем трек по базе ACRCloud…</p>
            <p className="text-xs text-muted-foreground mt-1">Файл отправлен целиком — обычно занимает 1–3 минуты.</p>
          </div>
        ) : !latest ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Нажмите «Проверить», чтобы найти совпадения по базе ACRCloud.
          </div>
        ) : latest.status === "error" ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-rose-600 dark:text-rose-400">
              <XCircle className="h-4 w-4" />Проверка не выполнена
            </div>
            <p className="text-xs text-muted-foreground mt-1 break-words">{latest.errorMessage ?? "Неизвестная ошибка"}</p>
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
            <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Совпадений не найдено</p>
            <p className="text-xs text-muted-foreground mt-1">
              Трек не найден в базе ACRCloud — по их данным он нигде не издан.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                Найдено совпадений: {matches.length}
              </Badge>
            </div>
            {matches.map((m, i) => (
              <div key={`${m.title}-${i}`} className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">#{i + 1} {m.title}</div>
                <MatchCard m={m} />
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
