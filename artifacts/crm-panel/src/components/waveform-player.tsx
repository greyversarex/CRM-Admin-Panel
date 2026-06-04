// Плеер с отрисовкой волны для прослушивания загруженного аудио.
// Использует wavesurfer.js: тянет файл через /api/storage proxy (с cookie),
// рисует волну и даёт play/pause + перемотку кликом по дорожке.
import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Button } from "@/components/ui/button";
import { Play, Pause, Loader2, AlertTriangle } from "lucide-react";
import { assetHref } from "@/components/asset-uploader";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function WaveformPlayer({
  objectPath,
  filename,
}: {
  objectPath: string;
  filename?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    setIsReady(false);
    setError(false);
    setIsPlaying(false);
    setCurrent(0);
    setDuration(0);

    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 64,
      waveColor: "#4b5563",
      progressColor: "#6366f1",
      cursorColor: "#a5b4fc",
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      url: assetHref(objectPath),
    });
    wsRef.current = ws;

    ws.on("ready", () => {
      setIsReady(true);
      setDuration(ws.getDuration());
    });
    ws.on("timeupdate", (t: number) => setCurrent(t));
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));
    ws.on("error", () => setError(true));

    return () => {
      try { ws.destroy(); } catch { /* noop */ }
      wsRef.current = null;
    };
  }, [objectPath]);

  return (
    <div className="rounded-md border border-border/50 bg-background/40 p-3">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="shrink-0 h-10 w-10 rounded-full"
          disabled={!isReady || error}
          onClick={() => wsRef.current?.playPause()}
        >
          {!isReady && !error
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : isPlaying
              ? <Pause className="h-4 w-4" />
              : <Play className="h-4 w-4 ml-0.5" />}
        </Button>

        <div className="flex-1 min-w-0">
          {filename && (
            <div className="text-xs text-muted-foreground truncate mb-1">{filename}</div>
          )}
          <div ref={containerRef} className="w-full" />
        </div>

        <div className="shrink-0 text-[11px] font-mono text-muted-foreground tabular-nums w-[88px] text-right">
          {error ? "—" : `${fmt(current)} / ${fmt(duration)}`}
        </div>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5" /> Не удалось загрузить аудио для предпрослушивания.
        </div>
      )}
    </div>
  );
}
