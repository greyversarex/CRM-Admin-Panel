import { useState, useRef, useCallback, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowLeft, X, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useLang } from "@/lib/i18n";

const SOURCE_OPTIONS = [
  { value: "auto", label: "Auto Detect" },
  { value: "symphonic", label: "Symphonic" },
  { value: "fuga", label: "FUGA" },
  { value: "tunecore", label: "TuneCore" },
  { value: "distrokid", label: "DistroKid" },
  { value: "onerpm", label: "OneRPM" },
  { value: "cdbaby", label: "CD Baby" },
  { value: "other", label: "Other" },
];

interface InternalField { key: string; label: string; scope: "release" | "track" }
interface ColumnMap { header: string; internalField: string | null; known: boolean }
interface Flag { code: string; severity: "error" | "warning"; message: string }
interface ReleasePreview {
  upc: string | null;
  title: string;
  primaryArtist: string | null;
  trackCount: number;
  flags: Flag[];
  willImport: boolean;
}
interface PreviewResult {
  fileName: string;
  totalRows: number;
  totalReleases: number;
  importable: number;
  skipped: number;
  needsLabel: boolean;
  columns: ColumnMap[];
  unknownColumns: string[];
  internalFields: InternalField[];
  releases: ReleasePreview[];
}
interface LabelRow { id: number; name: string }

const IGNORE = "__ignore__";

export default function CatalogImport() {
  const { t } = useLang();
  const ci = (t as any).catalog_import ?? {};
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("auto");
  const [labelId, setLabelId] = useState<string>("");
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saveAliases, setSaveAliases] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLabels = useCallback(async () => {
    try {
      const res = await fetch("/api/labels?limit=500", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      const rows: LabelRow[] = Array.isArray(data) ? data : (data.data ?? []);
      setLabels(rows.map((r: any) => ({ id: r.id, name: r.name })));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { void loadLabels(); }, [loadLabels]);

  const reset = () => {
    setFile(null); setPreview(null); setMapping({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const onFileSelected = (f: File | null) => { setFile(f); setPreview(null); setMapping({}); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFileSelected(f);
  };

  const buildForm = (extra?: Record<string, string>) => {
    const fd = new FormData();
    fd.append("file", file!);
    fd.append("source", source);
    if (labelId) fd.append("labelId", labelId);
    fd.append("mapping", JSON.stringify(mapping));
    for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
    return fd;
  };

  const runPreview = async (overrideMapping?: Record<string, string>) => {
    if (!file) return;
    setPreviewing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", source);
      if (labelId) fd.append("labelId", labelId);
      fd.append("mapping", JSON.stringify(overrideMapping ?? mapping));
      const res = await fetch("/api/catalog/metadata-import/preview", { method: "POST", credentials: "same-origin", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setPreview(data);
      // Инициализируем карту сопоставления из ответа (только если ещё пусто).
      if (!overrideMapping) {
        const init: Record<string, string> = {};
        for (const c of data.columns as ColumnMap[]) init[c.header] = c.internalField ?? "";
        setMapping(init);
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: ci.preview_failed ?? "Preview failed", description: e?.message ?? String(e) });
    } finally {
      setPreviewing(false);
    }
  };

  const changeMapping = (header: string, value: string) => {
    const v = value === IGNORE ? "ignore" : value;
    const next = { ...mapping, [header]: v };
    setMapping(next);
    void runPreview(next);
  };

  const runCommit = async () => {
    if (!file || !labelId) return;
    setCommitting(true);
    try {
      const res = await fetch("/api/catalog/metadata-import/commit", {
        method: "POST", credentials: "same-origin",
        body: buildForm({ saveAliases: saveAliases ? "true" : "false" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast({
        title: ci.commit_done ?? "Import complete",
        description: `${ci.imported ?? "Imported"}: ${data.imported}, ${ci.skipped ?? "skipped"}: ${data.skipped}, ${ci.tracks ?? "tracks"}: ${data.createdTracks}${data.savedAliases ? `, +${data.savedAliases} ${ci.aliases_saved ?? "aliases saved"}` : ""}`,
      });
      reset();
    } catch (e: any) {
      toast({ variant: "destructive", title: ci.commit_failed ?? "Import failed", description: e?.message ?? String(e) });
    } finally {
      setCommitting(false);
    }
  };

  const fieldOptions = preview?.internalFields ?? [];

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Link href="/catalog"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{ci.title ?? "Bulk Catalog Import"}</h1>
            <p className="text-muted-foreground mt-1">{ci.subtitle ?? "Upload any distributor Excel/CSV. Columns are auto-detected and learned."}</p>
          </div>
        </div>

        {/* Шаг 1 */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-primary" />{ci.step1 ?? "Step 1: Upload file"}</CardTitle>
            <CardDescription className="text-xs">{ci.step1_desc ?? "Excel (.xlsx/.xls) or CSV from any distributor. Max 20 MB."}</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{ci.source ?? "Import source"}</Label>
                <Select value={source} onValueChange={(v) => { setSource(v); setPreview(null); }}>
                  <SelectTrigger data-testid="select-source"><SelectValue /></SelectTrigger>
                  <SelectContent>{SOURCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{ci.label_account ?? "Label account"}</Label>
                <Select value={labelId} onValueChange={(v) => { setLabelId(v); if (file) void runPreview(); }}>
                  <SelectTrigger data-testid="select-label"><SelectValue placeholder={ci.select_label ?? "Select a label…"} /></SelectTrigger>
                  <SelectContent>{labels.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 py-10 rounded-md border-2 border-dashed cursor-pointer transition-colors ${dragOver ? "border-primary/60 bg-primary/5" : "border-border bg-card/30 hover:border-primary/40"}`}
              data-testid="dropzone-file"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              {file ? (
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); reset(); }}><X className="h-3 w-3" /></Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{ci.drop_hint ?? "Drop Excel/CSV here or click to choose"}</p>
              )}
              <input ref={fileInputRef} type="file" accept=".csv,.tsv,.xlsx,.xls" className="hidden" onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)} />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset} disabled={!file || previewing || committing}>{ci.reset ?? "Reset"}</Button>
              <Button onClick={() => runPreview()} disabled={!file || previewing || committing} data-testid="button-preview">
                {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{ci.analyze ?? "Analyze"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {preview && (
          <>
            {/* Шаг 2: сопоставление колонок */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-base">{ci.step2 ?? "Step 2: Column mapping"}</CardTitle>
                <CardDescription className="text-xs">{ci.step2_desc ?? "Unknown columns are highlighted. Map them manually — confirmed mappings are learned for next time."}</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {preview.unknownColumns.length > 0 && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                    ⚠ {(ci.unknown_cols ?? "Unrecognized columns")}: {preview.unknownColumns.join(", ")}
                  </div>
                )}
                <div className="rounded border border-border/50 overflow-hidden">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{ci.col_file ?? "Column in file"}</TableHead>
                      <TableHead>{ci.col_field ?? "Maps to field"}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {preview.columns.map((c) => (
                        <TableRow key={c.header} data-testid={`row-map-${c.header}`}>
                          <TableCell className="font-mono text-xs">
                            {c.header}
                            {!c.known && <Badge variant="outline" className="ml-2 text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20">{ci.unknown ?? "unknown"}</Badge>}
                          </TableCell>
                          <TableCell>
                            <Select value={mapping[c.header] ? (mapping[c.header] === "ignore" ? IGNORE : mapping[c.header]) : ""} onValueChange={(v) => changeMapping(c.header, v)}>
                              <SelectTrigger className="h-8 w-[240px]"><SelectValue placeholder={ci.not_mapped ?? "— not mapped —"} /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={IGNORE}>{ci.do_not_import ?? "— do not import —"}</SelectItem>
                                {fieldOptions.map((f) => <SelectItem key={f.key} value={f.key}>{f.label} <span className="opacity-50">({f.scope})</span></SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="save-aliases" checked={saveAliases} onCheckedChange={(v) => setSaveAliases(v === true)} />
                  <Label htmlFor="save-aliases" className="text-xs cursor-pointer">{ci.save_aliases ?? "Remember these mappings for future imports"}</Label>
                </div>
              </CardContent>
            </Card>

            {/* Шаг 3: предпросмотр релизов */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-base">{ci.step3 ?? "Step 3: Review & import"}</CardTitle>
                <CardDescription className="text-xs">{ci.step3_desc ?? "Duplicates and conflicts are blocked automatically."}</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {preview.needsLabel && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                    ⚠ {ci.pick_label ?? "Select a label account above to run safety checks and enable import."}
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-4">
                  <Stat label={ci.rows ?? "Rows"} value={preview.totalRows.toLocaleString()} />
                  <Stat label={ci.releases ?? "Releases"} value={preview.totalReleases.toLocaleString()} />
                  <Stat label={ci.will_import ?? "Will import"} value={preview.importable.toLocaleString()} accent="text-emerald-400" />
                  <Stat label={ci.will_skip ?? "Skipped"} value={preview.skipped.toLocaleString()} accent="text-amber-400" />
                </div>

                <div className="rounded border border-border/50 overflow-hidden">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{ci.rel_upc ?? "UPC"}</TableHead>
                      <TableHead>{ci.rel_title ?? "Title"}</TableHead>
                      <TableHead>{ci.rel_artist ?? "Artist"}</TableHead>
                      <TableHead className="text-right">{ci.rel_tracks ?? "Tracks"}</TableHead>
                      <TableHead>{ci.rel_status ?? "Status"}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {preview.releases.slice(0, 200).map((r, i) => (
                        <TableRow key={i} className={!r.willImport ? "opacity-60" : ""} data-testid={`row-rel-${i}`}>
                          <TableCell className="font-mono text-xs">{r.upc ?? "—"}</TableCell>
                          <TableCell className="text-sm">{r.title}</TableCell>
                          <TableCell className="text-sm">{r.primaryArtist ?? "—"}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{r.trackCount}</TableCell>
                          <TableCell>
                            {r.willImport
                              ? <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />{ci.ok ?? "OK"}</Badge>
                              : <div className="flex flex-col gap-0.5">{r.flags.filter((f) => f.severity === "error").map((f, j) => (
                                  <Badge key={j} variant="outline" className="text-[10px] text-red-400 bg-red-500/10 border-red-500/20 whitespace-normal text-left"><AlertTriangle className="h-2.5 w-2.5 mr-1 shrink-0" />{f.message}</Badge>
                                ))}</div>}
                            {r.flags.filter((f) => f.severity === "warning").map((f, j) => (
                              <div key={j} className="text-[10px] text-amber-400 mt-0.5">⚠ {f.message}</div>
                            ))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                  <p className="text-xs text-muted-foreground">{(ci.import_note ?? "Will create {n} draft releases").replace("{n}", String(preview.importable))}</p>
                  <Button onClick={runCommit} disabled={committing || !labelId || preview.importable === 0} data-testid="button-commit">
                    {committing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{ci.import_btn ?? "Import to catalog"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
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
