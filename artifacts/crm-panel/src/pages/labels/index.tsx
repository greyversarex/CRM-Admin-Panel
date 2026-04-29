import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useListLabels } from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Filter, Building2, MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLang } from "@/lib/i18n";

export default function Labels() {
  return (
    <Layout>
      <LabelsPanel />
    </Layout>
  );
}

export function LabelsPanel() {
  const { user } = useAuth();
  const { t } = useLang();
  const [searchQuery, setSearchQuery] = useState("");

  const isAdminLike = user?.role === "admin" || user?.role === "manager";
  const isLabel     = user?.role === "label";

  const { data: labelsDataRaw, isLoading } = useListLabels({
    search: searchQuery || undefined,
    limit: 50,
  });
  const labelsData = isLabel
    ? { ...labelsDataRaw, data: (labelsDataRaw?.data ?? []).filter(l => l.id === user?.labelId) }
    : labelsDataRaw;

  const title = isAdminLike ? t.labels.title_admin : t.labels.title_label;
  const subtitle = isAdminLike ? t.labels.subtitle_admin : t.labels.subtitle_label;

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground mt-1">{subtitle}</p>
          </div>
          {isAdminLike && (
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t.labels.new_label}
            </Button>
          )}
        </div>

        <Card className="flex-1 bg-card/50 backdrop-blur border-border/50 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-80">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder={t.labels.search_placeholder}
                    className="pl-8 bg-background/50 border-border"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon" className="shrink-0 bg-background/50">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-auto">
            <Table>
              <TableHeader className="bg-background/50 sticky top-0 z-10">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-[60px]">{t.labels.table.logo}</TableHead>
                  <TableHead>{t.labels.table.name}</TableHead>
                  <TableHead>{t.labels.table.country}</TableHead>
                  <TableHead className="text-right">{t.labels.table.artists}</TableHead>
                  <TableHead className="text-right">{t.labels.table.releases}</TableHead>
                  <TableHead>{t.labels.table.status}</TableHead>
                  <TableHead className="text-right">{t.labels.table.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell><Skeleton className="h-10 w-10 rounded-md" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-[40px] ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-[40px] ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-[80px] rounded-full" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 rounded-md ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : labelsData?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                      {t.labels.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  labelsData?.data.map((label) => (
                    <TableRow key={label.id} className="border-border/50 hover:bg-accent/30 cursor-pointer">
                      <TableCell>
                        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center border border-border overflow-hidden">
                          {label.logoUrl ? (
                            <img src={label.logoUrl} alt={label.name} className="h-full w-full object-cover" />
                          ) : (
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{label.name}</TableCell>
                      <TableCell className="text-muted-foreground">{label.country || 'N/A'}</TableCell>
                      <TableCell className="text-muted-foreground text-right">{label.totalArtists}</TableCell>
                      <TableCell className="text-muted-foreground text-right">{label.totalReleases}</TableCell>
                      <TableCell>
                        <StatusBadge status={label.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border">
                            <DropdownMenuLabel>{t.labels.actions}</DropdownMenuLabel>
                            <DropdownMenuItem>{t.labels.edit_label}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
  );
}
