import { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Search, Eye, ShieldCheck, Plus, Pencil, Trash2, LogIn,
  CheckCircle2, XCircle, Send, Filter, RotateCcw, AlertTriangle,
} from "lucide-react";
import { useLang } from "@/lib/i18n";

type AuditAction = "create" | "update" | "delete" | "login" | "approve" | "reject" | "deliver";

interface AuditRow {
  id: number;
  userId: number | null;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  diff: Array<{ field: string; old: unknown; new: unknown }> | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

interface Facets {
  entityTypes: string[];
  actions: string[];
  users: { id: number; name: string; email: string }[];
}

const ACTION_META: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  create:  { label: "Создание",   cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", icon: Plus },
  update:  { label: "Изменение",  cls: "bg-blue-500/10 text-blue-300 border-blue-500/30",          icon: Pencil },
  delete:  { label: "Удаление",   cls: "bg-rose-500/10 text-rose-300 border-rose-500/30",          icon: Trash2 },
  login:   { label: "Вход",       cls: "bg-violet-500/10 text-violet-300 border-violet-500/30",    icon: LogIn },
  approve: { label: "Одобрено",   cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  reject:  { label: "Отклонено",  cls: "bg-amber-500/10 text-amber-300 border-amber-500/30",       icon: XCircle },
  deliver: { label: "Доставлено", cls: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",          icon: Send },
};

// Финансовые сущности — для пресета фильтров «только финансы».
// Передаются на бэкенд через ?entity_types=... (CSV) → серверная фильтрация
// + корректный total в пагинации (без клиентского post-filter).
const FINANCE_ENTITY_TYPES = ["transaction", "payout", "ingestion", "ingestion_unmatched"];

const ENTITY_LABEL: Record<string, string> = {
  transaction: "Транзакция",
  payout: "Выплата",
  ingestion: "Импорт CSV",
  release: "Релиз",
  track: "Трек",
  artist: "Артист",
  label: "Лейбл",
  split: "Сплит",
  delivery: "Доставка",
  user: "Пользователь",
  signup_request: "Заявка",
  kyc_document: "KYC-документ",
  user_kyc: "KYC-статус",
  profile_bank: "Банк. реквизиты",
  profile_tax: "Налог. данные",
};

const PAGE_SIZE = 50;

// ─── value helpers ────────────────────────────────────────────────────────
function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
}

export default function AdminAudit() {
  const { toast } = useToast();
  const { t } = useLang();

  // ─── filters ────────────────────────────────────────────────────────────
  const [entityType, setEntityType] = useState<string>("");
  const [action, setAction]         = useState<string>("");
  const [userId, setUserId]         = useState<string>("");
  const [entityId, setEntityId]     = useState<string>("");
  const [from, setFrom]             = useState<string>("");
  const [to, setTo]                 = useState<string>("");
  const [financeOnly, setFinanceOnly] = useState<boolean>(false);

  // ─── data ───────────────────────────────────────────────────────────────
  const [rows, setRows]       = useState<AuditRow[] | null>(null);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [facets, setFacets]   = useState<Facets | null>(null);

  // ─── detail dialog ──────────────────────────────────────────────────────
  const [detail, setDetail] = useState<AuditRow | null>(null);

  // race protection: используем монотонный req-id, ответы на устаревшие запросы игнорируем
  const reqIdRef = useRef(0);

  async function loadFacets() {
    try {
      const r = await fetch("/api/audit/facets", { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as Facets;
      setFacets(j);
    } catch {
      setFacets({ entityTypes: [], actions: [], users: [] });
    }
  }

  async function load() {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    try {
      const u = new URL("/api/audit", window.location.origin);
      // entity_type (single) имеет приоритет; иначе financeOnly → CSV из FINANCE_ENTITY_TYPES.
      // Серверная фильтрация гарантирует корректную пагинацию (total отражает
      // реальное число подходящих записей, а не глобальный аудит-лог).
      if (entityType) {
        u.searchParams.set("entity_type", entityType);
      } else if (financeOnly) {
        u.searchParams.set("entity_types", FINANCE_ENTITY_TYPES.join(","));
      }
      if (action)        u.searchParams.set("action",      action);
      if (userId)        u.searchParams.set("user_id",     userId);
      if (entityId)      u.searchParams.set("entity_id",   entityId);
      if (from)          u.searchParams.set("from",        new Date(from).toISOString());
      if (to)            u.searchParams.set("to",          new Date(to).toISOString());
      u.searchParams.set("limit",  String(PAGE_SIZE));
      u.searchParams.set("offset", String((page - 1) * PAGE_SIZE));

      const r = await fetch(u.toString(), { credentials: "same-origin" });
      const j = await r.json();
      if (myReq !== reqIdRef.current) return; // устаревший ответ
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setRows(j.data ?? []);
      setTotal(j.pagination?.total ?? 0);
    } catch (err: any) {
      if (myReq !== reqIdRef.current) return;
      toast({ title: t.audit.title, description: err.message, variant: "destructive" });
      setRows([]);
      setTotal(0);
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }

  useEffect(() => { loadFacets(); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, entityType, action, userId, entityId, from, to, financeOnly]);

  function resetFilters() {
    setEntityType(""); setAction(""); setUserId(""); setEntityId("");
    setFrom(""); setTo(""); setFinanceOnly(false); setPage(1);
  }
  function applyFinancePreset() {
    setEntityType(""); setFinanceOnly(true); setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filteredCount = rows?.length ?? 0;

  // facet entity types — не показываем технические/внутренние
  const visibleEntityTypes = useMemo(() => {
    if (!facets) return [];
    return [...facets.entityTypes].sort((a, b) => (ENTITY_LABEL[a] ?? a).localeCompare(ENTITY_LABEL[b] ?? b, "ru"));
  }, [facets]);

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-blue-400" />
              {t.audit.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{t.audit.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={financeOnly ? "default" : "outline"}
              size="sm"
              onClick={() => (financeOnly ? resetFilters() : applyFinancePreset())}
              data-testid="button-finance-preset"
            >
              <Filter className="mr-2 h-4 w-4" />
              {financeOnly ? "Только финансы ✓" : "Только финансы"}
            </Button>
            <Button variant="outline" size="sm" onClick={resetFilters} data-testid="button-reset-filters">
              <RotateCcw className="mr-2 h-4 w-4" />
              {t.audit.reset}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.common.filter}</CardTitle>
            <CardDescription className="text-xs">
              {total}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.audit.filter_entity}</label>
                <Select value={entityType || "__all__"} onValueChange={(v) => { setEntityType(v === "__all__" ? "" : v); setPage(1); }}>
                  <SelectTrigger data-testid="select-entity-type"><SelectValue placeholder={t.audit.all} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t.audit.all}</SelectItem>
                    {visibleEntityTypes.map((et) => (
                      <SelectItem key={et} value={et}>{ENTITY_LABEL[et] ?? et}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.audit.filter_action}</label>
                <Select value={action || "__all__"} onValueChange={(v) => { setAction(v === "__all__" ? "" : v); setPage(1); }}>
                  <SelectTrigger data-testid="select-action"><SelectValue placeholder={t.audit.all} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t.audit.all}</SelectItem>
                    {(facets?.actions ?? []).map((a) => (
                      <SelectItem key={a} value={a}>{ACTION_META[a]?.label ?? a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.audit.filter_user}</label>
                <Select value={userId || "__all__"} onValueChange={(v) => { setUserId(v === "__all__" ? "" : v); setPage(1); }}>
                  <SelectTrigger data-testid="select-user"><SelectValue placeholder={t.audit.all} /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__all__">{t.audit.all}</SelectItem>
                    {(facets?.users ?? []).map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name} · {u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.audit.filter_id}</label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="number" inputMode="numeric" placeholder={t.audit.filter_id_placeholder}
                    value={entityId} onChange={(e) => { setEntityId(e.target.value); setPage(1); }}
                    className="pl-7" data-testid="input-entity-id"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.audit.filter_from}</label>
                <Input
                  type="datetime-local" value={from}
                  onChange={(e) => { setFrom(e.target.value); setPage(1); }}
                  data-testid="input-from"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t.audit.filter_to}</label>
                <Input
                  type="datetime-local" value={to}
                  onChange={(e) => { setTo(e.target.value); setPage(1); }}
                  data-testid="input-to"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading && rows === null ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows && rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mb-2" />
                <p className="text-sm">{t.audit.empty}</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-background/30">
                  <TableRow>
                    <TableHead className="w-[170px]">{t.audit.table.when}</TableHead>
                    <TableHead>{t.audit.table.who}</TableHead>
                    <TableHead className="w-[140px]">{t.audit.table.action}</TableHead>
                    <TableHead>{t.audit.table.entity}</TableHead>
                    <TableHead className="w-[120px]">{t.audit.table.ip}</TableHead>
                    <TableHead className="w-[80px] text-right">{t.audit.table.changes}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).map((r) => {
                    const meta = ACTION_META[r.action] ?? { label: r.action, cls: "bg-muted text-muted-foreground border-border", icon: Pencil };
                    const Icon = meta.icon;
                    return (
                      <TableRow key={r.id} data-testid={`row-audit-${r.id}`}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{fmtDate(r.createdAt)}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{r.userEmail ?? <span className="text-muted-foreground">—</span>}</div>
                          {r.userRole && <div className="text-xs text-muted-foreground">{r.userRole}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta.cls}>
                            <Icon className="h-3 w-3 mr-1" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{ENTITY_LABEL[r.entityType] ?? r.entityType}</div>
                          {r.entityId !== null && <div className="text-xs text-muted-foreground font-mono">#{r.entityId}</div>}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.ip ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => setDetail(r)}
                            data-testid={`button-detail-${r.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              {t.splits.page_of.replace("{p}", String(page)).replace("{t}", String(totalPages))} · {total}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="button-prev-page">
                {t.splits.previous}
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))} data-testid="button-next-page">
                {t.splits.next}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-400" />
                  Запись #{detail.id}
                </DialogTitle>
                <DialogDescription>
                  {fmtDate(detail.createdAt)} · {detail.userEmail ?? "—"} ({detail.userRole ?? "—"})
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Meta */}
                <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-md p-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Действие</div>
                    <div className="font-medium">{ACTION_META[detail.action]?.label ?? detail.action}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Объект</div>
                    <div className="font-medium">
                      {ENTITY_LABEL[detail.entityType] ?? detail.entityType}
                      {detail.entityId !== null && <span className="text-muted-foreground font-mono"> #{detail.entityId}</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">IP</div>
                    <div className="font-mono text-xs">{detail.ip ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Request ID</div>
                    <div className="font-mono text-xs">{detail.requestId ?? "—"}</div>
                  </div>
                </div>

                {/* Diff (если есть) */}
                {detail.diff && detail.diff.length > 0 ? (
                  <div>
                    <div className="text-sm font-semibold mb-2">{t.audit.table.changes}</div>
                    <div className="overflow-hidden rounded-md border border-border">
                      <Table>
                        <TableHeader className="bg-muted/30">
                          <TableRow>
                            <TableHead className="w-[180px]">{t.audit.table.changes}</TableHead>
                            <TableHead>{t.audit.before}</TableHead>
                            <TableHead>{t.audit.after}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.diff.map((d, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs">{d.field}</TableCell>
                              <TableCell className="font-mono text-xs text-rose-300 break-all max-w-[280px]">{fmtValue(d.old)}</TableCell>
                              <TableCell className="font-mono text-xs text-emerald-300 break-all max-w-[280px]">{fmtValue(d.new)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}

                {/* Before / After (raw snapshot) */}
                {(detail.before || detail.after) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-sm font-semibold mb-2 text-rose-300">{t.audit.before}</div>
                      <pre className="text-xs font-mono bg-rose-500/5 border border-rose-500/20 rounded-md p-3 overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
                        {detail.before ? JSON.stringify(detail.before, null, 2) : "—"}
                      </pre>
                    </div>
                    <div>
                      <div className="text-sm font-semibold mb-2 text-emerald-300">{t.audit.after}</div>
                      <pre className="text-xs font-mono bg-emerald-500/5 border border-emerald-500/20 rounded-md p-3 overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
                        {detail.after ? JSON.stringify(detail.after, null, 2) : "—"}
                      </pre>
                    </div>
                  </div>
                )}

                {!detail.before && !detail.after && (!detail.diff || detail.diff.length === 0) && (
                  <div className="text-sm text-muted-foreground italic">Эта запись не содержит снимка состояния (например, событие входа в систему).</div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
