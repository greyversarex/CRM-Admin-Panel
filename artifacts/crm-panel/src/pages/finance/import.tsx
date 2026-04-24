import { useState, useRef, useCallback, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowLeft, X, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Link } from "wouter";

const DSP_OPTIONS: { value: string; label: string }[] = [
  { value: "spotify",       label: "Spotify" },
  { value: "apple_music",   label: "Apple Music" },
  { value: "youtube_music", label: "YouTube Music" },
  { value: "tiktok",        label: "TikTok" },
];

interface PreviewSampleRow {
  isrc: string | null;
  title: string | null;
  artist: string | null;
  countryCode: string | null;
  streams: number;
  revenue: number;
  currency: string;
  matched: boolean;
}

interface PreviewResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  matchedRows: number;
  unmatchedRows: number;
  sample: PreviewSampleRow[];
  summary: { totalRevenue: number; currency: string; period: string | null; dsp: string };
  warnings: string[];
  existingTransactionsForPeriod: number;
}

interface CommitResult {
  importId: number;
  inserted: number;
  unmatched: number;
  transactions: number;
  totalRevenue: number;
  currency: string;
  period: string;
  duplicate: boolean;
  hadExistingTransactions: boolean;
}

interface ImportRow {
  id: number;
  dsp: string;
  period: string;
  filename: string;
  totalRows: number;
  insertedRows: number;
  unmatchedRows: number;
  totalRevenue: number;
  currency: string;
  createdAt: string;
}

export default function FinanceImport() {
  const [file, setFile] = useState<File | null>(null);
  const [dsp, setDsp] = useState<string>("spotify");
  const [period, setPeriod] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [imporsLoading, setImportsLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  // Force-флаг: явное подтверждение «correction import», когда за тот же период
  // уже есть transactions. Сбрасываем при ресете и при новом preview.
  const [forceCorrection, setForceCorrection] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImports = useCallback(async () => {
    setImportsLoading(true);
    try {
      const res = await fetch("/api/finance/imports?limit=20", { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setImports(data);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не удалось загрузить историю", description: e?.message });
    } finally {
      setImportsLoading(false);
    }
  }, []);

  useEffect(() => { void loadImports(); }, [loadImports]);

  const resetWizard = () => {
    setFile(null);
    setPreview(null);
    setPeriod("");
    setForceCorrection(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFileSelected = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setForceCorrection(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFileSelected(f);
  };

  const runPreview = async () => {
    if (!file || !dsp) return;
    setPreviewing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dsp", dsp);
      const res = await fetch("/api/finance/ingest/preview", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setPreview(data);
      if (data.summary?.period) setPeriod(data.summary.period);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Preview не удался", description: e?.message ?? String(e) });
    } finally {
      setPreviewing(false);
    }
  };

  const runCommit = async () => {
    if (!file || !dsp || !period) return;
    if (!/^\d{4}-\d{2}$/.test(period)) {
      toast({ variant: "destructive", title: "Период должен быть в формате YYYY-MM" });
      return;
    }
    setCommitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dsp", dsp);
      fd.append("period", period);
      if (forceCorrection) fd.append("force", "true");
      const res = await fetch("/api/finance/ingest/commit", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const data: CommitResult = await res.json();
      if (!res.ok) {
        // 409: server-side guard сработал — уже есть transactions за этот dsp+period.
        if (res.status === 409 && (data as any)?.code === "existing_transactions") {
          toast({
            variant: "destructive",
            title: "Уже есть данные за этот период",
            description: `${(data as any).existingTransactions} transactions найдено. Поставьте галочку «correction-import», чтобы добавить ещё.`,
          });
          setCommitting(false);
          return;
        }
        throw new Error((data as any)?.error ?? `HTTP ${res.status}`);
      }
      if (data.duplicate) {
        toast({
          title: "Этот файл уже импортирован",
          description: `Import #${data.importId}: ${data.inserted} строк, ${data.unmatched} unmatched. Новых записей не добавлено.`,
        });
      } else {
        toast({
          title: "Импорт завершён",
          description: `+${data.inserted} usage_reports, +${data.transactions} transactions, ${data.unmatched} unmatched. Доход: ${data.totalRevenue.toLocaleString()} ${data.currency}`,
        });
      }
      resetWizard();
      void loadImports();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Commit не удался", description: e?.message ?? String(e) });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/finance"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Revenue Ingestion</h1>
              <p className="text-muted-foreground mt-1">Импорт CSV-отчётов от DSP. Парсинг → preview → commit. Дедуп по SHA256+DSP+период.</p>
            </div>
          </div>
        </div>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              Шаг 1: Загрузить файл
            </CardTitle>
            <CardDescription className="text-xs">Поддерживается Spotify, Apple Music, YouTube Music, TikTok. Max 50 MB.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dsp">DSP / Платформа</Label>
                <Select value={dsp} onValueChange={(v) => { setDsp(v); setPreview(null); }}>
                  <SelectTrigger data-testid="select-dsp"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DSP_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="period">Период (YYYY-MM)</Label>
                <Input
                  id="period"
                  data-testid="input-period"
                  placeholder="2026-03 (auto-detected from preview)"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                />
              </div>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 py-10 rounded-md border-2 border-dashed cursor-pointer transition-colors ${
                dragOver ? "border-primary/60 bg-primary/5" : "border-border bg-card/30 hover:border-primary/40"
              }`}
              data-testid="dropzone-csv"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              {file ? (
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); resetWizard(); }}><X className="h-3 w-3" /></Button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Перетащите CSV/TSV сюда или <span className="text-primary underline">выберите файл</span></p>
                  <p className="text-xs text-muted-foreground/60 font-mono">Spotify, Apple, YouTube, TikTok · max 50 MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,text/csv"
                className="hidden"
                onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={resetWizard}
                disabled={!file || previewing || committing}
                data-testid="button-reset"
              >Сбросить</Button>
              <Button
                onClick={runPreview}
                disabled={!file || previewing || committing}
                data-testid="button-preview"
              >
                {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Preview
              </Button>
            </div>
          </CardContent>
        </Card>

        {preview && (
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-base">Шаг 2: Проверить preview</CardTitle>
              <CardDescription className="text-xs">Совпадения по ISRC. Несовпавшие строки попадут в ingestion_unmatched для ручного review.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-5">
                <Stat label="Total" value={preview.totalRows.toLocaleString()} />
                <Stat label="Valid" value={preview.validRows.toLocaleString()} />
                <Stat label="Matched" value={preview.matchedRows.toLocaleString()} accent="text-emerald-400" />
                <Stat label="Unmatched" value={preview.unmatchedRows.toLocaleString()} accent="text-amber-400" />
                <Stat
                  label={`Revenue (${preview.summary.currency})`}
                  value={preview.summary.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  accent="text-primary"
                />
              </div>

              {preview.summary.period && (
                <div className="text-xs text-muted-foreground">
                  Detected period: <span className="font-mono text-foreground">{preview.summary.period}</span>
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 space-y-1">
                  {preview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}

              <div className="rounded border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ISRC</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">Streams</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead>Match</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sample.map((r, i) => (
                      <TableRow key={i} data-testid={`row-preview-${i}`}>
                        <TableCell className="font-mono text-xs">{r.isrc ?? "—"}</TableCell>
                        <TableCell className="text-sm">{r.title ?? "—"}</TableCell>
                        <TableCell className="text-sm">{r.artist ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.countryCode ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{r.streams.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{r.revenue.toFixed(4)} {r.currency}</TableCell>
                        <TableCell>
                          {r.matched
                            ? <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20"><CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Matched</Badge>
                            : <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20"><AlertTriangle className="h-2.5 w-2.5 mr-1" /> Unmatched</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {preview.existingTransactionsForPeriod > 0 && (
                <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
                  <Checkbox
                    id="force-correction"
                    checked={forceCorrection}
                    onCheckedChange={(v) => setForceCorrection(v === true)}
                    data-testid="checkbox-force-correction"
                    className="mt-0.5"
                  />
                  <Label htmlFor="force-correction" className="text-xs leading-relaxed cursor-pointer text-amber-200">
                    Я понимаю, что за период {preview.summary.period ?? period} ({preview.summary.dsp}) уже есть{" "}
                    <strong>{preview.existingTransactionsForPeriod} transactions</strong>, и этот импорт ДОБАВИТ ещё
                    (correction-import). Используйте только для дозагрузки новых треков, не для коррекции существующих сумм.
                  </Label>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border/30">
                <p className="text-xs text-muted-foreground">
                  Будет добавлено <strong className="text-foreground">{preview.matchedRows}</strong> usage_reports, <strong className="text-foreground">{preview.unmatchedRows}</strong> unmatched.
                </p>
                <Button
                  onClick={runCommit}
                  disabled={committing || !period || (preview.existingTransactionsForPeriod > 0 && !forceCorrection)}
                  data-testid="button-commit"
                >
                  {committing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Commit Import
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base">История импортов</CardTitle>
            <CardDescription className="text-xs">Последние 20 загрузок. Идемпотентность по SHA256+DSP+период.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>DSP</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Inserted</TableHead>
                  <TableHead className="text-right">Unmatched</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imporsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : imports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      Импортов пока нет. Загрузите первый CSV сверху.
                    </TableCell>
                  </TableRow>
                ) : imports.map(r => (
                  <TableRow key={r.id} data-testid={`row-import-${r.id}`}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{DSP_OPTIONS.find(o => o.value === r.dsp)?.label ?? r.dsp}</TableCell>
                    <TableCell className="text-xs font-mono">{r.period}</TableCell>
                    <TableCell className="text-xs font-mono truncate max-w-[200px]">{r.filename}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-emerald-400">{r.insertedRows.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-amber-400">{r.unmatchedRows.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{r.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {r.currency}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded border border-border/40 bg-background/30 p-3">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${accent ?? ""}`}>{value}</div>
    </div>
  );
}
