import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";
import { exportCatalogCsv, type ExportProgress } from "@/lib/export-catalog";
import { useListReleases, useGetReleaseCounts } from "@workspace/api-client-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, Download, Plus, Image as ImageIcon, MoreHorizontal,
  FileEdit, Send, Trash2, LayoutGrid, List, ChevronLeft, ChevronRight,
  ArrowUpRight, Upload,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "draft" | "pending_review" | "scheduled" | "live" | "takedown";

const TAB_TO_STATUS: Record<StatusFilter, string | undefined> = {
  all:            undefined,
  draft:          "draft",
  pending_review: "pending_review",
  scheduled:      "approved,delivering,delivered",
  live:           "live",
  takedown:       "takedown_requested,removed",
};

export default function Releases() {
  const { user } = useAuth();
  const { t } = useLang();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [, setLocation] = useLocation();

  const [exporting, setExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<ExportProgress["phase"]>("releases");
  const [exportLoaded, setExportLoaded] = useState(0);

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: "all",            label: t.releases.tabs.all },
    { value: "draft",          label: t.releases.tabs.draft },
    { value: "pending_review", label: t.releases.tabs.pending_review },
    { value: "scheduled",      label: t.releases.tabs.scheduled },
    { value: "live",           label: t.releases.tabs.live },
    { value: "takedown",       label: t.releases.tabs.takedown },
  ];

  const onExportCatalog = async () => {
    if (exporting) return;
    setExporting(true);
    setExportPhase("releases");
    setExportLoaded(0);
    try {
      const res = await exportCatalogCsv((p) => {
        setExportPhase(p.phase);
        setExportLoaded(p.loaded);
      });
      toast({
        title: t.releases.export_success,
        description: t.releases.export_success_desc
          .replace("{r}", String(res.releaseCount))
          .replace("{t}", String(res.trackCount))
          .replace("{ro}", String(res.rowCount)),
      });
    } catch (e: any) {
      toast({
        title: t.releases.export_error,
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const isArtist = user?.role === "artist";
  const isLabel  = user?.role === "label";

  const { data: releasesData, isLoading } = useListReleases({
    search: searchQuery || undefined,
    status: TAB_TO_STATUS[statusFilter] as never,
    page,
    limit: pageSize,
    ...(isArtist && user?.artistId ? { artist_id: user.artistId } : {}),
    ...(isLabel  && user?.labelId  ? { label_id:  user.labelId  } : {}),
  });
  const { data: counts } = useGetReleaseCounts();

  const total = releasesData?.pagination.total ?? 0;
  const totalPages = releasesData?.pagination.totalPages ?? 1;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const pageWindow = useMemo(() => {
    const size = 5;
    let from = Math.max(1, page - 2);
    let to = Math.min(totalPages, from + size - 1);
    from = Math.max(1, to - size + 1);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [page, totalPages]);

  const goto = (id: number) => setLocation(`/releases/${id}`);

  const pageTitle = isArtist
    ? t.releases.title_artist
    : isLabel
      ? t.releases.title_label
      : t.releases.title;

  const pageSubtitle = isArtist
    ? t.releases.subtitle_artist
    : isLabel
      ? t.releases.subtitle_label
      : t.releases.subtitle_admin;

  const exportLabel = exporting
    ? exportPhase === "releases"
      ? `${t.releases.exporting.releases} ${exportLoaded}`
      : exportPhase === "tracks"
        ? `${t.releases.exporting.tracks} ${exportLoaded}`
        : t.releases.exporting.preparing
    : t.releases.export_csv;

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{pageTitle}</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">{pageSubtitle}</p>
          </div>
          <div className="flex gap-2">
            {!isArtist && !isLabel && (
              <Button variant="outline" className="bg-card" onClick={() => setLocation("/releases/transfer")} data-testid="button-transfer-track">
                <ArrowUpRight className="mr-2 h-4 w-4" />
                {t.releases.transfer_track}
              </Button>
            )}
            <Button
              variant="outline"
              className="bg-card"
              onClick={onExportCatalog}
              disabled={exporting}
              data-testid="button-export-csv"
            >
              <Download className="mr-2 h-4 w-4" />
              {exportLabel}
            </Button>
            {!isArtist && !isLabel && (
              <Button variant="outline" className="bg-card" onClick={() => setLocation("/releases/bulk")} data-testid="button-upload-csv">
                <Upload className="mr-2 h-4 w-4" />
                {t.releases.upload_csv}
              </Button>
            )}
            <Button onClick={() => setLocation("/releases/new")} className="bg-primary" data-testid="button-create-release">
              <Plus className="mr-2 h-4 w-4" />
              {t.releases.create_release}
            </Button>
          </div>
        </div>

        {/* Top stat cards — admin/manager only */}
        {!isArtist && !isLabel && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label={t.releases.stats.ready_to_submit}
            value={counts?.readyToSubmit ?? 0}
            tone="indigo"
            cta={t.releases.stats.view}
            releaseWord={t.releases.stats.release_count}
            onClick={() => setStatusFilter("pending_review")}
          />
          <StatCard
            label={t.releases.stats.unfinished}
            value={counts?.unfinished ?? 0}
            tone="slate"
            cta={t.releases.stats.view}
            releaseWord={t.releases.stats.release_count}
            onClick={() => setStatusFilter("draft")}
          />
          <StatCard
            label={t.releases.stats.live_on_dsps}
            value={counts?.live ?? 0}
            tone="emerald"
            cta={t.releases.stats.view}
            releaseWord={t.releases.stats.release_count}
            onClick={() => setStatusFilter("live")}
          />
          <StatCard
            label={t.releases.stats.takedown_removed}
            value={counts?.takedown ?? 0}
            tone="rose"
            cta={t.releases.stats.view}
            releaseWord={t.releases.stats.release_count}
            onClick={() => setStatusFilter("takedown")}
          />
        </div>
        )}

        {/* Tabs + filters bar */}
        <Card className="bg-card/50 backdrop-blur border-border/50 overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/50 gap-3">
            <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setPage(1); }}>
              <TabsList className="bg-background/50 flex-wrap h-auto">
                {STATUS_TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
              <div className="relative sm:w-96">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={t.releases.search_placeholder}
                  className="pl-8 bg-background/50 border-border"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                />
              </div>
              <div className="flex items-center gap-2">
                <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "grid" | "list")} className="bg-background/40 border border-border/50 rounded-md p-0.5">
                  <ToggleGroupItem value="grid" className="h-8 w-8 p-0 data-[state=on]:bg-primary/20 data-[state=on]:text-primary">
                    <LayoutGrid className="h-4 w-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="list" className="h-8 w-8 p-0 data-[state=on]:bg-primary/20 data-[state=on]:text-primary">
                    <List className="h-4 w-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
                <Button variant="outline" size="sm" className="bg-background/40" onClick={onExportCatalog} disabled={exporting}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  {t.releases.export_full}
                </Button>
                <Button size="sm" onClick={() => setLocation("/releases/new")}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  {t.releases.create_release}
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {view === "grid" ? (
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {isLoading
                  ? Array.from({ length: 12 }).map((_, i) => <ReleaseCardSkeleton key={i} />)
                  : releasesData?.data.length === 0
                    ? <EmptyState span={6} message={t.releases.empty} />
                    : releasesData?.data.map((r) => (
                        <button key={r.id} onClick={() => goto(r.id)}
                          className="group text-left rounded-lg overflow-hidden border border-border/40 bg-background/40 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all">
                          <div className="aspect-square bg-muted flex items-center justify-center relative overflow-hidden">
                            {r.coverUrl
                              ? <img src={r.coverUrl} alt={r.title} className="h-full w-full object-cover" />
                              : <CoverPlaceholder title={r.title} />}
                            <div className="absolute top-2 right-2">
                              <StatusBadge status={r.status} className="text-[9px] px-1.5 py-0 h-5" />
                            </div>
                          </div>
                          <div className="p-2.5 space-y-0.5">
                            <div className="font-semibold text-sm leading-tight truncate">{r.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{r.artistName}</div>
                            <div className="text-[10px] text-muted-foreground/60 font-mono mt-1">UPC: {r.upc || "—"}</div>
                            <div className="text-[10px] text-muted-foreground/60">{t.releases.table.label}: {r.labelName || t.releases.independent}</div>
                          </div>
                        </button>
                      ))}
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-background/40 sticky top-0 z-10">
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="w-[60px]"></TableHead>
                    <TableHead>{t.releases.table.title}</TableHead>
                    <TableHead>{t.releases.table.artist}</TableHead>
                    <TableHead>{t.releases.table.type}</TableHead>
                    <TableHead>{t.releases.table.label}</TableHead>
                    <TableHead>{t.releases.table.release_date}</TableHead>
                    <TableHead>{t.releases.table.status}</TableHead>
                    <TableHead className="text-right">{t.releases.table.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-10 w-10 rounded" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      ))
                    : releasesData?.data.length === 0
                      ? <EmptyState span={8} message={t.releases.empty} />
                      : releasesData?.data.map((r) => (
                          <TableRow key={r.id} className="border-border/50 hover:bg-accent/30 cursor-pointer" onClick={() => goto(r.id)}>
                            <TableCell>
                              <div className="h-10 w-10 rounded overflow-hidden bg-muted flex items-center justify-center border border-border/50">
                                {r.coverUrl
                                  ? <img src={r.coverUrl} alt={r.title} className="h-full w-full object-cover" />
                                  : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-semibold">{r.title}</div>
                              <div className="text-[10px] text-muted-foreground/60 font-mono">UPC: {r.upc || "—"}</div>
                            </TableCell>
                            <TableCell className="text-sm">{r.artistName}</TableCell>
                            <TableCell className="text-sm capitalize">{r.releaseType}</TableCell>
                            <TableCell className="text-sm">{r.labelName || t.releases.independent}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {r.releaseDate
                                ? new Date(r.releaseDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
                                : t.releases.tbd}
                            </TableCell>
                            <TableCell><StatusBadge status={r.status} /></TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>{t.releases.actions_menu.label}</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); goto(r.id); }}>
                                    <FileEdit className="mr-2 h-4 w-4" /> {t.releases.actions_menu.view_edit}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                                    <Send className="mr-2 h-4 w-4" /> {t.releases.actions_menu.deliver}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive" onClick={(e) => e.stopPropagation()}>
                                    <Trash2 className="mr-2 h-4 w-4" /> {t.releases.actions_menu.delete}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                </TableBody>
              </Table>
            )}
          </CardContent>

          {/* Pagination */}
          <div className="flex items-center justify-between p-4 border-t border-border/50 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{t.releases.show}</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-8 w-20 bg-background/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <span>{t.releases.per_page}</span>
            </div>
            <div className="text-muted-foreground hidden sm:block">
              {start}–{end} / {total}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8 bg-background/40" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageWindow.map((p) => (
                <Button key={p} variant={p === page ? "default" : "outline"} size="icon"
                  className={cn("h-8 w-8", p !== page && "bg-background/40")}
                  onClick={() => setPage(p)}>
                  {p}
                </Button>
              ))}
              <Button variant="outline" size="icon" className="h-8 w-8 bg-background/40" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function StatCard({
  label, value, tone, cta, releaseWord, onClick,
}: {
  label: string; value: number;
  tone: "indigo" | "slate" | "emerald" | "rose";
  cta: string; releaseWord: string; onClick: () => void;
}) {
  const ringClass = {
    indigo: "from-indigo-500/15 to-indigo-500/0 border-indigo-500/30",
    slate:  "from-slate-500/15 to-slate-500/0 border-slate-500/30",
    emerald:"from-emerald-500/15 to-emerald-500/0 border-emerald-500/30",
    rose:   "from-rose-500/15 to-rose-500/0 border-rose-500/30",
  }[tone];
  const btnClass = {
    indigo: "bg-indigo-500 hover:bg-indigo-600",
    slate:  "bg-slate-600 hover:bg-slate-700",
    emerald:"bg-emerald-500 hover:bg-emerald-600",
    rose:   "bg-rose-500 hover:bg-rose-600",
  }[tone];
  return (
    <Card className={cn("bg-gradient-to-br border", ringClass)}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold tracking-tight">{value} <span className="text-xs text-muted-foreground font-medium">{releaseWord}</span></div>
          <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        </div>
        <Button size="sm" className={cn("h-7 px-3 text-xs text-white", btnClass)} onClick={onClick}>
          {cta}
        </Button>
      </CardContent>
    </Card>
  );
}

function CoverPlaceholder({ title }: { title: string }) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return (
    <div
      className="h-full w-full flex items-center justify-center text-center px-2"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 22%), hsl(${(hue + 40) % 360} 60% 12%))` }}
    >
      <div className="font-bold text-sm uppercase tracking-wider text-white/90 line-clamp-3">{title}</div>
    </div>
  );
}

function ReleaseCardSkeleton() {
  return (
    <div className="rounded-lg overflow-hidden border border-border/40 bg-background/40">
      <Skeleton className="aspect-square w-full" />
      <div className="p-2.5 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

function EmptyState({ span, message }: { span: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={span} className="text-center h-32 text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}
