import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
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

const PAYOUT_STATUS: Record<string, { label: string; cls: string }> = {
  pending:  { label: "В ожидании", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  approved: { label: "Одобрено",   cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  paid:     { label: "Выплачено",  cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  rejected: { label: "Отклонено",  cls: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
};

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Банковский перевод",
  paypal: "PayPal",
  payoneer: "Payoneer",
  crypto: "Криптовалюта",
  wallet: "Внутренний кошелёк",
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
  const { user } = useAuth();
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

  function handlePayoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canRequestPayout) {
      toast({ title: "Недоступно", description: "Запрос выплаты доступен только для аккаунтов артиста или лейбла.", variant: "destructive" });
      return;
    }
    if (!summary) {
      toast({ title: "Данные ещё не загрузились", description: "Подожди пару секунд, пока загрузится баланс.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Неверная сумма", description: "Укажи сумму больше нуля", variant: "destructive" });
      return;
    }
    if (amt < summary.minimumPayout) {
      toast({ title: "Сумма ниже минимума", description: `Минимум для выплаты: ${fmtMoney(summary.minimumPayout)}`, variant: "destructive" });
      return;
    }
    if (amt > summary.availableBalance) {
      toast({ title: "Недостаточно средств", description: `Доступно: ${fmtMoney(summary.availableBalance)}`, variant: "destructive" });
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
          toast({ title: "Запрос отправлен", description: "Заявка на выплату создана и ждёт одобрения." });
          setPayAmount(""); setPayDetails("");
          queryClient.invalidateQueries({ queryKey: getListPayoutsQueryKey(payoutParams) });
          queryClient.invalidateQueries({ queryKey: getGetRoyaltySummaryQueryKey(entityParams) });
        },
        onError: () => {
          toast({ title: "Ошибка", description: "Не удалось создать заявку. Попробуй ещё раз.", variant: "destructive" });
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

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Роялти</h1>
            <p className="text-muted-foreground mt-1">
              Отчёты, выплаты и аналитика доходов
              {entityParams.entity_type ? "" : " по всему каталогу"}.
            </p>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 self-start">
            <Calendar className="h-3 w-3 mr-1" />
            Период: последние 12 месяцев
          </Badge>
        </div>

        {/* KPI strip */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Доступно к выплате</CardTitle>
              <Wallet className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {summaryQ.isLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold text-primary">{fmtMoney(summary?.availableBalance ?? 0)}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Минимум для запроса: {fmtMoney(summary?.minimumPayout ?? 0)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">В обработке</CardTitle>
              <DollarSign className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              {summaryQ.isLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold text-amber-400">{fmtMoney(summary?.pendingBalance ?? 0)}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Текущий отчётный месяц</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Этот месяц</CardTitle>
              {grossDelta >= 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-400" /> : <ArrowDownRight className="h-4 w-4 text-rose-400" />}
            </CardHeader>
            <CardContent>
              {summaryQ.isLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold">{fmtMoney(summary?.currentPeriodGross ?? 0)}</div>
              )}
              <p className={`text-xs mt-1 ${grossDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {grossDelta >= 0 ? "+" : ""}{grossDelta.toFixed(1)}% vs прошлый месяц
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Стримы (мес)</CardTitle>
              {streamDelta >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-rose-400" />}
            </CardHeader>
            <CardContent>
              {summaryQ.isLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold">{fmtNum(summary?.currentPeriodStreams ?? 0)}</div>
              )}
              <p className={`text-xs mt-1 ${streamDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {streamDelta >= 0 ? "+" : ""}{streamDelta.toFixed(1)}% vs прошлый месяц
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 bg-card/50 backdrop-blur">
            <TabsTrigger value="summary"><Wallet className="h-4 w-4 mr-2" /> Сводка</TabsTrigger>
            <TabsTrigger value="statements"><FileText className="h-4 w-4 mr-2" /> Отчёты</TabsTrigger>
            <TabsTrigger value="releases"><Disc3 className="h-4 w-4 mr-2" /> По релизам</TabsTrigger>
            <TabsTrigger value="dsp"><Radio className="h-4 w-4 mr-2" /> По DSP</TabsTrigger>
            <TabsTrigger value="request"><Send className="h-4 w-4 mr-2" /> Выплата</TabsTrigger>
            <TabsTrigger value="history"><History className="h-4 w-4 mr-2" /> История</TabsTrigger>
          </TabsList>

          {/* ─── 1. Royalty Summary ───────────────────────── */}
          <TabsContent value="summary" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="bg-card/50 backdrop-blur border-border/50 lg:col-span-2">
                <CardHeader>
                  <CardTitle>Доход за 12 месяцев</CardTitle>
                  <CardDescription>Гросс и нетто после комиссии (15%)</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {summaryQ.isLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : summaryQ.isError ? (
                    <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Не удалось загрузить данные.</AlertDescription></Alert>
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
                        <Area type="monotone" dataKey="gross" name="Гросс" stroke="#6366f1" fill="url(#grossGrad)" strokeWidth={2} />
                        <Area type="monotone" dataKey="net"   name="Нетто" stroke="#22d3ee" fill="url(#netGrad)"   strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle>Ключевые показатели</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {summaryQ.isLoading ? <Skeleton className="h-40" /> : (
                    <>
                      <div className="flex justify-between items-center pb-3 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">Lifetime доход</span>
                        <span className="font-semibold">{fmtMoney(summary?.lifetimeEarnings ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">Доход (этот мес)</span>
                        <span className="font-semibold">{fmtMoney(summary?.currentPeriodGross ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">Доход (прошлый мес)</span>
                        <span className="font-semibold">{fmtMoney(summary?.previousPeriodGross ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">Следующий отчёт</span>
                        <span className="font-semibold text-sm">
                          {summary?.nextStatementDate ? new Date(summary.nextStatementDate).toLocaleDateString("ru-RU") : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Следующая выплата</span>
                        <span className="font-semibold text-sm">
                          {summary?.nextPaymentDate ? new Date(summary.nextPaymentDate).toLocaleDateString("ru-RU") : "—"}
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
                <CardTitle>Месячные отчёты</CardTitle>
                <CardDescription>Скачивай отчёты в формате PDF или CSV.</CardDescription>
              </CardHeader>
              <CardContent>
                {statementsQ.isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : statementsQ.isError ? (
                  <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Не удалось загрузить отчёты.</AlertDescription></Alert>
                ) : (statementsQ.data ?? []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Отчётов пока нет.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Период</TableHead>
                          <TableHead className="text-right">Стримы</TableHead>
                          <TableHead className="text-right">Гросс</TableHead>
                          <TableHead className="text-right">Комиссия</TableHead>
                          <TableHead className="text-right">Нетто</TableHead>
                          <TableHead>Статус</TableHead>
                          <TableHead className="text-right">Скачать</TableHead>
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
                                {s.status === "paid" ? "Выплачен" : s.status === "finalized" ? "Финализирован" : "Черновик"}
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
                <CardTitle>Доход по релизам</CardTitle>
                <CardDescription>Отсортировано по убыванию gross-дохода.</CardDescription>
              </CardHeader>
              <CardContent>
                {byReleaseQ.isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
                ) : byReleaseQ.isError ? (
                  <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Не удалось загрузить данные.</AlertDescription></Alert>
                ) : (byReleaseQ.data ?? []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">У тебя пока нет релизов с доходом.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Релиз</TableHead>
                          <TableHead>Артист</TableHead>
                          <TableHead className="text-right">Стримы</TableHead>
                          <TableHead className="text-right">Гросс</TableHead>
                          <TableHead className="text-right">Нетто</TableHead>
                          <TableHead className="text-right">Тренд</TableHead>
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
                  <CardTitle>Распределение по платформам</CardTitle>
                  <CardDescription>Доля в общем доходе</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {byDspQ.isLoading ? <Skeleton className="h-full w-full" /> :
                   byDspQ.isError ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Ошибка загрузки.</AlertDescription></Alert> :
                   (byDspQ.data ?? []).length === 0 ? <div className="flex h-full items-center justify-center text-muted-foreground">Нет данных</div> : (
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
                  <CardTitle>Доход по DSP</CardTitle>
                  <CardDescription>Топ платформ за период</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {byDspQ.isLoading ? <Skeleton className="h-full w-full" /> :
                   (byDspQ.data ?? []).length === 0 ? <div className="flex h-full items-center justify-center text-muted-foreground">Нет данных</div> : (
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
                  <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Не удалось загрузить таблицу DSP.</AlertDescription></Alert>
                ) : (byDspQ.data ?? []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">Доходов по платформам пока нет.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Платформа</TableHead>
                          <TableHead className="text-right">Стримы</TableHead>
                          <TableHead className="text-right">Гросс</TableHead>
                          <TableHead className="text-right">Нетто</TableHead>
                          <TableHead className="text-right">Доля</TableHead>
                          <TableHead className="text-right">Тренд</TableHead>
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
                  <CardTitle>Запросить выплату</CardTitle>
                  <CardDescription>
                    Доступно сейчас: <span className="text-primary font-semibold">{fmtMoney(summary?.availableBalance ?? 0)}</span>
                    {" · "}минимум: {fmtMoney(summary?.minimumPayout ?? 50)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!canRequestPayout && (
                    <Alert className="mb-4 border-amber-500/30 bg-amber-500/5">
                      <Info className="h-4 w-4 text-amber-400" />
                      <AlertDescription>
                        Ты вошёл как админ/менеджер. Запрос выплаты доступен только из аккаунта артиста или лейбла.
                      </AlertDescription>
                    </Alert>
                  )}
                  {/* Task #6 — KYC + bank guard. Решение принимается на бэке
                      (POST /payouts вернёт 403), но дублируем UI-блокировку,
                      чтобы пользователь сразу понимал, что требуется. */}
                  {canRequestPayout && user && user.kycStatus !== "approved" && (
                    <Alert className="mb-4 border-rose-500/30 bg-rose-500/5">
                      <ShieldAlert className="h-4 w-4 text-rose-400" />
                      <AlertDescription className="text-rose-200/90">
                        Запрос выплаты заблокирован: KYC ещё не одобрен{" "}
                        {user.kycStatus === "pending" ? "(документы на проверке)" :
                         user.kycStatus === "rejected" ? "(заявка отклонена — обнови документы)" :
                         "(документы ещё не отправлены)"}.{" "}
                        <Link to="/profile" className="underline font-medium hover:text-white">
                          Перейти в профиль → KYC
                        </Link>
                      </AlertDescription>
                    </Alert>
                  )}
                  {canRequestPayout && user && user.kycStatus === "approved" &&
                   (!user.bankAccountNumber || !user.bankSwift || !user.bankHolderName) && (
                    <Alert className="mb-4 border-amber-500/30 bg-amber-500/5">
                      <Banknote className="h-4 w-4 text-amber-400" />
                      <AlertDescription className="text-amber-200/90">
                        Заполни банковские реквизиты, чтобы запрашивать выплаты: нужны номер счёта,
                        SWIFT/BIC и имя владельца.{" "}
                        <Link to="/profile" className="underline font-medium hover:text-white">
                          Перейти в профиль → Банк
                        </Link>
                      </AlertDescription>
                    </Alert>
                  )}
                  <form onSubmit={handlePayoutSubmit} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="amount">Сумма (USD)</Label>
                        <Input
                          id="amount" type="number" min="0" step="0.01"
                          placeholder="0.00"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Метод выплаты</Label>
                        <Select value={payMethod} onValueChange={(v) => setPayMethod(v as any)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(METHOD_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="details">Реквизиты / комментарий</Label>
                      <Input
                        id="details"
                        placeholder={
                          payMethod === "bank_transfer" ? "IBAN / номер счёта, банк, BIC" :
                          payMethod === "paypal" ? "PayPal email" :
                          payMethod === "crypto" ? "Адрес кошелька (USDT TRC20 и т.д.)" :
                          "Дополнительная информация"
                        }
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
                            title={
                              guardBlocked
                                ? (kycMissing ? "Сначала пройди KYC" : "Заполни банковские реквизиты")
                                : undefined
                            }
                          >
                            <Send className="h-4 w-4 mr-2" />
                            {createPayout.isPending ? "Отправка..." : "Отправить запрос"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!canRequestPayout || !summary}
                            onClick={() => summary && setPayAmount(String(summary.availableBalance))}
                          >
                            Запросить максимум
                          </Button>
                        </div>
                      );
                    })()}
                  </form>
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Info className="h-4 w-4 text-primary" /> Условия</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>• Минимальная сумма для запроса: <span className="text-foreground font-semibold">{fmtMoney(summary?.minimumPayout ?? 50)}</span></p>
                  <p>• Запросы обрабатываются в течение 5–10 рабочих дней.</p>
                  <p>• Комиссия дистрибьютора: <span className="text-foreground font-semibold">15%</span> с дохода.</p>
                  <p>• Сетевые комиссии (банк, крипто) могут вычитаться отдельно.</p>
                  <p>• История всех заявок — на вкладке «История».</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── 6. Payment History ───────────────────────── */}
          <TabsContent value="history" className="space-y-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle>История выплат</CardTitle>
                <CardDescription>Все запросы и их статус.</CardDescription>
              </CardHeader>
              <CardContent>
                {payoutsQ.isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : payoutsQ.isError ? (
                  <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Не удалось загрузить историю.</AlertDescription></Alert>
                ) : (payoutsQ.data?.data ?? []).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Заявок на выплату пока нет.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Дата</TableHead>
                          <TableHead>Метод</TableHead>
                          <TableHead className="text-right">Сумма</TableHead>
                          <TableHead>Статус</TableHead>
                          <TableHead>Обработана</TableHead>
                          <TableHead>Примечание</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(payoutsQ.data?.data ?? []).map((p) => {
                          const st = PAYOUT_STATUS[p.status] ?? PAYOUT_STATUS.pending;
                          return (
                            <TableRow key={p.id}>
                              <TableCell>{new Date(p.createdAt).toLocaleDateString("ru-RU")}</TableCell>
                              <TableCell className="text-muted-foreground">{METHOD_LABELS[p.method] ?? p.method}</TableCell>
                              <TableCell className="text-right font-semibold">{fmtMoney(p.amount, p.currency)}</TableCell>
                              <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {p.processedAt ? new Date(p.processedAt).toLocaleDateString("ru-RU") : "—"}
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
        </Tabs>
      </div>
    </Layout>
  );
}
