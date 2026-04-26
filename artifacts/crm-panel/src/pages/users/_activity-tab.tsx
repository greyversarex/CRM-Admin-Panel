import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useListUsers } from "@workspace/api-client-react";
import { api } from "./_api";
import { toast } from "@/hooks/use-toast";

type AuditRow = {
  id: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

const PAGE = 25;

export function ActivityTab() {
  const [userId, setUserId] = useState<string>("all");
  const [entityType, setEntityType] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<AuditRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState<{ entityTypes: string[] } | null>(null);

  // Список пользователей для фильтра — переиспользуем тот же hook
  const { data: usersResp } = useListUsers({ limit: 200 } as any);
  const userOptions = useMemo(() => usersResp?.data ?? [], [usersResp]);

  useEffect(() => {
    api<{ entityTypes: string[]; actions: string[] }>("/api/audit/facets")
      .then((f) => setFacets({ entityTypes: f.entityTypes ?? [] }))
      .catch((e) => {
        toast({ variant: "destructive", title: "Не удалось загрузить фильтры", description: e?.message });
        setFacets({ entityTypes: [] });
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("limit", String(PAGE));
    qs.set("offset", String(offset));
    if (userId !== "all") qs.set("user_id", userId);
    if (entityType !== "all") qs.set("entity_type", entityType);

    api<{ data: AuditRow[]; pagination: { total: number } }>(`/api/audit?${qs.toString()}`)
      .then((r) => { setData(r.data); setTotal(r.pagination.total); })
      .catch((e) => {
        toast({ variant: "destructive", title: "Не удалось загрузить лог", description: e.message });
        setData([]); setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [userId, entityType, offset]);

  function actionBadge(a: string) {
    const colorMap: Record<string, string> = {
      create: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      update: "text-blue-400 bg-blue-500/10 border-blue-500/20",
      delete: "text-rose-400 bg-rose-500/10 border-rose-500/20",
      approve: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      reject: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    };
    const cls = colorMap[a.toLowerCase()] ?? "text-muted-foreground";
    return <Badge variant="outline" className={`text-[10px] ${cls}`}>{a}</Badge>;
  }

  return (
    <Card className="card-surface no-lift border-border/60">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Activity Log</CardTitle>
            <CardDescription>Аудит действий администраторов и менеджеров.</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label="Filter by user"
              className="h-9 px-3 text-xs rounded-md bg-background/50 border border-border"
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setOffset(0); }}
            >
              <option value="all">Все пользователи</option>
              {userOptions.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.name} ({u.email})</option>
              ))}
            </select>
            <select
              aria-label="Filter by entity type"
              className="h-9 px-3 text-xs rounded-md bg-background/50 border border-border"
              value={entityType}
              onChange={(e) => { setEntityType(e.target.value); setOffset(0); }}
            >
              <option value="all">Все объекты</option>
              {facets?.entityTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-background/30">
            <TableRow className="hover:bg-transparent">
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={`sk-${i}`}><TableCell colSpan={5}><Skeleton className="h-7 w-full" /></TableCell></TableRow>
            ))}
            {!loading && (data?.length ?? 0) === 0 && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                Нет записей под эти фильтры.
              </TableCell></TableRow>
            )}
            {!loading && data?.map((row) => (
              <TableRow key={row.id} className="hover:bg-accent/20" data-testid={`row-audit-${row.id}`}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(row.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <div className="text-sm">{row.userName ?? "system"}</div>
                  {row.userEmail && <div className="text-[11px] text-muted-foreground">{row.userEmail}</div>}
                </TableCell>
                <TableCell>{actionBadge(row.action)}</TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{row.entityType}</span>
                  {row.entityId && <span className="text-xs font-mono ml-1">#{row.entityId}</span>}
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{row.ip ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <div className="flex items-center justify-between p-3 border-t border-border/50">
        <span className="text-xs text-muted-foreground">
          {total > 0 ? `${offset + 1}–${Math.min(offset + PAGE, total)} из ${total}` : "—"}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
        </div>
      </div>
    </Card>
  );
}
