import { useState } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useListTransactions, useListBalances, getListTransactionsQueryKey, useCreateTransaction } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, DollarSign, TrendingUp, TrendingDown, Wallet, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const TYPE_COLORS: Record<string, string> = {
  dsp_revenue: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  publishing_revenue: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  content_id: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  manual: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  payout: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  dsp_revenue: "DSP Revenue",
  publishing_revenue: "Publishing",
  content_id: "Content ID",
  manual: "Manual",
  payout: "Payout",
};

export default function Finance() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const isAdminLike = user?.role === "admin" || user?.role === "manager";
  const isArtist    = user?.role === "artist";
  const isLabel     = user?.role === "label";

  const params = {
    page, limit: 20,
    ...(isArtist && user?.artistId ? { artist_id: user.artistId } : {}),
    ...(isLabel  && user?.labelId  ? { label_id:  user.labelId  } : {}),
  };
  const { data: transactionsData, isLoading: txLoading } = useListTransactions(params, {
    query: { queryKey: getListTransactionsQueryKey(params) },
  });
  const { data: balances, isLoading: balLoading } = useListBalances();
  const filteredBalances = balances?.filter(b => {
    if (isArtist) return b.entityType === "artist" && b.entityId === user?.artistId;
    if (isLabel)  return b.entityType === "label"  && b.entityId === user?.labelId;
    return true;
  }) ?? [];

  const titleByRole = isAdminLike ? "Финансы платформы"
    : isLabel  ? "Финансы лейбла"
    :            "Мои финансы";
  const subtitleByRole = isAdminLike
    ? "Транзакции, балансы артистов и лейблов, ингест отчётов DSP."
    : "Твои транзакции и текущий баланс.";

  const totalIncome = transactionsData?.data
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0) ?? 0;

  const totalPayout = transactionsData?.data
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0) ?? 0;

  const filteredTx = transactionsData?.data.filter(t =>
    !search ||
    t.description?.toLowerCase().includes(search.toLowerCase()) ||
    t.platform?.toLowerCase().includes(search.toLowerCase()) ||
    t.artistName?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{titleByRole}</h1>
            <p className="text-muted-foreground mt-1">{subtitleByRole}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              {txLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold text-emerald-500">${totalIncome.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Payouts</CardTitle>
              <TrendingDown className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              {txLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold text-rose-500">${totalPayout.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {txLoading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{transactionsData?.pagination.total ?? 0}</div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {isAdminLike ? "Artist Balances" : "Текущий баланс"}
              </CardTitle>
              <Wallet className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {balLoading ? <Skeleton className="h-8 w-16" /> : isAdminLike ? (
                <div className="text-2xl font-bold">{balances?.length ?? 0}</div>
              ) : (
                <div className="text-2xl font-bold text-emerald-400">
                  ${(filteredBalances[0]?.balance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {isAdminLike && (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  Revenue Ingestion (DSP CSV)
                </CardTitle>
                <CardDescription className="text-xs mt-1">Загрузка отчётов от платформ → автоматический парсинг → раскладка по артистам/трекам</CardDescription>
              </div>
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV / TSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-b border-dashed border-border/50 p-4 bg-background/30">
              <div className="flex items-center justify-center gap-2 py-6 rounded-md border-2 border-dashed border-border bg-card/30 hover:border-primary/40 transition-colors cursor-pointer">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop CSV/TSV files here, or <span className="text-primary underline">browse</span>
                </p>
                <span className="text-xs text-muted-foreground/60 ml-3 font-mono">
                  Supported: Spotify, Apple Music, Yandex, VK, TikTok, YouTube · max 50 MB
                </span>
              </div>
            </div>
            <Table>
              <TableHeader className="bg-background/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead>File</TableHead>
                  <TableHead>DSP</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead className="text-right">Gross Revenue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { file: "spotify_2026_03.csv", dsp: "Spotify", period: "Mar 2026", rows: 14842, gross: "$8,420.18", status: "processed", uploaded: "2026-04-08" },
                  { file: "apple_music_2026_03.tsv", dsp: "Apple Music", period: "Mar 2026", rows: 9214, gross: "$6,180.42", status: "processed", uploaded: "2026-04-08" },
                  { file: "yandex_music_2026_03.csv", dsp: "Yandex Music", period: "Mar 2026", rows: 22418, gross: "$3,142.80", status: "processed", uploaded: "2026-04-09" },
                  { file: "tiktok_2026_03.csv", dsp: "TikTok", period: "Mar 2026", rows: 1842, gross: "$420.10", status: "review", uploaded: "2026-04-10" },
                  { file: "youtube_cms_2026_03.csv", dsp: "YouTube", period: "Mar 2026", rows: 6418, gross: "$2,840.60", status: "processing", uploaded: "2026-04-11" },
                ].map((r, i) => (
                  <TableRow key={i} className="hover:bg-accent/20">
                    <TableCell className="font-mono text-xs">{r.file}</TableCell>
                    <TableCell className="text-sm">{r.dsp}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.period}</TableCell>
                    <TableCell className="text-sm tabular-nums">{r.rows.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-emerald-400 tabular-nums">{r.gross}</TableCell>
                    <TableCell>
                      {r.status === "processed" && <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20"><CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Processed</Badge>}
                      {r.status === "processing" && <Badge variant="outline" className="text-[10px] text-blue-400 bg-blue-500/10 border-blue-500/20"><Clock className="h-2.5 w-2.5 mr-1" /> Processing</Badge>}
                      {r.status === "review" && <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20"><AlertTriangle className="h-2.5 w-2.5 mr-1" /> Needs Review</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs">View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 bg-card/50 backdrop-blur border-border/50 flex flex-col">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Transaction Ledger</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search transactions..."
                    className="pl-8 h-8 bg-background/50"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
              <Table>
                <TableHeader className="bg-background/50 sticky top-0 z-10">
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead>Type</TableHead>
                    <TableHead>Artist / Platform</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i} className="border-border/50">
                        <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredTx.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        No transactions found.
                      </TableCell>
                    </TableRow>
                  ) : filteredTx.map(t => (
                    <TableRow key={t.id} className="border-border/50 hover:bg-accent/30" data-testid={`row-transaction-${t.id}`}>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${TYPE_COLORS[t.type] ?? ""}`}>
                          {TYPE_LABELS[t.type] ?? t.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{t.artistName || t.labelName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{t.platform || "—"}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{t.description || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.period || "—"}</TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${t.amount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {t.amount >= 0 ? "+" : ""}${Math.abs(t.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            {transactionsData && transactionsData.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-border/50">
                <span className="text-sm text-muted-foreground">
                  Page {transactionsData.pagination.page} of {transactionsData.pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= transactionsData.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-base">
                {isAdminLike ? "Artist Balances" : "Балансы"}
              </CardTitle>
              <CardDescription>
                {isAdminLike ? "Current pending balances by artist" : "Твой текущий и pending-баланс"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-auto max-h-[500px]">
              {balLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {filteredBalances.map((b, i) => (
                    <div key={i} className="flex items-center justify-between p-4 hover:bg-accent/30" data-testid={`row-balance-${i}`}>
                      <div>
                        <div className="text-sm font-medium">{b.entityName}</div>
                        <div className="text-xs text-muted-foreground capitalize">{b.entityType}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums text-emerald-400">
                          ${b.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Pending: ${b.pendingPayout.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
