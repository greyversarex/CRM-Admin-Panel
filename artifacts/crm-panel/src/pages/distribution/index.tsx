import { Layout } from "@/components/layout";
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  useListDeliveries, useListReleases, useUpdateReleaseStatus, useRetryDelivery, useListIntegrations,
  getListDeliveriesQueryKey, getListReleasesQueryKey, getGetReleaseCountsQueryKey,
  type Delivery, type Release, type Integration,
  type ListDeliveriesParams,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, AlertCircle, CheckCircle2, XCircle, Clock,
  Send, Shield, FileCode2, Ban, CalendarClock,
  Download, ExternalLink,
} from "lucide-react";
import { ModerationDialog, type ModerationRelease } from "@/components/moderation-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useLang } from "@/lib/i18n";

// ─── DSP справочник (label) ───────────────────────────────────────────────
const DSP_DIRECTORY: Record<string, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube_music: "YouTube Music",
  yandex_music: "Yandex Music",
  vk_music: "VK Music",
  tiktok: "TikTok",
  deezer: "Deezer",
  amazon_music: "Amazon Music",
  vevo: "VEVO",
  zvuk: "Zvuk",
  tidal: "Tidal",
  boomplay: "Boomplay",
  ok_music: "OK Music",
};
const DSP_CODES = Object.keys(DSP_DIRECTORY);

function dspLabel(code: string) {
  return DSP_DIRECTORY[code] ?? code;
}

function toModerationRelease(r: Release): ModerationRelease {
  return {
    id: r.id,
    title: r.title,
    artist: r.artistName,
    type: r.releaseType,
    submitted: r.createdAt.slice(0, 10),
    upc: r.upc ?? "",
    coverUrl: r.coverUrl ?? undefined,
    issues: [],
    tracks: [],
    allowedTransitions: r.allowedTransitions,
  };
}

function isToday(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getUTCFullYear() === n.getUTCFullYear()
    && d.getUTCMonth()    === n.getUTCMonth()
    && d.getUTCDate()     === n.getUTCDate();
}

export default function Distribution() {
  const { toast } = useToast();
  const { t } = useLang();
  const qc = useQueryClient();

  const [fStatus, setFStatus] = useState<string>("all");
  const [fTarget, setFTarget] = useState<string>("all");
  const [fFrom, setFFrom] = useState<string>("");
  const [fTo, setFTo]     = useState<string>("");

  const deliveryParams: ListDeliveriesParams = useMemo(() => {
    const p: ListDeliveriesParams = { limit: 50 };
    if (fStatus !== "all") p.status = fStatus as ListDeliveriesParams["status"];
    if (fTarget !== "all") p.target = fTarget as ListDeliveriesParams["target"];
    if (fFrom) p.date_from = fFrom;
    if (fTo)   p.date_to   = fTo;
    return p;
  }, [fStatus, fTarget, fFrom, fTo]);

  const pendingQ = useListReleases({ status: "pending_review", limit: 100 });
  const approvedQ = useListReleases({ status: "approved", limit: 100 });
  const takedownQ = useListReleases({ status: "takedown_requested", limit: 50 });
  const deliveriesQ = useListDeliveries(deliveryParams);
  const allDeliveriesQ = useListDeliveries({ limit: 200 });
  const integrationsQ = useListIntegrations({ category: "dsp" });

  const updateStatus = useUpdateReleaseStatus();
  const retryDelivery = useRetryDelivery();

  const pending: ModerationRelease[] = useMemo(
    () => (pendingQ.data?.data ?? []).map(toModerationRelease),
    [pendingQ.data]
  );
  const deliveries: Delivery[] = deliveriesQ.data?.data ?? [];
  const allDeliveries: Delivery[] = allDeliveriesQ.data?.data ?? [];
  const integrations: Integration[] = integrationsQ.data?.data ?? [];

  const kpi = useMemo(() => {
    const deliveredToday = allDeliveries.filter(
      (d) => (d.status === "sent" || d.status === "delivered") && isToday(d.deliveredAt ?? d.updatedAt)
    ).length;
    const failed = allDeliveries.filter((d) => d.status === "failed").length;
    const connectedDsps = integrations.filter((i) => i.status === "connected").length;
    return {
      pending: pendingQ.data?.pagination.total ?? pending.length,
      deliveredToday,
      failed,
      connected: connectedDsps,
    };
  }, [allDeliveries, integrations, pendingQ.data, pending.length]);

  const dspStats = useMemo(() => {
    const intByCode = new Map(integrations.map((i) => [i.code, i]));
    return DSP_CODES.map((code) => {
      const integ = intByCode.get(code);
      const rows = allDeliveries.filter((d) => d.target === code);
      const activeCount = rows.filter((d) => d.status === "queued" || d.status === "processing").length;
      const sentCount = rows.filter((d) => d.status === "sent" || d.status === "delivered").length;
      return {
        code,
        name: integ?.name ?? dspLabel(code),
        status: (integ?.status ?? "disconnected") as "connected" | "disconnected" | "pending" | "error",
        active: activeCount,
        sent: sentCount,
        lastError: integ?.lastError ?? null,
      };
    });
  }, [allDeliveries, integrations]);

  const [modRelease, setModRelease] = useState<ModerationRelease | null>(null);
  const [modOpen, setModOpen] = useState(false);

  const openRelease = (r: ModerationRelease) => { setModRelease(r); setModOpen(true); };

  const invalidateReleases = () => {
    qc.invalidateQueries({ queryKey: getListReleasesQueryKey({ status: "pending_review", limit: 100 }) });
    qc.invalidateQueries({ queryKey: getListReleasesQueryKey({ status: "approved",       limit: 100 }) });
    qc.invalidateQueries({ queryKey: getGetReleaseCountsQueryKey() });
  };

  const handleApprove = async (id: number) => {
    try {
      await updateStatus.mutateAsync({ id, data: { status: "approved", note: "Approved by moderator" } });
      invalidateReleases();
      toast({ title: "Release approved", description: "Ready for delivery. Open release → Deliver to DSPs." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to approve", description: msg, variant: "destructive" });
    }
  };

  const handleReject = async (id: number, reasons: string[], comment: string) => {
    const note = [reasons.join("; "), comment].filter(Boolean).join(" — ");
    if (!note.trim()) {
      toast({ title: "Rejection reason required", description: "Select a reason or write a comment.", variant: "destructive" });
      return;
    }
    try {
      await updateStatus.mutateAsync({ id, data: { status: "rejected", note } });
      invalidateReleases();
      toast({ variant: "destructive", title: "Release rejected", description: note });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to reject", description: msg, variant: "destructive" });
    }
  };

  const handleRetry = async (delivery: Delivery) => {
    try {
      await retryDelivery.mutateAsync({ id: delivery.id });
      qc.invalidateQueries({ queryKey: getListDeliveriesQueryKey() });
      toast({ title: "Retried", description: `${delivery.releaseName} → ${dspLabel(delivery.target)}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to retry", description: msg, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <h1 className="text-2xl font-bold tracking-tight">{t.distribution.title}</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">{t.distribution.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="bg-card" onClick={() => deliveriesQ.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t.distribution.refresh}
            </Button>
            <Button variant="outline" className="bg-card">
              <Download className="mr-2 h-4 w-4" />
              {t.distribution.export_logs}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <KpiCard
            label={t.distribution.kpi.pending}
            value={pendingQ.isLoading ? "…" : String(kpi.pending)}
            icon={Clock}
            iconColor="text-amber-400"
            iconBg="bg-amber-500/12"
            iconBorder="border-amber-500/20"
          />
          <KpiCard
            label={t.distribution.kpi.delivered_today}
            value={deliveriesQ.isLoading ? "…" : String(kpi.deliveredToday)}
            icon={CheckCircle2}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-500/12"
            iconBorder="border-emerald-500/20"
          />
          <KpiCard
            label={t.distribution.kpi.failed}
            value={deliveriesQ.isLoading ? "…" : String(kpi.failed)}
            icon={XCircle}
            iconColor="text-rose-400"
            iconBg="bg-rose-500/12"
            iconBorder="border-rose-500/20"
          />
          <KpiCard
            label={t.distribution.kpi.connected}
            value={deliveriesQ.isLoading ? "…" : `${kpi.connected}/${DSP_CODES.length}`}
            icon={Shield}
            iconColor="text-primary"
            iconBg="bg-primary/12"
            iconBorder="border-primary/20"
          />
        </div>

        <Tabs defaultValue="moderation">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1">
            <TabsTrigger value="moderation" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {t.distribution.tabs.moderation}
              <Badge className="ml-1 h-4 px-1.5 flex items-center justify-center bg-amber-500 text-white text-[10px]">{kpi.pending}</Badge>
            </TabsTrigger>
            <TabsTrigger value="ddex" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <FileCode2 className="h-3.5 w-3.5" />
              {t.distribution.tabs.ddex}
              <Badge className="ml-1 h-4 px-1.5 flex items-center justify-center bg-muted text-foreground text-[10px]">{deliveries.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="dsp" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Send className="h-3.5 w-3.5" />
              {t.distribution.tabs.dsp}
            </TabsTrigger>
            <TabsTrigger value="takedowns" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Ban className="h-3.5 w-3.5" />
              {t.distribution.tabs.takedowns}
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              {t.distribution.tabs.scheduled}
            </TabsTrigger>
          </TabsList>

          {/* ─── Moderation queue ──────────────────────────────────────── */}
          <TabsContent value="moderation" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>{t.distribution.moderation.card_title}</CardTitle>
                <CardDescription>{t.distribution.moderation.card_desc}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t.distribution.moderation.col_release}</TableHead>
                      <TableHead>{t.distribution.moderation.col_type}</TableHead>
                      <TableHead>{t.distribution.moderation.col_upc}</TableHead>
                      <TableHead>{t.distribution.moderation.col_submitted}</TableHead>
                      <TableHead className="text-right">{t.distribution.moderation.col_actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingQ.isLoading && (
                      <TableRow><TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                    )}
                    {!pendingQ.isLoading && pending.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center h-24 text-muted-foreground text-sm">
                          {t.distribution.moderation.empty}
                        </TableCell>
                      </TableRow>
                    )}
                    {pending.map((r) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-accent/30"
                        onClick={() => openRelease(r)}
                      >
                        <TableCell>
                          <div className="font-medium text-sm">{r.title}</div>
                          <div className="text-xs text-muted-foreground">{r.artist}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.type}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{r.upc || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.submitted}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <Link href={`/releases/${r.id}`}>
                              <Button size="sm" variant="ghost" className="h-7 text-xs">
                                <ExternalLink className="mr-1 h-3.5 w-3.5" /> {t.distribution.moderation.open}
                              </Button>
                            </Link>
                            <Button size="sm" className="h-7 text-xs" onClick={() => openRelease(r)}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> {t.distribution.moderation.review}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── DDEX Logs ──────────────────────────────────────────────── */}
          <TabsContent value="ddex" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50 flex flex-col overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle>{t.distribution.ddex_logs.card_title}</CardTitle>
                    <CardDescription>{t.distribution.ddex_logs.card_desc}</CardDescription>
                  </div>
                  <div className="flex gap-2 items-end flex-wrap">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-muted-foreground tracking-wide">{t.distribution.ddex_logs.filter_status}</label>
                      <Select value={fStatus} onValueChange={setFStatus}>
                        <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t.distribution.ddex_logs.all_statuses}</SelectItem>
                          <SelectItem value="queued">queued</SelectItem>
                          <SelectItem value="processing">processing</SelectItem>
                          <SelectItem value="sent">sent</SelectItem>
                          <SelectItem value="delivered">delivered</SelectItem>
                          <SelectItem value="failed">failed</SelectItem>
                          <SelectItem value="cancelled">cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-muted-foreground tracking-wide">{t.distribution.ddex_logs.filter_dsp}</label>
                      <Select value={fTarget} onValueChange={setFTarget}>
                        <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t.distribution.ddex_logs.all_dsps}</SelectItem>
                          {DSP_CODES.map((c) => (
                            <SelectItem key={c} value={c}>{dspLabel(c)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-muted-foreground tracking-wide">{t.distribution.ddex_logs.filter_from}</label>
                      <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-muted-foreground tracking-wide">{t.distribution.ddex_logs.filter_to}</label>
                      <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="h-8 w-[140px] text-xs" />
                    </div>
                    {(fStatus !== "all" || fTarget !== "all" || fFrom || fTo) && (
                      <Button size="sm" variant="ghost" className="h-8 text-xs"
                        onClick={() => { setFStatus("all"); setFTarget("all"); setFFrom(""); setFTo(""); }}>
                        {t.distribution.ddex_logs.clear}
                      </Button>
                    )}
                    <Badge variant="outline" className="text-xs font-mono text-muted-foreground">ERN 4.3</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t.distribution.ddex_logs.col_id}</TableHead>
                      <TableHead>{t.distribution.ddex_logs.col_release}</TableHead>
                      <TableHead>{t.distribution.ddex_logs.col_ddex}</TableHead>
                      <TableHead>{t.distribution.ddex_logs.col_target}</TableHead>
                      <TableHead>{t.distribution.ddex_logs.col_attempts}</TableHead>
                      <TableHead>{t.distribution.ddex_logs.col_updated}</TableHead>
                      <TableHead>{t.distribution.ddex_logs.col_status}</TableHead>
                      <TableHead className="text-right">{t.distribution.ddex_logs.col_actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveriesQ.isLoading && (
                      <TableRow><TableCell colSpan={8}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                    )}
                    {!deliveriesQ.isLoading && deliveries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center h-24 text-muted-foreground text-sm">
                          {t.distribution.ddex_logs.empty}
                        </TableCell>
                      </TableRow>
                    )}
                    {deliveries.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">D{String(d.id).padStart(4, "0")}</TableCell>
                        <TableCell>
                          <Link href={`/releases/${d.releaseId}`}>
                            <span className="font-medium text-sm hover:underline cursor-pointer">{d.releaseName}</span>
                          </Link>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="font-mono text-xs">ERN {d.ddexVersion ?? "4.3"}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{dspLabel(d.target)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{d.attempts}/5</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{d.updatedAt.slice(0, 16).replace("T", " ")}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <StatusBadge status={d.status} />
                            {d.lastError && (
                              <span className="text-[10px] text-rose-400 max-w-[200px] truncate" title={d.lastError}>
                                {d.lastError}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {d.status === "failed" && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              disabled={retryDelivery.isPending}
                              onClick={() => handleRetry(d)}
                              title={t.distribution.ddex_logs.retry}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── DSP Status ─────────────────────────────────────────────── */}
          <TabsContent value="dsp" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2">
              {dspStats.map((dsp) => (
                <Card key={dsp.code} className="bg-card/50 backdrop-blur border-border/50 hover:border-border transition-colors">
                  <CardContent className="flex items-center gap-4 pt-4 pb-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{dsp.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {dsp.sent} {t.distribution.dsp.delivered} · {dsp.active} {t.distribution.dsp.active} · <span className="font-mono">{dsp.code}</span>
                      </p>
                      {dsp.lastError && (
                        <p className="text-[11px] text-rose-400 mt-1 truncate" title={dsp.lastError}>{dsp.lastError}</p>
                      )}
                    </div>
                    <StatusBadge status={dsp.status} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ─── Takedowns ──────────────────────────────────────────────── */}
          <TabsContent value="takedowns" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>{t.distribution.takedowns.card_title}</CardTitle>
                <CardDescription>{t.distribution.takedowns.card_desc}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t.distribution.takedowns.col_release}</TableHead>
                      <TableHead>{t.distribution.takedowns.col_artist}</TableHead>
                      <TableHead>{t.distribution.takedowns.col_upc}</TableHead>
                      <TableHead>{t.distribution.takedowns.col_date}</TableHead>
                      <TableHead className="text-right">{t.distribution.takedowns.col_actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {takedownQ.isLoading && (
                      <TableRow><TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                    )}
                    {!takedownQ.isLoading && (takedownQ.data?.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center h-24 text-muted-foreground text-sm">
                          {t.distribution.takedowns.empty}
                        </TableCell>
                      </TableRow>
                    )}
                    {(takedownQ.data?.data ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-sm">{r.title}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.artistName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{r.upc ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.updatedAt.slice(0, 10)}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/releases/${r.id}`}>
                            <Button size="sm" variant="outline" className="h-7 text-xs">{t.distribution.takedowns.open}</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Scheduled ──────────────────────────────────────────────── */}
          <TabsContent value="scheduled" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>{t.distribution.scheduled.card_title}</CardTitle>
                <CardDescription>{t.distribution.scheduled.card_desc}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t.distribution.scheduled.col_release}</TableHead>
                      <TableHead>{t.distribution.scheduled.col_artist}</TableHead>
                      <TableHead>{t.distribution.scheduled.col_release_date}</TableHead>
                      <TableHead>{t.distribution.scheduled.col_status}</TableHead>
                      <TableHead className="text-right">{t.distribution.scheduled.col_actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedQ.isLoading && (
                      <TableRow><TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                    )}
                    {!approvedQ.isLoading && (approvedQ.data?.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center h-24 text-muted-foreground text-sm">
                          {t.distribution.scheduled.empty}
                        </TableCell>
                      </TableRow>
                    )}
                    {(approvedQ.data?.data ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-sm">{r.title}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.artistName}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{r.releaseDate ?? "—"}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-right">
                          {r.canDeliver && (
                            <Link href={`/releases/${r.id}`}>
                              <Button size="sm" className="h-7 text-xs">
                                <Send className="mr-1 h-3.5 w-3.5" /> {t.distribution.scheduled.deliver}
                              </Button>
                            </Link>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <ModerationDialog
          release={modRelease}
          open={modOpen}
          onOpenChange={setModOpen}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      </div>
    </Layout>
  );
}
