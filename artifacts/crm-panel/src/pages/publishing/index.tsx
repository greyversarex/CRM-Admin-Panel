import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Plus, Filter, BookMarked, FileCheck2, Clock, AlertTriangle, DollarSign, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getPublishingKpis,
  getPublishingWorks,
  type PublishingWork,
  type WorkStatus,
} from "@/data/dashboard-extras";

const STATUS_CFG: Record<WorkStatus, { label: string; cls: string }> = {
  accepted: { label: "Accepted", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  pending:  { label: "Pending",  cls: "bg-amber-500/15  text-amber-300  border-amber-500/30" },
  conflict: { label: "Conflict", cls: "bg-rose-500/15   text-rose-300   border-rose-500/30" },
  rejected: { label: "Rejected", cls: "bg-white/[0.05]  text-white/60   border-white/10" },
};

const PRO_CFG: Record<string, string> = {
  ASCAP:   "bg-blue-500/15 text-blue-300 border-blue-500/25",
  BMI:     "bg-indigo-500/15 text-indigo-300 border-indigo-500/25",
  TheMLC:  "bg-violet-500/15 text-violet-300 border-violet-500/25",
  Sentric: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
  RAO:     "bg-red-500/15 text-red-300 border-red-500/25",
  PRS:     "bg-amber-500/15 text-amber-300 border-amber-500/25",
};

export default function Publishing() {
  const { user } = useAuth();
  const role = user?.role ?? "admin";

  const allWorks = getPublishingWorks(role);
  const kpis = getPublishingKpis(role);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkStatus>("all");
  const [proFilter, setProFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const perPage = 10;

  const filtered: PublishingWork[] = useMemo(() => {
    return allWorks.filter((w) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        w.title.toLowerCase().includes(q) ||
        w.artist.toLowerCase().includes(q) ||
        w.composer.toLowerCase().includes(q) ||
        w.isrc.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || w.status === statusFilter;
      const matchPro = proFilter === "all" || w.pros.includes(proFilter as PublishingWork["pros"][number]);
      return matchSearch && matchStatus && matchPro;
    });
  }, [allWorks, search, statusFilter, proFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const initials = (name: string) =>
    name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                <BookMarked className="h-5 w-5 text-cyan-300" />
              </span>
              Publishing Works
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Управление произведениями, регистрация в PRO и контроль роялти.
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Новое произведение
          </Button>
        </div>

        {/* KPI плитки */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiTile icon={BookMarked}    label="Всего работ"      value={kpis.totalWorks}            color="cyan" />
          <KpiTile icon={FileCheck2}    label="Зарегистрировано" value={kpis.registeredWorks}       color="emerald" />
          <KpiTile icon={Clock}         label="В обработке"      value={kpis.pendingRegistrations}  color="amber" />
          <KpiTile icon={AlertTriangle} label="Конфликты"        value={kpis.conflicts}             color="rose" />
          <KpiTile icon={DollarSign}    label="Роялти"           value={`$${kpis.publishingRoyalties.toLocaleString()}`} color="primary" />
        </div>

        {/* Таблица */}
        <Card className="card-surface border-border/60 overflow-hidden">
          {/* Тулбар */}
          <div className="p-3 border-b border-border/40 flex flex-wrap gap-2 items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по названию, артисту, ISRC..."
                  className="pl-8 w-[300px] bg-background/40"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>

              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1); }}>
                <SelectTrigger className="w-[150px] bg-background/40">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="conflict">Conflict</SelectItem>
                </SelectContent>
              </Select>

              <Select value={proFilter} onValueChange={(v) => { setProFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px] bg-background/40">
                  <SelectValue placeholder="PRO" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все PRO</SelectItem>
                  <SelectItem value="ASCAP">ASCAP</SelectItem>
                  <SelectItem value="BMI">BMI</SelectItem>
                  <SelectItem value="TheMLC">TheMLC</SelectItem>
                  <SelectItem value="Sentric">Sentric</SelectItem>
                  <SelectItem value="RAO">РАО</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" className="gap-1.5">
                <Filter className="h-3.5 w-3.5" /> Фильтры
              </Button>
            </div>

            <p className="text-[12px] text-muted-foreground">
              Найдено: <span className="font-bold text-white">{filtered.length}</span> из {allWorks.length}
            </p>
          </div>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Work Title</TableHead>
                  <TableHead>Artist</TableHead>
                  <TableHead>Composer</TableHead>
                  <TableHead>Lyricist</TableHead>
                  <TableHead>ISRC</TableHead>
                  <TableHead>PRO</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center h-32 text-muted-foreground">
                      Произведений не найдено.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((w) => (
                    <TableRow key={w.id} className="border-border/40 hover:bg-accent/15 cursor-pointer">
                      <TableCell>
                        <Avatar className="h-8 w-8 border border-border/40">
                          <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                            {initials(w.artist)}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{w.title}</TableCell>
                      <TableCell className="text-white/85 text-sm">{w.artist}</TableCell>
                      <TableCell className="text-white/65 text-sm">{w.composer}</TableCell>
                      <TableCell className="text-white/65 text-sm">{w.lyricist}</TableCell>
                      <TableCell className="font-mono text-[11px] text-white/55 tabular-nums">{w.isrc}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {w.pros.map((pro) => (
                            <Badge key={pro} variant="outline" className={`text-[9px] px-1.5 py-0 h-4 font-bold ${PRO_CFG[pro] ?? "bg-white/5 text-white/60 border-white/10"}`}>
                              {pro}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-white">
                        {w.share}%
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] font-bold ${STATUS_CFG[w.status].cls}`}>
                          {STATUS_CFG[w.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>

          {/* Пагинация */}
          {filtered.length > perPage && (
            <div className="p-3 border-t border-border/40 flex items-center justify-between">
              <p className="text-[12px] text-muted-foreground">
                Показано {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filtered.length)} из {filtered.length}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                  Назад
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={p === safePage ? "default" : "outline"}
                    className="w-8 h-8 p-0"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button variant="outline" size="sm" disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                  Далее
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}

function KpiTile({
  icon: Icon, label, value, color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: "cyan" | "emerald" | "amber" | "rose" | "primary";
}) {
  const cfg = {
    cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/25",    text: "text-cyan-300" },
    emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/25", text: "text-emerald-300" },
    amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/25",   text: "text-amber-300" },
    rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/25",    text: "text-rose-300" },
    primary: { bg: "bg-primary/10",     border: "border-primary/25",     text: "text-primary" },
  }[color];

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex items-center gap-3`}>
      <span className={`h-10 w-10 rounded-lg bg-black/30 border ${cfg.border} flex items-center justify-center`}>
        <Icon className={`h-5 w-5 ${cfg.text}`} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-white/55 truncate">{label}</p>
        <p className="text-[22px] font-bold tabular-nums leading-tight mt-0.5">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </div>
    </div>
  );
}
