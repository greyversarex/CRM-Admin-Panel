import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Download, Upload, FileText, CheckCircle2, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useMemo, useRef, useState } from "react";
import {
  useCreateRelease,
  useListArtists,
  useListLabels,
  getListReleasesQueryKey,
  getGetReleaseCountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

const RELEASE_TYPES = ["single", "album", "ep", "compilation"] as const;
type ReleaseType = (typeof RELEASE_TYPES)[number];

const COLUMNS = [
  "title",
  "releaseType",
  "artistId",
  "labelId",
  "upc",
  "genre",
  "releaseDate",
  "language",
  "isExplicit",
  "pLine",
  "cLine",
] as const;

const TEMPLATE_CSV =
  COLUMNS.join(",") +
  "\n" +
  [
    `"My First Single","single",1,,"","Pop","2026-05-01","English",false,"",""`,
    `"Summer EP","ep",1,,"","Dance Pop","2026-06-15","English",false,"",""`,
  ].join("\n") +
  "\n";

type ParsedRow = {
  index: number;
  raw: Record<string, string>;
  payload: {
    title: string;
    releaseType: ReleaseType;
    artistId: number;
    labelId: number | null;
    upc: string | null;
    genre: string | null;
    releaseDate: string | null;
    language: string | null;
    isExplicit: boolean;
    territories: string[];
    pLine: string | null;
    cLine: string | null;
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
  const headers = cleaned[0].map((h) => h.trim());
  const rows = cleaned.slice(1);
  return { headers, rows };
}

function toBool(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

export default function BulkUploadReleases() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const createRelease = useCreateRelease();
  const { data: artistsData } = useListArtists({ limit: 500 });
  const { data: labelsData } = useListLabels({ limit: 500 });

  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const isArtist = user?.role === "artist";
  const isLabel = user?.role === "label";
  const defaultArtistId = isArtist ? user?.artistId ?? null : null;
  const defaultLabelId = isLabel ? user?.labelId ?? null : null;

  const artistIds = useMemo(
    () => new Set(((artistsData as any)?.data ?? []).map((a: any) => Number(a.id))),
    [artistsData]
  );
  const labelIds = useMemo(
    () => new Set(((labelsData as any)?.data ?? []).map((l: any) => Number(l.id))),
    [labelsData]
  );

  const validate = (text: string): ParsedRow[] => {
    const { headers, rows: dataRows } = parseCsv(text);
    if (headers.length === 0) return [];
    const lower = headers.map((h) => h.toLowerCase());
    const idx = (name: string) => lower.indexOf(name.toLowerCase());

    return dataRows.map((cells, i) => {
      const raw: Record<string, string> = {};
      headers.forEach((h, j) => (raw[h] = (cells[j] ?? "").trim()));

      const get = (name: string) => {
        const j = idx(name);
        return j >= 0 ? (cells[j] ?? "").trim() : "";
      };

      const title = get("title");
      const typeStr = get("releaseType").toLowerCase();
      const artistStr = get("artistId");
      const labelStr = get("labelId");

      if (!title) {
        return { index: i, raw, payload: null, error: "Empty title", status: "pending" as const };
      }
      if (!RELEASE_TYPES.includes(typeStr as ReleaseType)) {
        return {
          index: i,
          raw,
          payload: null,
          error: `Invalid releaseType "${typeStr}". Use: ${RELEASE_TYPES.join(", ")}`,
          status: "pending" as const,
        };
      }

      let artistId: number;
      if (artistStr) {
        const n = Number(artistStr);
        if (!Number.isFinite(n) || n <= 0) {
          return { index: i, raw, payload: null, error: `Invalid artistId "${artistStr}"`, status: "pending" as const };
        }
        artistId = n;
      } else if (defaultArtistId) {
        artistId = defaultArtistId;
      } else {
        return { index: i, raw, payload: null, error: "Missing artistId", status: "pending" as const };
      }
      if (artistsData && artistIds.size > 0 && !artistIds.has(artistId)) {
        return { index: i, raw, payload: null, error: `Unknown artistId ${artistId}`, status: "pending" as const };
      }

      let labelId: number | null = null;
      if (labelStr) {
        const n = Number(labelStr);
        if (!Number.isFinite(n) || n <= 0) {
          return { index: i, raw, payload: null, error: `Invalid labelId "${labelStr}"`, status: "pending" as const };
        }
        labelId = n;
        if (labelsData && labelIds.size > 0 && !labelIds.has(labelId)) {
          return { index: i, raw, payload: null, error: `Unknown labelId ${labelId}`, status: "pending" as const };
        }
      } else if (defaultLabelId) {
        labelId = defaultLabelId;
      }

      const payload = {
        title,
        releaseType: typeStr as ReleaseType,
        artistId,
        labelId,
        upc: get("upc") || null,
        genre: get("genre") || null,
        releaseDate: get("releaseDate") || null,
        language: get("language") || null,
        isExplicit: toBool(get("isExplicit")),
        territories: ["WW"],
        pLine: get("pLine") || null,
        cLine: get("cLine") || null,
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
    a.download = "releases-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const validRows = rows.filter((r) => r.payload && !r.error);
  const invalidRows = rows.filter((r) => !r.payload || r.error);

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
        const created = await createRelease.mutateAsync({ data: r.payload as any });
        updated[i] = { ...updated[i], status: "ok", result: `#${(created as any).id}` };
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

    queryClient.invalidateQueries({ queryKey: getListReleasesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetReleaseCountsQueryKey() });

    const okCount = updated.filter((x) => x.status === "ok").length;
    const failCount = updated.filter((x) => x.status === "failed").length;
    toast({
      title: "Bulk upload finished",
      description: `Created ${okCount}, failed ${failCount}.`,
      variant: failCount > 0 ? "destructive" : "default",
    });
    setRunning(false);
    setDone(true);
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/releases")}
              className="mb-2 -ml-2"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Назад к релизам
            </Button>
            <h1 className="text-2xl font-semibold">Массовая загрузка релизов</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Загрузи CSV со списком релизов — каждая строка станет отдельным релизом в статусе
              «черновик». Треки и обложки можно добавить позже.
            </p>
          </div>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Скачать шаблон CSV
          </Button>
        </div>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="text-base">1. Выбери файл или вставь CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
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
              <Button onClick={() => fileRef.current?.click()} variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                Выбрать CSV-файл
              </Button>
              <span className="text-xs text-muted-foreground">или вставь содержимое ниже</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="csv-paste">CSV (с заголовком)</Label>
              <Textarea
                id="csv-paste"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={TEMPLATE_CSV}
                rows={6}
                className="font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={onParseText} disabled={!csvText.trim()}>
                  Разобрать
                </Button>
                {rows.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRows([]);
                      setCsvText("");
                      setProgress(0);
                      setDone(false);
                    }}
                  >
                    Очистить
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Колонки: <code className="text-foreground">{COLUMNS.join(", ")}</code>. Обязательны:
              title, releaseType, artistId
              {(isArtist || isLabel) && " (если пустой — подставится твой ID автоматически)"}.
              Допустимые releaseType: {RELEASE_TYPES.join(", ")}.
            </p>
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  2. Превью ({rows.length} строк)
                </CardTitle>
                <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                  <span className="text-emerald-400">Готовы: {validRows.length}</span>
                  {invalidRows.length > 0 && (
                    <span className="text-rose-400">С ошибками: {invalidRows.length}</span>
                  )}
                </div>
              </div>
              <Button
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
            </CardHeader>
            <CardContent className="space-y-3">
              {(running || done) && <Progress value={progress} className="h-2" />}
              <div className="overflow-x-auto rounded-md border border-border/50">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="text-left p-2 w-10">#</th>
                      <th className="text-left p-2 w-28">Статус</th>
                      <th className="text-left p-2">Title</th>
                      <th className="text-left p-2 w-24">Type</th>
                      <th className="text-left p-2 w-20">Artist</th>
                      <th className="text-left p-2 w-20">Label</th>
                      <th className="text-left p-2">Сообщение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.index} className="border-t border-border/30">
                        <td className="p-2 text-muted-foreground">{r.index + 2}</td>
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
                        <td className="p-2">{r.raw.title || <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-2">{r.raw.releaseType || "—"}</td>
                        <td className="p-2">{r.payload?.artistId ?? r.raw.artistId ?? "—"}</td>
                        <td className="p-2">{r.payload?.labelId ?? r.raw.labelId ?? "—"}</td>
                        <td className="p-2 text-rose-300">
                          {r.error ?? (r.result ? <span className="text-emerald-300">{r.result}</span> : "")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Номера строк соответствуют CSV (с учётом строки заголовка).
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
