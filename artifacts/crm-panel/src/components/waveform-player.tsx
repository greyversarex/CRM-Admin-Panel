// Аудиоплеер с визуализацией волнограммы (Canvas + нативный <audio>).
// Нативный <audio> с Range-стримингом — воспроизведение стартует мгновенно.
// Волнограмма строится из НАСТОЯЩИХ пиков аудио (Audio QC на сервере);
// пока анализа нет — рисуется нейтральный плейсхолдер.
// ВАЖНО: ResizeObserver наблюдает за wrapper-div, а НЕ за canvas,
//         чтобы не вызывать browser "ResizeObserver loop" error.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Play, Pause, Loader2, AlertTriangle, RefreshCw,
  CheckCircle2, AlertCircle, AlertOctagon, Info, ChevronDown, ChevronUp,
} from "lucide-react";
import { assetHref } from "@/components/asset-uploader";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

// ─── Audio QC types (contract: GET /api/tracks/:id/audio-qc) ─────────────────
export type AudioQcIssue = {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  startSec?: number;
  endSec?: number;
};
export type AudioQcResult = {
  id: number;
  trackId: number;
  objectPath: string;
  durationSec: number | null;
  sampleRateHz: number | null;
  channels: number | null;
  codec: string | null;
  bitDepth: number | null;
  integratedLufs: number | null;
  truePeakDb: number | null;
  peaks: number[] | null;
  issues: AudioQcIssue[];
  status: "pass" | "warning" | "error";
  analyzedAt: string;
} | null;

async function fetchAudioQc(trackId: number): Promise<AudioQcResult> {
  const res = await fetch(`/api/tracks/${trackId}/audio-qc`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as AudioQcResult;
}

const BAR_COUNT = 180;
const PLACEHOLDER = Array.from({ length: BAR_COUNT }, () => 0.12);

/** Сжимает массив пиков до нужного числа столбиков (max в бакете). */
function resamplePeaks(peaks: number[], count: number): number[] {
  if (peaks.length === 0) return PLACEHOLDER;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i / count) * peaks.length);
    const to = Math.max(from + 1, Math.floor(((i + 1) / count) * peaks.length));
    let mx = 0;
    for (let j = from; j < to; j++) mx = Math.max(mx, peaks[j]);
    out.push(mx);
  }
  const top = Math.max(...out, 0.001);
  return out.map((v) => Math.max(0.03, v / top));
}

export function WaveformPlayer({
  objectPath,
  filename,
  trackId,
  showQc = true,
}: {
  objectPath: string;
  filename?: string | null;
  /** Если передан — волнограмма строится из реальных пиков + показывается блок Audio QC. */
  trackId?: number | null;
  showQc?: boolean;
}) {
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const canvasRef     = useRef<HTMLCanvasElement | null>(null);
  // Наблюдаем за wrapper-div, а не за canvas — избегаем ResizeObserver loop.
  const wrapperRef    = useRef<HTMLDivElement | null>(null);
  const rafRef        = useRef<number | null>(null);
  const sizeRef       = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const [isPlaying, setIsPlaying] = useState(false);
  const [canPlay,   setCanPlay]   = useState(false);
  const [error,     setError]     = useState(false);
  const [current,   setCurrent]   = useState(0);
  const [duration,  setDuration]  = useState(0);

  const qcEnabled = trackId != null && trackId > 0;
  const qc = useQuery({
    queryKey: ["audio-qc", trackId, objectPath],
    queryFn: () => fetchAudioQc(trackId!),
    enabled: qcEnabled,
    staleTime: 60_000,
    retry: 1,
  });

  const bars = useMemo(
    () => (qc.data?.peaks && qc.data.peaks.length > 0 ? resamplePeaks(qc.data.peaks, BAR_COUNT) : PLACEHOLDER),
    [qc.data?.peaks],
  );
  const barsRef = useRef<number[]>(bars);
  barsRef.current = bars;

  // Маркеры проблем на волнограмме (доля 0..1 по времени).
  const markers = useMemo(() => {
    const d = qc.data?.durationSec || duration || 0;
    if (!qc.data || d <= 0) return [] as { from: number; to: number; color: string }[];
    return (qc.data.issues ?? [])
      .filter((i) => i.startSec != null)
      .map((i) => ({
        from: Math.min(1, (i.startSec ?? 0) / d),
        to: Math.min(1, ((i.endSec ?? (i.startSec ?? 0) + 0.5)) / d),
        color: i.severity === "error" ? "rgba(244,63,94,0.85)" : "rgba(251,146,60,0.75)",
      }));
  }, [qc.data, duration]);
  const markersRef = useRef(markers);
  markersRef.current = markers;

  // Сбрасываем всё при смене трека.
  useEffect(() => {
    setCanPlay(false); setError(false); setIsPlaying(false);
    setCurrent(0);     setDuration(0);
  }, [objectPath]);

  const draw = useCallback((progress: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    if (W === 0 || H === 0) return;

    ctx.clearRect(0, 0, W, H);

    const bars = barsRef.current;
    if (!bars.length) return;

    const gap  = 2;
    const barW = Math.max(1, (W - gap * (bars.length - 1)) / bars.length);
    const playedIdx = Math.floor(progress * bars.length);

    for (let i = 0; i < bars.length; i++) {
      const x    = i * (barW + gap);
      const barH = Math.max(3, bars[i] * H * 0.88);
      const y    = (H - barH) / 2;

      ctx.fillStyle = i < playedIdx
        ? "rgba(129, 140, 248, 0.95)"  // indigo-400 — сыгранная часть
        : "rgba(148, 163, 184, 0.30)"; // slate-400  — несыгранная
      ctx.fillRect(x, y, barW, barH);
    }

    // Подсветка проблемных участков (клиппинг — красный, тишина — оранжевый).
    for (const m of markersRef.current) {
      const x = m.from * W;
      const w = Math.max(2, (m.to - m.from) * W);
      ctx.fillStyle = m.color.replace(/[\d.]+\)$/, "0.14)");
      ctx.fillRect(x, 0, w, H);
      ctx.fillStyle = m.color;
      ctx.fillRect(x, H - 3, w, 3);
    }
  }, []);

  // rAF-перерисовка при изменении позиции / длительности / данных QC.
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      draw(duration > 0 ? current / duration : 0);
    });
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [current, duration, draw, bars, markers]);

  // Масштабирование canvas.
  // КРИТИЧНО: наблюдаем wrapper-div, а НЕ canvas. Изменение canvas.width/height
  // не влияет на размер wrapper-div, поэтому loop не возникает.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas  = canvasRef.current;
    if (!wrapper || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const applySize = (w: number, h: number) => {
      if (w === 0 || h === 0) return;
      if (sizeRef.current.w === w && sizeRef.current.h === h) return;
      sizeRef.current = { w, h };
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      draw(duration > 0 ? current / duration : 0);
    };

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        applySize(width, height);
      }
    });

    ro.observe(wrapper);
    const rect = wrapper.getBoundingClientRect();
    applySize(rect.width, rect.height);

    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, objectPath]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(true);
      });
    } else {
      a.pause();
    }
  };

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const a      = audioRef.current;
    const canvas = canvasRef.current;
    if (!a || !canvas || !canPlay || !duration) return;
    const rect  = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setCurrent(a.currentTime);
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-[#0d0f18] px-4 py-3 space-y-1.5">
      {/* Основная строка: кнопка + время + волнограмма + время */}
      <div className="flex items-center gap-3">

        {/* Play / Pause */}
        <Button
          type="button"
          size="icon"
          className="shrink-0 h-9 w-9 rounded-full bg-primary hover:bg-primary/80 text-white border-0"
          style={{ boxShadow: "none", minHeight: 0 }}
          disabled={!canPlay || error}
          onClick={togglePlay}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
        >
          {!canPlay && !error ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </Button>

        {/* Текущее время */}
        <span className="shrink-0 text-[11px] font-mono text-muted-foreground tabular-nums w-9">
          {fmt(current)}
        </span>

        {/* Wrapper-div наблюдается ResizeObserver; canvas внутри него */}
        <div ref={wrapperRef} className="flex-1 h-12 relative">
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            className="absolute inset-0 w-full h-full block"
            style={{ cursor: canPlay && !error ? "pointer" : "default" }}
            aria-label="Волнограмма"
          />
          {qcEnabled && qc.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground/60 gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Анализ аудио…
            </div>
          )}
        </div>

        {/* Продолжительность */}
        <span className="shrink-0 text-[11px] font-mono text-muted-foreground tabular-nums w-9 text-right">
          {error ? "—" : fmt(duration)}
        </span>
      </div>

      {/* Имя файла или ошибка */}
      {error ? (
        <div className="flex items-center gap-1.5 text-xs text-rose-400 pl-12">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Не удалось загрузить аудио для предпрослушивания.
        </div>
      ) : filename ? (
        <div className="text-[11px] text-muted-foreground/70 truncate pl-12">{filename}</div>
      ) : null}

      {/* ── Audio QC ── */}
      {qcEnabled && showQc && <AudioQcPanel trackId={trackId!} qc={qc.data ?? null} isLoading={qc.isLoading} />}

      <audio
        ref={audioRef}
        src={assetHref(objectPath)}
        preload="metadata"
        onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration || 0); setCanPlay(true); }}
        onCanPlay={() => setCanPlay(true)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setError(true)}
        className="hidden"
      />
    </div>
  );
}

// ─── Панель результатов Audio QC ─────────────────────────────────────────────
function severityIcon(s: AudioQcIssue["severity"]) {
  if (s === "error") return <AlertOctagon className="h-3.5 w-3.5 text-rose-400 shrink-0" />;
  if (s === "warning") return <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
  return <Info className="h-3.5 w-3.5 text-yellow-300/80 shrink-0" />;
}

export function AudioQcPanel({ trackId, qc, isLoading }: { trackId: number; qc: AudioQcResult; isLoading: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const rerun = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tracks/${trackId}/audio-qc`, { method: "POST", credentials: "same-origin" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["audio-qc", trackId] }),
  });

  if (isLoading) return null;
  if (!qc) {
    return (
      <div className="flex items-center gap-2 pl-12 pt-1 text-[11px] text-muted-foreground/70">
        Audio QC: анализ ещё не выполнялся.
        <button
          type="button"
          className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
          disabled={rerun.isPending}
          onClick={() => rerun.mutate()}
        >
          {rerun.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Запустить
        </button>
        {rerun.isError && <span className="text-rose-400">{(rerun.error as Error).message}</span>}
      </div>
    );
  }

  const badge =
    qc.status === "error" ? (
      <span className="inline-flex items-center gap-1 text-rose-400"><AlertOctagon className="h-3.5 w-3.5" /> Ошибки QC</span>
    ) : qc.status === "warning" ? (
      <span className="inline-flex items-center gap-1 text-amber-400"><AlertCircle className="h-3.5 w-3.5" /> Предупреждения QC</span>
    ) : (
      <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Audio passed QC</span>
    );

  const tech: string[] = [];
  if (qc.integratedLufs != null) tech.push(`${qc.integratedLufs.toFixed(1)} LUFS`);
  if (qc.truePeakDb != null) tech.push(`TP ${qc.truePeakDb > 0 ? "+" : ""}${qc.truePeakDb.toFixed(1)} dBTP`);
  if (qc.sampleRateHz) tech.push(`${(qc.sampleRateHz / 1000).toFixed(1)} kHz`);
  if (qc.channels) tech.push(qc.channels === 2 ? "Stereo" : qc.channels === 1 ? "Mono" : `${qc.channels} ch`);
  if (qc.bitDepth) tech.push(`${qc.bitDepth} bit`);

  const issues = qc.issues ?? [];

  return (
    <div className="pl-12 pt-1 space-y-1">
      <div className="flex items-center gap-3 text-[11px]">
        {badge}
        <span className="text-muted-foreground/70 font-mono">{tech.join(" · ")}</span>
        {issues.length > 0 && (
          <button type="button" className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {issues.length} замечани{issues.length === 1 ? "е" : issues.length < 5 ? "я" : "й"}
          </button>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-1 text-muted-foreground/60 hover:text-foreground disabled:opacity-50"
          title="Перезапустить анализ"
          disabled={rerun.isPending}
          onClick={() => rerun.mutate()}
        >
          {rerun.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
      </div>
      {open && issues.length > 0 && (
        <ul className="space-y-0.5">
          {issues.map((i, idx) => (
            <li key={idx} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              {severityIcon(i.severity)}
              <span>{i.message}</span>
            </li>
          ))}
        </ul>
      )}
      {rerun.isError && (
        <div className="text-[11px] text-rose-400">{(rerun.error as Error).message}</div>
      )}
    </div>
  );
}
