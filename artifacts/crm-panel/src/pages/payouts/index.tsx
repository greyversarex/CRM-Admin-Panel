import { Layout } from "@/components/layout";
import { useListPayouts } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter, Wallet, CheckCircle, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Payouts() {
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: payoutsData, isLoading } = useListPayouts({ 
    search: searchQuery || undefined,
    limit: 50 
  });

  return (
    <Layout>
      <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payout Requests</h1>
            <p className="text-muted-foreground mt-1">Review and process payout requests from artists and labels.</p>
          </div>
        </div>

        <Card className="flex-1 bg-card/50 backdrop-blur border-border/50 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-80">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search requests..."
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
                  <TableHead>Entity</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Date Requested</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                      No payout requests found.
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
                        <div className="text-xs text-muted-foreground">{payout.artistId ? 'Artist' : 'Label'}</div>
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
                        {payout.status === 'pending' && (
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" title="Approve">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10" title="Reject">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
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