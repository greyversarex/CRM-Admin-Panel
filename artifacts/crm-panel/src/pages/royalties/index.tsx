import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import {
  useGetRoyaltySummary,
  useListRoyaltyStatements,
  useListRoyaltyByRelease,
  useListRoyaltyByDsp,
  useListPayouts,
  useCreatePayoutRequest,
  getListPayoutsQueryKey,
  getGetRoyaltySummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, FileText, Download, Disc3, Radio,
  Send, History, AlertCircle, ArrowUpRight, ArrowDownRight, DollarSign, Calendar, Info,
  ShieldAlert, Banknote,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "@/hooks/use-toast";

const PIE_COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6", "#ef4444", "#14b8a6", "#a855f7"];

const PAYOUT_STATUS_CLS: Record<string, string> = {
  pending:  "bg-amber-500/10 text-amber-400 border-amber-500/20",
  approved: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  paid:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  rejected: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

function fmtMoney(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function pct(curr: number, prev: number) {
  if (!prev) return 0;
  return ((curr - prev) / prev) * 100;
}

export default function Royalties() {
  return (
    <Layout>
      <RoyaltiesPanel />
    </Layout>
  );
}

export function RoyaltiesPanel() {
  const { user } = useAuth();
  const { t } = useLang();
  const nav = t.nav as Record<string, string>;
  const queryClient = useQueryClient();

  // Build entity filter from current user role
  const entityParams = useMemo(() => {
    if (user?.role === "artist" && user.artistId) return { entity_type: "artist" as const, entity_id: user.artistId };
    if (user?.role === "label" && user.labelId)  return { entity_type: "label"  as const, entity_id: user.labelId  };
    return {};
  }, [user]);

  const summaryQ   = useGetRoyaltySummary(entityParams);
  const statementsQ= useListRoyaltyStatements(entityParams);
  const byReleaseQ = useListRoyaltyByRelease(entityParams);
  const byDspQ     = useListRoyaltyByDsp(entityParams);

  const payoutParams = useMemo(() => {
    const p: Record<string, any> = { page: 1, limit: 50 };
    if (entityParams.entity_type === "artist") p.artist_id = entityParams.entity_id;
    if (entityParams.entity_type === "label")  p.label_id  = entityParams.entity_id;
    return p;
  }, [entityParams]);
  const payoutsQ = useListPayouts(payoutParams, { query: { queryKey: getListPayoutsQueryKey(payoutParams) } });

  const createPayout = useCreatePayoutRequest();

  // Payment request form
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"bank_transfer" | "paypal" | "payoneer" | "crypto" | "wallet">("bank_transfer");
  const [payDetails, setPayDetails] = useState("");

  const summary = summaryQ.data;

  const canRequestPayout = !!entityParams.entity_type;

  const payoutStatusLabel = (s: string) => ({
    pending:  t.royalties.history.status_pending,
    approved: t.royalties.history.status_approved,
    paid:     t.royalties.history.status_paid,
    rejected: t.royalties.history.status_rejected,
  }[s] ?? s);

  const methodLabel = (m: string) => ({
    bank_transfer: t.royalties.history.method_bank,
    paypal:        t.royalties.history.method_paypal,
    payoneer:      t.royalties.history.method_payoneer,
    crypto:        t.royalties.history.method_crypto,
    wallet:        t.royalties.history.method_wallet,
  }[m] ?? m);

  function handlePayoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canRequestPayout) {
      toast({ title: t.royalties.payout_form.unavailable, description: t.royalties.payout_form.unavailable_desc, variant: "destructive" });
      return;
    }
    if (!summary) {
      toast({ title: t.royalties.payout_form.data_loading, description: t.royalties.payout_form.data_loading_desc, variant: "destructive" });
      return;
    }
    const amt = parseFloat(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: t.royalties.payout_form.invalid_amount, description: t.royalties.payout_form.invalid_amount_desc, variant: "destructive" });
      return;
    }
    if (amt < summary.minimumPayout) {
      toast({ title: t.royalties.payout_form.below_minimum, description: `${t.royalties.kpi.min_payout}: ${fmtMoney(summary.minimumPayout)}`, variant: "destructive" });
      return;
    }
    if (amt > summary.availableBalance) {
      toast({ title: t.royalties.payout_form.insufficient, description: `${t.royalties.kpi.available}: ${fmtMoney(summary.availableBalance)}`, variant: "destructive" });
      return;
    }
    createPayout.mutate(
      {
        data: {
          amount: amt,
          currency: "USD",
          method: payMethod,
          paymentDetails: payDetails || null,
          artistId: entityParams.entity_type === "artist" ? entityParams.entity_id : null,
          labelId:  entityParams.entity_type === "label"  ? entityParams.entity_id : null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t.royalties.payout_form.request_sent, description: t.royalties.payout_form.request_sent_desc });
          setPayAmount(""); setPayDetails("");
          queryClient.invalidateQueries({ queryKey: getListPayoutsQueryKey(payoutParams) });
          queryClient.invalidateQueries({ queryKey: getGetRoyaltySummaryQueryKey(entityParams) });
        },
        onError: () => {
          toast({ title: t.royalties.payout_form.request_error, description: t.royalties.payout_form.request_error_desc, variant: "destructive" });
        },
      },
    );
  }

  const grossDelta = summary ? pct(summary.currentPeriodGross, summary.previousPeriodGross) : 0;
  const streamDelta = summary ? pct(summary.currentPeriodStreams, summary.previousPeriodStreams) : 0;

  const monthLabel = (period: string) => {
    const [, m] = period.split("-");
    return new Date(2000, parseInt(m, 10) - 1, 1).toLocaleString("en-US", { month: "short" });
  };

  const isEarningsRole = user?.role === "label" || user?.role === "artist";

  return (
    <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {isEarningsRole ? nav.earnings : nav.royalties}
            </h1>
            <p className="text-muted-foreground mt-1">
              {entityParams.entity_type ? t.royalties.subtitle : t.royalties.subtitle_full}
            </p>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 self-start">
            <Calendar className="h-3 w-3 mr-1" />
            {t.royalties.period_label}
          </Badge>
        </div>

        {/* KPI strip */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t.royalties.kpi.available}</CardTitle>
              <Wallet className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {summaryQ.isLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold text-primary">{fmtMoney(summary?.availableBalance ?? 0)}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t.royalties.kpi.min_payout}: {fmtMoney(summary?.minimumPayout ?? 0)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t.royalties.kpi.in_processing}</CardTitle>
              <DollarSign className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              {summaryQ.isLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold text-amber-400">{fmtMoney(summary?.pendingBalance ?? 0)}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">{t.royalties.kpi.current_period}</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t.royalties.kpi.this_month}</CardTitle>
              {grossDelta >= 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-400" /> : <ArrowDownRight className="h-4 w-4 text-rose-400" />}
            </CardHeader>
            <CardContent>
              {summaryQ.isLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold">{fmtMoney(summary?.currentPeriodGross ?? 0)}</div>
              )}
              <p className={`text-xs mt-1 ${grossDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {grossDelta >= 0 ? "+" : ""}{grossDelta.toFixed(1)}% {t.royalties.kpi.vs_prev}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t.royalties.kpi.streams}</CardTitle>
              {streamDelta >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-rose-400" />}
            </CardHeader>
            <CardContent>
              {summaryQ.isLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold">{fmtNum(summary?.currentPeriodStreams ?? 0)}</div>
              )}
              <p className={`text-xs mt-1 ${streamDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {streamDelta >= 0 ? "+" : ""}{streamDelta.toFixed(1)}% {t.royalties.kpi.vs_prev}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList className={`grid w-full bg-card/50 backdrop-blur ${user?.role === "label" ? "grid-cols-4 lg:grid-cols-7" : "grid-cols-3 lg:grid-cols-6"}`}>
            <TabsTrigger value="summary"><Wallet className="h-4 w-4 mr-2" /> {t.royalties.tabs.summary}</TabsTrigger>
            <TabsTrigger value="statements"><FileText className="h-4 w-4 mr-2" /> {t.royalties.tabs.statements}</TabsTrigger>
            <TabsTrigger value="releases"><Disc3 className="h-4 w-4 mr-2" /> {t.royalties.tabs.releases}</TabsTrigger>
            <TabsTrigger value="dsp"><Radio className="h-4 w-4 mr-2" /> {t.royalties.tabs.dsp}</TabsTrigger>
            <TabsTrigger value="request"><Send className="h-4 w-4 mr-2" /> {t.royalties.tabs.request}</TabsTrigger>
            <TabsTrigger value="history"><History className="h-4 w-4 mr-2" /> {t.royalties.tabs.history}</TabsTrigger>
            {user?.role === "label" && (
              <TabsTrigger value="by_artist"><Banknote className="h-4 w-4 mr-2" /> По артистам</TabsTrigger>
            )}
          </TabsList>

          {/* ─── 1. Royalty Summary ───────────────────────── */}
          <TabsContent value="summary" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="bg-card/50 backdrop-blur border-border/50 lg:col-span-2">
                <CardHeader>
                  <CardTitle>{t.royalties.chart.income_12m}</CardTitle>
                  <CardDescription>{t.royalties.chart.gross_net}</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {summaryQ.isLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : summaryQ.isError ? (
                    <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{t.royalties.statements.load_error}</AlertDescription></Alert>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={summary?.timeline ?? []} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="period" tickFormatter={monthLabel} stroke="#94a3b8" fontSize={12} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8 }}
                          formatter={(v: any) => fmtMoney(Number(v))}
                          labelFormatter={(l) => l}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="gross" name={t.royalties.chart.gross} stroke="#6366f1" fill="url(#grossGrad)" strokeWidth={2} />
                        <Area type="monotone" dataKey="net"   name={t.royalties.chart.net}   stroke="#22d3ee" fill="url(#netGrad)"   strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle>{t.royalties.chart.kpi_title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {summaryQ.isLoading ? <Skeleton className="h-40" /> : (
                    <>
                      <div className="flex justify-between items-center pb-3 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">{t.royalties.chart.lifetime}</span>
                        <span className="font-semibold">{fmtMoney(summary?.lifetimeEarnings ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">{t.royalties.chart.current_month}</span>
                        <span className="font-semibold">{fmtMoney(summary?.currentPeriodGross ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">{t.royalties.chart.prev_month}</span>
                        <span className="font-semibold">{fmtMoney(summary?.previousPeriodGross ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">{t.royalties.chart.next_statement}</span>
                        <span className="font-semibold text-sm">
                          {summary?.nextStatementDate ? new Date(summary.nextStatementDate).toLocaleDateString() : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">{t.royalties.chart.next_payment}</span>
                        <span className="font-semibold text-sm">
                          {summary?.nextPaymentDate ? new Date(summary.nextPaymentDate).toLocaleDateString() : "—"}
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── 2. Statements ────────────────────────────── */}
          <TabsContent value="statements" className="space-y-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>{t.royalties.statements.title}</CardTitle>
                <CardDescription>{t.royalties.statements.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                {statementsQ.isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : statementsQ.isError ? (
                  <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{t.royalties.statements.load_error}</AlertDescription></Alert>
                ) : (statementsQ.data ?? []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">{t.royalties.statements.empty}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.royalties.statements.period}</TableHead>
                          <TableHead className="text-right">{t.royalties.statements.streams}</TableHead>
                          <TableHead className="text-right">{t.royalties.statements.gross}</TableHead>
                          <TableHead className="text-right">{t.royalties.statements.commission}</TableHead>
                          <TableHead className="text-right">{t.royalties.statements.net}</TableHead>
                          <TableHead>{t.royalties.statements.status}</TableHead>
                          <TableHead className="text-right">{t.royalties.statements.download}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(statementsQ.data ?? []).map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.periodLabel}</TableCell>
                            <TableCell className="text-right">{fmtNum(s.streams)}</TableCell>
                            <TableCell className="text-right">{fmtMoney(s.gross, s.currency)}</TableCell>
                            <TableCell className="text-right text-rose-400">−{fmtMoney(s.fees, s.currency)}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">{fmtMoney(s.net, s.currency)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                s.status === "paid"      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                s.status === "finalized" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                                                           "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              }>
                                {s.status === "paid" ? t.royalties.statements.status_paid : s.status === "finalized" ? t.royalties.statements.status_finalized : t.royalties.statements.status_draft}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button asChild size="sm" variant="ghost">
                                  <a href={`/api${s.pdfUrl.replace("/api","")}`} target="_blank" rel="noopener" download>
                                    <Download className="h-3 w-3 mr-1" /> PDF
                                  </a>
                                </Button>
                                <Button asChild size="sm" variant="ghost">
                                  <a href={`/api${s.csvUrl.replace("/api","")}`} target="_blank" rel="noopener" download>
                                    <Download className="h-3 w-3 mr-1" /> CSV
                                  </a>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── 3. By Release ────────────────────────────── */}
          <TabsContent value="releases" className="space-y-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>{t.royalties.by_release.title}</CardTitle>
                <CardDescription>{t.royalties.by_release.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                {byReleaseQ.isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
                ) : byReleaseQ.isError ? (
                  <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{t.royalties.by_release.load_error}</AlertDescription></Alert>
                ) : (byReleaseQ.data ?? []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">{t.royalties.by_release.empty}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.royalties.by_release.release}</TableHead>
                          <TableHead>{t.royalties.by_release.artist}</TableHead>
                          <TableHead className="text-right">{t.royalties.by_release.streams}</TableHead>
                          <TableHead className="text-right">{t.royalties.by_release.gross}</TableHead>
                          <TableHead className="text-right">{t.royalties.by_release.net}</TableHead>
                          <TableHead className="text-right">{t.royalties.by_release.trend}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(byReleaseQ.data ?? []).map((r) => (
                          <TableRow key={r.releaseId}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {r.coverUrl ? (
                                  <img src={r.coverUrl} alt="" className="h-9 w-9 rounded-md object-cover" />
                                ) : (
                                  <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                                    <Disc3 className="h-4 w-4 text-primary" />
                                  </div>
                                )}
                                <div>
                                  <div className="font-medium">{r.title}</div>
                                  {r.upc && <div className="text-xs text-muted-foreground">UPC {r.upc}</div>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{r.artistName}</TableCell>
                            <TableCell className="text-right">{fmtNum(r.streams)}</TableCell>
                            <TableCell className="text-right">{fmtMoney(r.gross, r.currency)}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">{fmtMoney(r.net, r.currency)}</TableCell>
                            <TableCell className="text-right">
                              <span className={`inline-flex items-center gap-1 text-xs ${r.trend >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {r.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                {Math.abs(r.trend)}%
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── 4. By DSP ────────────────────────────────── */}
          <TabsContent value="dsp" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle>{t.royalties.by_dsp.title}</CardTitle>
                  <CardDescription>{t.royalties.by_dsp.desc}</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {byDspQ.isLoading ? <Skeleton className="h-full w-full" /> :
                   byDspQ.isError ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{t.royalties.by_dsp.load_error}</AlertDescription></Alert> :
                   (byDspQ.data ?? []).length === 0 ? <div className="flex h-full items-center justify-center text-muted-foreground">{t.royalties.by_dsp.empty}</div> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={byDspQ.data} dataKey="gross" nameKey="dsp" cx="50%" cy="50%" outerRadius={100} innerRadius={55} paddingAngle={2}>
                          {(byDspQ.data ?? []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8 }}
                          formatter={(v: any) => fmtMoney(Number(v))}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle>{t.royalties.by_dsp.title}</CardTitle>
                  <CardDescription>{t.royalties.chart.for_period}</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {byDspQ.isLoading ? <Skeleton className="h-full w-full" /> :
                   (byDspQ.data ?? []).length === 0 ? <div className="flex h-full items-center justify-center text-muted-foreground">{t.royalties.by_dsp.empty}</div> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byDspQ.data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="dsp" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8 }}
                          formatter={(v: any) => fmtMoney(Number(v))}
                        />
                        <Bar dataKey="gross" fill="#6366f1" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="pt-6">
                {byDspQ.isLoading ? (
                  <Skeleton className="h-32" />
                ) : byDspQ.isError ? (
                  <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{t.royalties.by_dsp.load_error}</AlertDescription></Alert>
                ) : (byDspQ.data ?? []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">{t.royalties.by_dsp.empty}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.royalties.by_dsp.platform}</TableHead>
                          <TableHead className="text-right">{t.royalties.by_dsp.streams}</TableHead>
                          <TableHead className="text-right">{t.royalties.by_dsp.gross}</TableHead>
                          <TableHead className="text-right">{t.royalties.by_dsp.net}</TableHead>
                          <TableHead className="text-right">{t.royalties.by_dsp.share}</TableHead>
                          <TableHead className="text-right">{t.royalties.by_release.trend}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(byDspQ.data ?? []).map((d, i) => (
                          <TableRow key={d.dsp}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                <span className="font-medium">{d.dsp}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{fmtNum(d.streams)}</TableCell>
                            <TableCell className="text-right">{fmtMoney(d.gross, d.currency)}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">{fmtMoney(d.net, d.currency)}</TableCell>
                            <TableCell className="text-right">{d.share.toFixed(1)}%</TableCell>
                            <TableCell className="text-right">
                              <span className={`inline-flex items-center gap-1 text-xs ${d.trend >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {d.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                {Math.abs(d.trend)}%
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── 5. Request Payment ───────────────────────── */}
          <TabsContent value="request" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="bg-card/50 backdrop-blur border-border/50 lg:col-span-2">
                <CardHeader>
                  <CardTitle>{t.royalties.payout_form.title}</CardTitle>
                  <CardDescription>
                    {t.royalties.kpi.available}: <span className="text-primary font-semibold">{fmtMoney(summary?.availableBalance ?? 0)}</span>
                    {" · "}{t.royalties.kpi.min_payout}: {fmtMoney(summary?.minimumPayout ?? 50)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!canRequestPayout && (
                    <Alert className="mb-4 border-amber-500/30 bg-amber-500/5">
                      <Info className="h-4 w-4 text-amber-400" />
                      <AlertDescription>
                        {t.royalties.payout_form.unavailable_desc}
                      </AlertDescription>
                    </Alert>
                  )}
                  {canRequestPayout && user && user.kycStatus !== "approved" && (
                    <Alert className="mb-4 border-rose-500/30 bg-rose-500/5">
                      <ShieldAlert className="h-4 w-4 text-rose-400" />
                      <AlertDescription className="text-rose-200/90">
                        {t.royalties.payout_form.kyc_blocked}{" "}
                        <Link to="/profile" className="underline font-medium hover:text-white">
                          {t.royalties.payout_form.kyc_link}
                        </Link>
                      </AlertDescription>
                    </Alert>
                  )}
                  {canRequestPayout && user && user.kycStatus === "approved" &&
                   (!user.bankAccountNumber || !user.bankSwift || !user.bankHolderName) && (
                    <Alert className="mb-4 border-amber-500/30 bg-amber-500/5">
                      <Banknote className="h-4 w-4 text-amber-400" />
                      <AlertDescription className="text-amber-200/90">
                        {t.royalties.payout_form.bank_blocked}{" "}
                        <Link to="/profile" className="underline font-medium hover:text-white">
                          {t.royalties.payout_form.bank_link}
                        </Link>
                      </AlertDescription>
                    </Alert>
                  )}
                  <form onSubmit={handlePayoutSubmit} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="amount">{t.royalties.payout_form.amount}</Label>
                        <Input
                          id="amount" type="number" min="0" step="0.01"
                          placeholder="0.00"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t.royalties.payout_form.method}</Label>
                        <Select value={payMethod} onValueChange={(v) => setPayMethod(v as any)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(["bank_transfer", "paypal", "payoneer", "crypto", "wallet"] as const).map((k) => (
                              <SelectItem key={k} value={k}>{methodLabel(k)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="details">{t.royalties.payout_form.details}</Label>
                      <Input
                        id="details"
                        placeholder={t.royalties.payout_form.details_placeholder}
                        value={payDetails}
                        onChange={(e) => setPayDetails(e.target.value)}
                      />
                    </div>
                    {(() => {
                      const kycMissing = !!user && user.kycStatus !== "approved";
                      const bankMissing = !!user && (!user.bankAccountNumber || !user.bankSwift || !user.bankHolderName);
                      const guardBlocked = canRequestPayout && (kycMissing || bankMissing);
                      const submitDisabled =
                        createPayout.isPending || !canRequestPayout ||
                        !summary || summaryQ.isLoading || guardBlocked;
                      return (
                        <div className="flex gap-3">
                          <Button
                            type="submit"
                            disabled={submitDisabled}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            {createPayout.isPending ? t.royalties.payout_form.submitting : t.royalties.payout_form.submit}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!canRequestPayout || !summary}
                            onClick={() => summary && setPayAmount(String(summary.availableBalance))}
                          >
                            {t.royalties.payout_form.request_max}
                          </Button>
                        </div>
                      );
                    })()}
                  </form>
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Info className="h-4 w-4 text-primary" /> {t.royalties.payout_form.conditions_title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>• {t.royalties.payout_form.min_payout_label}: <span className="text-foreground font-semibold">{fmtMoney(summary?.minimumPayout ?? 50)}</span></p>
                  <p>• {t.royalties.payout_form.processing_time}: <span className="text-foreground font-semibold">{t.royalties.payout_form.processing_days}</span></p>
                  <p>• {t.royalties.payout_form.fee_label}: <span className="text-foreground font-semibold">{t.royalties.payout_form.fee_value}</span></p>
                  <p>• {t.royalties.payout_form.network_fee_note}</p>
                  <p>• {t.royalties.payout_form.history_note}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── 6. Payment History ───────────────────────── */}
          <TabsContent value="history" className="space-y-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>{t.royalties.history.title}</CardTitle>
                <CardDescription>{t.royalties.history.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                {payoutsQ.isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : payoutsQ.isError ? (
                  <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{t.royalties.history.load_error}</AlertDescription></Alert>
                ) : (payoutsQ.data?.data ?? []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">{t.royalties.history.empty}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.royalties.history.col_date}</TableHead>
                          <TableHead>{t.royalties.history.col_method}</TableHead>
                          <TableHead className="text-right">{t.royalties.history.col_amount}</TableHead>
                          <TableHead>{t.royalties.history.col_status}</TableHead>
                          <TableHead>{t.royalties.history.col_processed}</TableHead>
                          <TableHead>{t.royalties.history.col_note}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(payoutsQ.data?.data ?? []).map((p) => {
                          const stLabel = payoutStatusLabel(p.status);
                          const ps = String(p.status);
                          const stCls =
                            ps === "paid"      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            ps === "rejected"  ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                            ps === "processing"? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                                                 "bg-amber-500/10 text-amber-400 border-amber-500/20";
                          return (
                            <TableRow key={p.id}>
                              <TableCell>{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                              <TableCell className="text-muted-foreground">{methodLabel(p.method)}</TableCell>
                              <TableCell className="text-right font-semibold">{fmtMoney(p.amount, p.currency)}</TableCell>
                              <TableCell><Badge variant="outline" className={stCls}>{stLabel}</Badge></TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {p.processedAt ? new Date(p.processedAt).toLocaleDateString() : "—"}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">
                                {p.rejectionReason ?? p.paymentDetails ?? "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── 7. By Artist (label only) ────────────────── */}
          {user?.role === "label" && (
            <TabsContent value="by_artist" className="space-y-4">
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Разбивка по артистам</CardTitle>
                    <CardDescription>Доходы и стримы по каждому артисту лейбла</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5"
                    onClick={() => {
                      const rows = byReleaseQ.data ?? [];
                      const byArtist = new Map<string, { streams: number; gross: number; net: number; currency: string; count: number }>();
                      for (const r of rows) {
                        const a = byArtist.get(r.artistName) ?? { streams: 0, gross: 0, net: 0, currency: r.currency, count: 0 };
                        a.streams += r.streams; a.gross += r.gross; a.net += r.net; a.count += 1;
                        byArtist.set(r.artistName, a);
                      }
                      const csv = ["Артист,Релизов,Стримов,Gross,Net,Валюта",
                        ...Array.from(byArtist.entries()).map(([n, v]) =>
                          `"${n}",${v.count},${v.streams},${v.gross.toFixed(2)},${v.net.toFixed(2)},${v.currency}`)
                      ].join("\n");
                      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                      const a = document.createElement("a"); a.href = url; a.download = "artists-royalties.csv"; a.click();
                      URL.revokeObjectURL(url);
                    }}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {byReleaseQ.isLoading ? (
                    <div className="p-6 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                  ) : byReleaseQ.isError ? (
                    <div className="p-6"><Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Ошибка загрузки данных</AlertDescription></Alert></div>
                  ) : (() => {
                    const rows = byReleaseQ.data ?? [];
                    if (rows.length === 0) return <div className="p-6 text-center text-muted-foreground">Нет данных</div>;
                    const byArtist = new Map<string, { streams: number; gross: number; net: number; currency: string; count: number }>();
                    for (const r of rows) {
                      const a = byArtist.get(r.artistName) ?? { streams: 0, gross: 0, net: 0, currency: r.currency, count: 0 };
                      a.streams += r.streams; a.gross += r.gross; a.net += r.net; a.count += 1;
                      byArtist.set(r.artistName, a);
                    }
                    const sorted = Array.from(byArtist.entries()).sort((a, b) => b[1].net - a[1].net);
                    const totalNet = sorted.reduce((s, [, v]) => s + v.net, 0);
                    return (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Артист</TableHead>
                            <TableHead className="text-right">Релизов</TableHead>
                            <TableHead className="text-right">Стримов</TableHead>
                            <TableHead className="text-right">Gross</TableHead>
                            <TableHead className="text-right">Net</TableHead>
                            <TableHead className="text-right">Доля</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sorted.map(([name, v]) => (
                            <TableRow key={name}>
                              <TableCell className="font-medium">{name}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{v.count}</TableCell>
                              <TableCell className="text-right">{fmtNum(v.streams)}</TableCell>
                              <TableCell className="text-right">{fmtMoney(v.gross, v.currency)}</TableCell>
                              <TableCell className="text-right font-semibold text-primary">{fmtMoney(v.net, v.currency)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-primary rounded-full" style={{ width: `${totalNet ? (v.net / totalNet) * 100 : 0}%` }} />
                                  </div>
                                  <span className="text-xs text-muted-foreground w-8 text-right">
                                    {totalNet ? ((v.net / totalNet) * 100).toFixed(0) : 0}%
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
  );
}
