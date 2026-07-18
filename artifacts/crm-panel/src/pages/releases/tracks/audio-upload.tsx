// Страница массовой загрузки стерео-аудио для релиза — Symphonic-style.
// Маршрут: /releases/:id/tracks/:tid/audio-upload
// Поддерживает drag&drop нескольких файлов, проверяет тип на клиенте и
// технические характеристики (частота/битность/стерео) на сервере, показывая
// причину отказа по каждому файлу. Загруженные файлы попадают в пул релиза и
// затем доступны в выпадающем списке «Audio File» на странице трека.
import { useCallback, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRelease,
  getListAssetsQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, UploadCloud, Music2, CheckCircle2, AlertTriangle, Loader2, FileAudio,
} from "lucide-react";
import { useAssetUpload } from "@/components/asset-uploader";
import { useLang } from "@/lib/i18n";

// Допустимые расширения/типы на клиенте (быстрый отказ до загрузки).
const ALLOWED_EXT = [".wav", ".wave", ".aif", ".aiff", ".aifc", ".flac"];
function isAllowedType(file: File): boolean {
  const name = file.name.toLowerCase();
  return ALLOWED_EXT.some((e) => name.endsWith(e));
}

type Status = "pending" | "uploading" | "done" | "error";
type Row = {
  id: string;
  file: File;
  status: Status;
  progress: number;
  error?: string;
};

let rowSeq = 0;

export default function AudioUploadPage() {
  const params = useParams<{ id: string; tid: string }>();
  const releaseId = Number(params.id);
  const trackId = Number(params.tid);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { upload } = useAssetUpload();
  const { t } = useLang();
  const A = t.audioUpload;

  const { data: release } = useGetRelease(releaseId, {
    query: { enabled: Number.isFinite(releaseId) && releaseId > 0 },
  } as never);

  const [rows, setRows] = useState<Row[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const backToTrack = () => setLocation(`/releases/${releaseId}/tracks/${trackId}/edit`);

  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const uploadOne = useCallback(
    async (row: Row) => {
      // Клиентская проверка типа — без загрузки сети.
      if (!isAllowedType(row.file)) {
        setRow(row.id, { status: "error", error: A.invalidType, progress: 0 });
        return;
      }
      setRow(row.id, { status: "uploading", progress: 0, error: undefined });
      try {
        await upload(row.file, {
          kind: "audio",
          releaseId,
          trackId,
          attach: true,
          audioProfile: "stereo",
          onProgress: (pct) => setRow(row.id, { progress: pct }),
        });
        setRow(row.id, { status: "done", progress: 100 });
        // Обновляем пул аудио релиза, чтобы выпадающий список на странице трека
        // сразу увидел новый файл.
        void queryClient.invalidateQueries({
          queryKey: getListAssetsQueryKey({ release_id: releaseId, kind: "audio" }),
        });
      } catch (e: any) {
        const msg =
          e?.response?.data?.error ??
          e?.data?.error ??
          e?.message ??
          A.uploadFailed;
        setRow(row.id, { status: "error", error: String(msg), progress: 0 });
      }
    },
    [releaseId, upload, queryClient, A],
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const incoming: Row[] = Array.from(files).map((file) => ({
        id: `r${++rowSeq}`,
        file,
        status: "pending" as Status,
        progress: 0,
      }));
      if (incoming.length === 0) return;
      setRows((prev) => [...prev, ...incoming]);
      setBusy(true);
      // Загружаем по очереди — стабильно для крупных WAV и понятный прогресс.
      for (const row of incoming) {
        await uploadOne(row);
      }
      setBusy(false);
    },
    [uploadOne],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
  };

  if (!Number.isFinite(releaseId) || !Number.isFinite(trackId)) {
    return <Layout><div className="p-6 text-sm text-rose-300">{A.invalidParams}</div></Layout>;
  }

  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto pb-28">
        {/* Back */}
        <div className="mb-4">
          <button
            onClick={backToTrack}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent/30 border border-border/40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {A.backToRelease}
          </button>
        </div>

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Music2 className="h-5 w-5 text-primary" />
            {A.titleWith.replace("{name}", release?.title ? `«${release.title}»` : A.titleFallback)}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {A.subtitle}
          </p>
        </div>

        {/* Drop zone */}
        <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
          <CardContent className="p-6">
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={[
                "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border/60 hover:border-border hover:bg-accent/20",
              ].join(" ")}
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div className="text-sm font-medium">
                {A.dropHint}
              </div>
              <div className="text-xs text-muted-foreground">
                {A.formatsHint}
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="audio/wav,audio/x-wav,audio/wave,audio/aiff,audio/x-aiff,audio/flac,audio/x-flac,.wav,.aif,.aiff,.aifc,.flac"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </CardContent>
        </Card>

        {/* File list */}
        {rows.length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-muted-foreground">
                {A.filesCount.replace("{count}", String(rows.length))}{doneCount ? A.uploadedSuffix.replace("{count}", String(doneCount)) : ""}
                {errorCount ? A.errorSuffix.replace("{count}", String(errorCount)) : ""}
              </span>
            </div>

            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2.5"
              >
                <div className={[
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0 border",
                  row.status === "done"  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" :
                  row.status === "error" ? "bg-rose-500/15 border-rose-500/30 text-rose-300" :
                  "bg-muted/40 border-border/50 text-muted-foreground",
                ].join(" ")}>
                  {row.status === "done"  ? <CheckCircle2 className="h-4 w-4" /> :
                   row.status === "error" ? <AlertTriangle className="h-4 w-4" /> :
                   row.status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> :
                   <FileAudio className="h-4 w-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{row.file.name}</div>
                  {row.status === "uploading" && (
                    <Progress value={row.progress} className="h-1 mt-1.5" />
                  )}
                  {row.status === "error" && row.error && (
                    <div className="text-xs text-rose-300 mt-0.5">{row.error}</div>
                  )}
                  {row.status === "done" && (
                    <div className="text-xs text-emerald-300/80 mt-0.5">{A.uploadDone}</div>
                  )}
                </div>

                <div className="shrink-0 text-[11px] text-muted-foreground font-mono">
                  {(row.file.size / 1024 / 1024).toFixed(1)} {A.megabytes}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-8 flex items-center justify-between">
          <Button variant="outline" onClick={backToTrack} disabled={busy}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> {A.backToRelease}
          </Button>
          {busy && (
            <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" /> {A.uploading}
            </span>
          )}
        </div>
      </div>
    </Layout>
  );
}
