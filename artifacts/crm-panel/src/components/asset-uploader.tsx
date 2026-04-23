import { useRef, useState } from "react";
import { usePresignAssetUpload, useConfirmAssetUpload, type Asset } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, ImageIcon, Music2, X, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type AssetKind = "audio" | "cover" | "image" | "document";

const KIND_ACCEPT: Record<AssetKind, string> = {
  audio: "audio/wav,audio/x-wav,audio/flac,audio/x-flac,audio/mpeg,audio/mp4,audio/aac",
  cover: "image/jpeg,image/png",
  image: "image/jpeg,image/png,image/webp",
  document: "application/pdf",
};

const KIND_MAX_BYTES: Record<AssetKind, number> = {
  audio: 200 * 1024 * 1024,
  cover: 25 * 1024 * 1024,
  image: 25 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};

/**
 * Convert an `assets.objectPath` (e.g. "/objects/uploads/<uuid>") into a URL
 * the browser can render. Falls back to the raw URL for legacy http(s) values.
 */
export function assetHref(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("/objects/")) return `/api/storage${path}`;
  return path;
}

interface UseAssetUploadResult {
  upload: (file: File, opts: {
    kind: AssetKind;
    releaseId?: number | null;
    trackId?: number | null;
    attach?: boolean;
  }) => Promise<Asset>;
  isUploading: boolean;
  progress: number;
}

export function useAssetUpload(): UseAssetUploadResult {
  const presign = usePresignAssetUpload();
  const confirm = useConfirmAssetUpload();
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  async function upload(file: File, opts: { kind: AssetKind; releaseId?: number | null; trackId?: number | null; attach?: boolean }): Promise<Asset> {
    setIsUploading(true);
    setProgress(0);
    try {
      const cap = KIND_MAX_BYTES[opts.kind];
      if (file.size > cap) {
        throw new Error(`Файл слишком большой (макс ${Math.round(cap / 1024 / 1024)} МБ).`);
      }
      const mime = file.type || "application/octet-stream";
      const presigned = await presign.mutateAsync({
        data: {
          kind: opts.kind,
          filename: file.name.slice(0, 250),
          mimeType: mime.slice(0, 120),
          sizeBytes: file.size,
          releaseId: opts.releaseId ?? null,
          trackId: opts.trackId ?? null,
        },
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presigned.uploadURL);
        xhr.setRequestHeader("Content-Type", mime);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Загрузка не удалась (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Сетевая ошибка при загрузке"));
        xhr.send(file);
      });

      const asset = await confirm.mutateAsync({
        data: {
          storageKey: presigned.storageKey,
          objectPath: presigned.objectPath,
          kind: opts.kind,
          filename: file.name.slice(0, 250),
          mimeType: mime.slice(0, 120),
          releaseId: opts.releaseId ?? null,
          trackId: opts.trackId ?? null,
          attach: opts.attach !== false,
        },
      });
      return asset;
    } finally {
      setIsUploading(false);
      // Leave progress at last value so UI can show "100%" momentarily.
      setTimeout(() => setProgress(0), 800);
    }
  }

  return { upload, isUploading, progress };
}

// ─── Cover uploader (square preview, JPG/PNG) ──────────────────────────
export function CoverUploader({
  value, onChange, releaseId, attach = true,
}: {
  value: string | null;
  onChange: (objectPath: string | null) => void;
  releaseId?: number | null;
  attach?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading, progress } = useAssetUpload();

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const asset = await upload(file, { kind: "cover", releaseId: releaseId ?? null, attach });
      onChange(asset.objectPath);
      toast({ title: "Обложка загружена", description: file.name });
    } catch (err: any) {
      toast({ title: "Не удалось загрузить", description: err?.message ?? "Ошибка", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      <div className="aspect-square rounded-lg overflow-hidden bg-muted border border-border/50 relative">
        {value ? (
          <img src={assetHref(value)} alt="Cover" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground/50 gap-2 bg-gradient-to-br from-indigo-900/20 to-violet-900/30">
            <ImageIcon className="h-10 w-10" />
            <span className="text-xs">Нет обложки</span>
          </div>
        )}
        {isUploading && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <Progress value={progress} className="w-full h-1.5" />
            <span className="text-[11px] text-muted-foreground">{progress}%</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef} type="file" accept={KIND_ACCEPT.cover} className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1" disabled={isUploading}
          onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1.5" /> {value ? "Заменить" : "Загрузить"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" className="text-rose-300" disabled={isUploading}
            onClick={() => onChange(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/70">JPG/PNG, ≤25 МБ. Рекомендуется 3000×3000 px.</p>
    </div>
  );
}

// ─── Audio uploader (per track) ────────────────────────────────────────
export function AudioUploader({
  value, onChange, trackId, durationSeconds,
}: {
  value: string | null;
  onChange: (objectPath: string | null, durationSeconds: number | null) => void;
  trackId: number;
  durationSeconds?: number | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading, progress } = useAssetUpload();

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const asset = await upload(file, { kind: "audio", trackId, attach: true });
      onChange(asset.objectPath, asset.durationSeconds ?? null);
      toast({
        title: "Аудио загружено",
        description: `${file.name}${asset.durationSeconds ? ` (${formatDuration(asset.durationSeconds)})` : ""}`,
      });
    } catch (err: any) {
      toast({ title: "Не удалось загрузить", description: err?.message ?? "Ошибка", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef} type="file" accept={KIND_ACCEPT.audio} className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex items-center gap-3 p-2 rounded-md bg-background/40 border border-border/50">
          <div className="h-8 w-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
            <Music2 className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <audio src={assetHref(value)} controls className="w-full h-8" preload="none" />
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {durationSeconds ? formatDuration(durationSeconds) : "—"}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={isUploading}
            onClick={() => inputRef.current?.click()}>
            Заменить
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="w-full justify-start" disabled={isUploading}
          onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          {isUploading ? `Загрузка ${progress}%…` : "Загрузить аудио (WAV/FLAC/MP3, ≤200 МБ)"}
        </Button>
      )}
      {isUploading && <Progress value={progress} className="h-1" />}
    </div>
  );
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
