import { Layout } from "@/components/layout";
import { useListDeliveries } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Send, RefreshCw, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLang } from "@/lib/i18n";

export default function Delivery() {
  const { t } = useLang();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: deliveryData, isLoading } = useListDeliveries({
    limit: 50
  });

  const filtered = (deliveryData?.data ?? []).filter(d =>
    !searchQuery || d.releaseName?.toLowerCase().includes(searchQuery.toLowerCase()) || d.target?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t.delivery.title}</h1>
            <p className="text-muted-foreground mt-1">{t.delivery.subtitle}</p>
          </div>
          <Button>
            <Send className="mr-2 h-4 w-4" />
            {t.delivery.new_delivery}
          </Button>
        </div>

        <Card className="flex-1 bg-card/50 backdrop-blur border-border/50 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={t.delivery.search_placeholder}
                className="pl-8 bg-background/50 border-border"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-auto">
            <Table>
              <TableHeader className="bg-background/50 sticky top-0 z-10">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead>{t.delivery.table.release}</TableHead>
                  <TableHead>{t.delivery.table.target_dsp}</TableHead>
                  <TableHead>{t.delivery.table.ddex_version}</TableHead>
                  <TableHead>{t.delivery.table.date}</TableHead>
                  <TableHead>{t.delivery.table.status}</TableHead>
                  <TableHead className="text-right">{t.delivery.table.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-[80px] rounded-full" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 rounded-md ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">
                      {t.delivery.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((delivery) => (
                    <TableRow key={delivery.id} className="border-border/50 hover:bg-accent/30 cursor-pointer">
                      <TableCell className="font-medium text-foreground">{delivery.releaseName}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">{delivery.target}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{delivery.ddexVersion || 'N/A'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(delivery.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={delivery.status} />
                          {delivery.errorMessage && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertCircle className="h-4 w-4 text-destructive" />
                              </TooltipTrigger>
                              <TooltipContent className="bg-destructive text-destructive-foreground border-none">
                                <p className="max-w-[200px] text-xs">{delivery.errorMessage}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" title={t.delivery.retry}>
                          <RefreshCw className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </Button>
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
