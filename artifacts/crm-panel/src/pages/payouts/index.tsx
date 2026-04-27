import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useListPayouts } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter, Wallet, CheckCircle, XCircle, Plus, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { exportPayoutsCsv } from "@/lib/export-payouts";
import { useLang } from "@/lib/i18n";

export default function Payouts() {
  const { user } = useAuth();
  const { t } = useLang();
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportLoaded, setExportLoaded] = useState(0);

  const isAdminLike = user?.role === "admin" || user?.role === "manager";
  const isArtist    = user?.role === "artist";
  const isLabel     = user?.role === "label";

  const { data: payoutsData, isLoading } = useListPayouts({
    limit: 50,
    ...(isArtist && user?.artistId ? { artist_id: user.artistId } : {}),
    ...(isLabel  && user?.labelId  ? { label_id:  user.labelId  } : {}),
  });

  const onExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportLoaded(0);
    try {
      const res = await exportPayoutsCsv(
        {
          ...(isArtist && user?.artistId ? { artist_id: user.artistId } : {}),
          ...(isLabel  && user?.labelId  ? { label_id:  user.labelId  } : {}),
          fromDate: fromDate || undefined,
          toDate:   toDate   || undefined,
        },
        (p) => setExportLoaded(p.loaded),
      );
      const sums = Object.entries(res.totalAmountByCurrency)
        .map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`)
        .join(", ");
      toast({
        title: t.payouts.export_success,
        description: res.count === 0
          ? t.payouts.export_no_records
          : t.payouts.export_records.replace("{n}", String(res.count)).replace("{sum}", sums || "—"),
      });
    } catch (e: any) {
      toast({
        title: t.payouts.export_error,
        description: e?.message ?? t.payouts.unknown_error,
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const title    = isAdminLike ? t.payouts.title_admin : t.payouts.title_other;
  const subtitle = isAdminLike ? t.payouts.subtitle_admin : t.payouts.subtitle_other;

  return (
    <Layout>
      <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{t.payouts.from}</span>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 w-[140px] bg-background/50"
              />
              <span className="text-muted-foreground">{t.payouts.to}</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 w-[140px] bg-background/50"
              />
            </div>
            <Button variant="outline" onClick={onExport} disabled={exporting}>
              <Download className="mr-2 h-4 w-4" />
              {exporting ? `${t.payouts.exporting} ${exportLoaded}` : t.payouts.export_csv}
            </Button>
            {!isAdminLike && (
              <Button onClick={() => toast({ title: t.payouts.request_payout, description: t.payouts.request_payout_desc })}>
                <Plus className="mr-2 h-4 w-4" /> {t.payouts.request_payout}
              </Button>
            )}
          </div>
        </div>

        <Card className="flex-1 bg-card/50 backdrop-blur border-border/50 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-80">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={t.payouts.search_placeholder}
                  className="pl-8 bg-background/50 border-border"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon" className="shrink-0 bg-background/50">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-auto">
            <Table>
              <TableHeader className="bg-background/50 sticky top-0 z-10">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>{t.payouts.table.entity}</TableHead>
                  <TableHead>{t.payouts.table.amount}</TableHead>
                  <TableHead>{t.payouts.table.method}</TableHead>
                  <TableHead>{t.payouts.table.date_requested}</TableHead>
                  <TableHead>{t.payouts.table.status}</TableHead>
                  <TableHead className="text-right">{t.payouts.table.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-[80px] rounded-full" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-16 rounded-md ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : payoutsData?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                      {t.payouts.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  payoutsData?.data.map((payout) => (
                    <TableRow key={payout.id} className="border-border/50 hover:bg-accent/30 cursor-pointer">
                      <TableCell>
                        <div className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                          <Wallet className="h-4 w-4" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">{payout.artistName || payout.labelName}</div>
                        <div className="text-xs text-muted-foreground">
                          {payout.artistId ? t.payouts.artist_type : t.payouts.label_type}
                        </div>
                      </TableCell>
                      <TableCell className="font-bold text-foreground">
                        {payout.currency} {payout.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">
                        {payout.method.replace('_', ' ')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(payout.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={payout.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {payout.status === 'pending' && isAdminLike && (
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" title={t.common.approve} aria-label={t.common.approve}>
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10" title={t.common.reject} aria-label={t.common.reject}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {payout.status === 'pending' && !isAdminLike && (
                          <span className="text-[10px] text-amber-300">{t.payouts.awaiting_review}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
