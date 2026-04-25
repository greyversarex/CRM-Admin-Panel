import { useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, FileText, CheckCircle2, XCircle, ListPlus } from "lucide-react";
import { useCreateTrack, getGetReleaseQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const TRACK_COLUMNS = [
  "title",
  "isrc",
  "durationSeconds",
  "trackNumber",
  "genre",
  "language",
  "isExplicit",
  "composerName",
  "lyricistName",
  "iswc",
] as const;

const TEMPLATE_CSV =
  TRACK_COLUMNS.join(",") +
  "\n" +
  [
    `"Intro","",95,1,"Pop","English",false,"","",""`,
    `"Main Track","USRC17607839",217,2,"Pop","English",false,"John Doe","Jane Roe",""`,
    `"Outro","",84,3,"Pop","English",false,"","",""`,
  ].join("\n") +
  "\n";

type ParsedTrack = {
  index: number;
  raw: Record<string, string>;
  payload: {
    title: string;
    artistId: number;
    releaseId: number;
    isrc: string | null;
    durationSeconds: number | null;
    trackNumber: number | null;
    genre: string | null;
    language: string | null;
    isExplicit: boolean;
    composerName: string | null;
    lyricistName: string | null;
    iswc: string | null;
  } | null;
  error: string | null;
  status: "pending" | "uploading" | "ok" | "failed";
  result?: string;
};

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const out: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\r") {
        // ignore
      } else if (c === "\n") {
        cur.push(field);
        out.push(cur);
        cur = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    out.push(cur);
  }
  const cleaned = out.filter((r) => r.some((cell) => cell.trim().length > 0));
  if (cleaned.length === 0) return { headers: [], rows: [] };
  return { headers: cleaned[0].map((h) => h.trim()), rows: cleaned.slice(1) };
}

function toBool(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

// Parses "3:45" or "225" or "3m45s" into seconds (or null).
function parseDuration(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const mm = s.match(/^(\d+):([0-5]?\d)$/);
  if (mm) return Number(mm[1]) * 60 + Number(mm[2]);
  const ms = s.match(/^(\d+)m(\d+)s?$/i);
  if (ms) return Number(ms[1]) * 60 + Number(ms[2]);
  return null;
}

export function BulkTracksDialog({
  releaseId,
  artistId,
  defaultLanguage,
  defaultGenre,
  startTrackNumber,
  trigger,
  onUploaded,
}: {
  releaseId: number;
  artistId: number;
  defaultLanguage: string;
  defaultGenre: string;
  startTrackNumber: number;
  trigger?: React.ReactNode;
  onUploaded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<ParsedTrack[]>([]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const queryClient = useQueryClient();
  const createTrack = useCreateTrack();

  const validRows = useMemo(() => rows.filter((r) => r.payload && !r.error), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => !r.payload || r.error), [rows]);

  const validate = (text: string): ParsedTrack[] => {
    const { headers, rows: dataRows } = parseCsv(text);
    if (headers.length === 0) return [];
    const lower = headers.map((h) => h.toLowerCase());
    const idx = (name: string) => lower.indexOf(name.toLowerCase());

    let autoNumber = startTrackNumber;
    return dataRows.map((cells, i) => {
      const raw: Record<string, string> = {};
      headers.forEach((h, j) => (raw[h] = (cells[j] ?? "").trim()));
      const get = (name: string) => {
        const j = idx(name);
        return j >= 0 ? (cells[j] ?? "").trim() : "";
      };

      const title = get("title");
      if (!title) {
        return { index: i, raw, payload: null, error: "Empty title", status: "pending" as const };
      }

      const trackNumStr = get("trackNumber");
      let trackNumber: number | null = null;
      if (trackNumStr) {
        const n = Number(trackNumStr);
        if (!Number.isFinite(n) || n <= 0) {
          return {
            index: i,
            raw,
            payload: null,
            error: `Invalid trackNumber "${trackNumStr}"`,
            status: "pending" as const,
          };
        }
        trackNumber = n;
      } else {
        trackNumber = autoNumber++;
      }

      const durStr = get("durationSeconds");
      let durationSeconds: number | null = null;
      if (durStr) {
        const d = parseDuration(durStr);
        if (d === null) {
          return {
            index: i,
            raw,
            payload: null,
            error: `Invalid duration "${durStr}" (use seconds or "m:ss")`,
            status: "pending" as const,
          };
        }
        durationSeconds = d;
      }

      const payload = {
        title,
        artistId,
        releaseId,
        isrc: get("isrc") || null,
        durationSeconds,
        trackNumber,
        genre: get("genre") || defaultGenre || null,
        language: get("language") || defaultLanguage || null,
        isExplicit: toBool(get("isExplicit")),
        composerName: get("composerName") || null,
        lyricistName: get("lyricistName") || null,
        iswc: get("iswc") || null,
      };

      return { index: i, raw, payload, error: null, status: "pending" as const };
    });
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      setRows(validate(text));
      setDone(false);
      setProgress(0);
    };
    reader.readAsText(file);
  };

  const onParseText = () => {
    setRows(validate(csvText));
    setDone(false);
    setProgress(0);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tracks-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setRows([]);
    setCsvText("");
    setProgress(0);
    setDone(false);
  };

  const onUploadAll = async () => {
    if (validRows.length === 0) return;
    setRunning(true);
    setDone(false);
    setProgress(0);

    const updated = [...rows];
    let completed = 0;

    for (let i = 0; i < updated.length; i++) {
      const r = updated[i];
      if (!r.payload || r.error) continue;
      updated[i] = { ...r, status: "uploading" };
      setRows([...updated]);
      try {
        const created = await createTrack.mutateAsync({ data: r.payload as any });
        updated[i] = {
          ...updated[i],
          status: "ok",
          result: `#${(created as any).id}`,
        };
      } catch (e: any) {
        updated[i] = {
          ...updated[i],
          status: "failed",
          error: e?.response?.data?.error ?? e?.message ?? "Upload failed",
        };
      }
      completed++;
      setProgress(Math.round((completed / validRows.length) * 100));
      setRows([...updated]);
    }

    queryClient.invalidateQueries({ queryKey: getGetReleaseQueryKey(releaseId) });
    onUploaded?.();

    const okCount = updated.filter((x) => x.status === "ok").length;
    const failCount = updated.filter((x) => x.status === "failed").length;
    toast({
      title: "Загрузка треков завершена",
      description: `Создано ${okCount}, ошибок ${failCount}.`,
      variant: failCount > 0 ? "destructive" : "default",
    });
    setRunning(false);
    setDone(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <ListPlus className="h-3.5 w-3.5 mr-1.5" />
          Загрузить треки CSV
        </Button>
      )}
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Массовая загрузка треков</DialogTitle>
          <DialogDescription>
            Загрузи CSV — каждая строка станет треком в этом релизе. Аудиофайлы прикрепишь позже на
            странице каждого трека.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileText className="mr-2 h-4 w-4" />
              Выбрать CSV
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Шаблон
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              Новые треки начнутся с #{startTrackNumber}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-tracks-csv" className="text-xs">
              CSV (с заголовком)
            </Label>
            <Textarea
              id="bulk-tracks-csv"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={TEMPLATE_CSV}
              rows={5}
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={onParseText} disabled={!csvText.trim()}>
                Разобрать
              </Button>
              {rows.length > 0 && (
                <Button size="sm" variant="ghost" onClick={reset}>
                  Очистить
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Колонки: <code className="text-foreground">{TRACK_COLUMNS.join(", ")}</code>.
              Обязателен только <b>title</b>. Длительность — в секундах или формате <code>m:ss</code>
              .
            </p>
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground flex gap-3">
                  <span>Всего: {rows.length}</span>
                  <span className="text-emerald-400">Готовы: {validRows.length}</span>
                  {invalidRows.length > 0 && (
                    <span className="text-rose-400">Ошибки: {invalidRows.length}</span>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={onUploadAll}
                  disabled={running || validRows.length === 0 || done}
                  className="bg-primary"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {running
                    ? `Загрузка… ${progress}%`
                    : done
                      ? "Готово"
                      : `Загрузить ${validRows.length}`}
                </Button>
              </div>
              {(running || done) && <Progress value={progress} className="h-2" />}
              <div className="overflow-x-auto rounded-md border border-border/50 max-h-[40vh]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 text-muted-foreground sticky top-0">
                    <tr>
                      <th className="text-left p-2 w-10">#</th>
                      <th className="text-left p-2 w-12">№</th>
                      <th className="text-left p-2 w-28">Статус</th>
                      <th className="text-left p-2">Title</th>
                      <th className="text-left p-2 w-20">Длит.</th>
                      <th className="text-left p-2">Сообщение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.index} className="border-t border-border/30">
                        <td className="p-2 text-muted-foreground">{r.index + 2}</td>
                        <td className="p-2">{r.payload?.trackNumber ?? "—"}</td>
                        <td className="p-2">
                          {r.status === "ok" && (
                            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Создан
                            </Badge>
                          )}
                          {r.status === "failed" && (
                            <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/30">
                              <XCircle className="h-3 w-3 mr-1" />
                              Ошибка
                            </Badge>
                          )}
                          {r.status === "uploading" && (
                            <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">
                              Загрузка…
                            </Badge>
                          )}
                          {r.status === "pending" && !r.error && (
                            <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                              Готов
                            </Badge>
                          )}
                          {r.status === "pending" && r.error && (
                            <Badge variant="outline" className="text-rose-400 border-rose-500/30">
                              Невалиден
                            </Badge>
                          )}
                        </td>
                        <td className="p-2">{r.raw.title || "—"}</td>
                        <td className="p-2 text-muted-foreground">
                          {r.payload?.durationSeconds
                            ? `${Math.floor(r.payload.durationSeconds / 60)}:${String(
                                r.payload.durationSeconds % 60,
                              ).padStart(2, "0")}`
                            : "—"}
                        </td>
                        <td className="p-2 text-rose-300">
                          {r.error ?? (r.result ? <span className="text-emerald-300">{r.result}</span> : "")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
