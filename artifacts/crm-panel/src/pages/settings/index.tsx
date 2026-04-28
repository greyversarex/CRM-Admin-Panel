import { Layout } from "@/components/layout";
import { Fragment, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  FileCode2, ScrollText, Activity as ActivityIcon, Globe2,
  Copy, RefreshCcw, Download, CheckCircle2, AlertTriangle, Clock, Lock,
  PlugZap, Unplug, FlaskConical, Settings2,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { IntegrationConfigDialog } from "@/components/integration-config-dialog";

// ─── API helper ─────────────────────────────────────────────────────────────

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface IntegrationRow {
  id: number;
  code: string;
  name: string;
  category: string;
  authType: string;
  enabled: boolean;
  status: "connected" | "disconnected" | "error" | string;
  lastSyncAt: string | null;
  lastError: string | null;
  hasCredentials: boolean;
  config?: Record<string, unknown>;
  credentialFields?: { fieldKey: string; masked: string }[];
}

interface ActivityRow {
  id: number;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  entityType: string | null;
  entityId: number | null;
}

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

interface AuditFacets {
  entityTypes: string[];
  actions: string[];
  users: Array<{ id: number; name: string; email: string }>;
}

function severityFromActivity(type: string): "info" | "warn" | "error" {
  if (type.includes("fail") || type.includes("error") || type.includes("rejected")) return "error";
  if (type.includes("delete") || type.includes("suspend") || type.includes("warn") || type.includes("rotat")) return "warn";
  return "info";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useLang();
  // /settings — admin only (см. lib/permissions.ts). Все три вкладки
  // (Audit / Activity / Integrations) показываются вместе.
  const canViewAudit = user?.role === "admin" || user?.role === "manager";
  const canViewSettings = canViewAudit;

  // Live data
  const [integrations, setIntegrations] = useState<IntegrationRow[] | null>(null);
  const [intLoading, setIntLoading] = useState(true);
  const [intBusy, setIntBusy] = useState<string | null>(null);
  const [configRow, setConfigRow] = useState<IntegrationRow | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [actLoading, setActLoading] = useState(true);
  const [actFilter, setActFilter] = useState("");

  // Audit log (compliance journal — separate from activity_log)
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditFacets, setAuditFacets] = useState<AuditFacets | null>(null);
  const [auditEntityType, setAuditEntityType] = useState<string>("");
  const [auditAction, setAuditAction] = useState<string>("");
  const [auditUserId, setAuditUserId] = useState<string>("");
  const [auditFrom, setAuditFrom] = useState<string>(""); // YYYY-MM-DD из <input type="date">
  const [auditTo, setAuditTo] = useState<string>("");
  const [auditExpanded, setAuditExpanded] = useState<Set<number>>(new Set());

  const loadIntegrations = async () => {
    setIntLoading(true);
    try {
      const r = await api<{ data: IntegrationRow[] }>(`/api/integrations`);
      setIntegrations(r.data ?? []);
    } catch (e) {
      toast({ variant: "destructive", title: t.settings.error, description: e instanceof Error ? e.message : String(e) });
    } finally {
      setIntLoading(false);
    }
  };

  const loadActivity = async () => {
    setActLoading(true);
    try {
      const r = await api<ActivityRow[]>(`/api/dashboard/recent-activity`);
      setActivity(r);
    } catch (e) {
      toast({ variant: "destructive", title: t.settings.error, description: e instanceof Error ? e.message : String(e) });
    } finally {
      setActLoading(false);
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      if (auditEntityType) params.set("entity_type", auditEntityType);
      if (auditAction) params.set("action", auditAction);
      if (auditUserId) params.set("user_id", auditUserId);
      // Date inputs дают YYYY-MM-DD; конвертируем в ISO с границами суток в UTC.
      if (auditFrom) params.set("from", new Date(`${auditFrom}T00:00:00.000Z`).toISOString());
      if (auditTo) params.set("to", new Date(`${auditTo}T23:59:59.999Z`).toISOString());
      params.set("limit", "100");
      const r = await api<{ data: AuditRow[]; pagination: { total: number } }>(`/api/audit?${params.toString()}`);
      setAudit(r.data);
      setAuditTotal(r.pagination.total);
    } catch (e) {
      toast({ variant: "destructive", title: t.settings.error, description: e instanceof Error ? e.message : String(e) });
    } finally {
      setAuditLoading(false);
    }
  };

  const loadAuditFacets = async () => {
    try {
      const r = await api<AuditFacets>(`/api/audit/facets`);
      setAuditFacets(r);
    } catch {
      /* facets are optional — UI degrades gracefully to free input */
    }
  };

  useEffect(() => {
    if (!canViewAudit) return;
    loadIntegrations();
    loadActivity();
    loadAudit();
    loadAuditFacets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewAudit]);

  // Refetch audit when filters change
  useEffect(() => {
    if (!canViewAudit) return;
    loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditEntityType, auditAction, auditUserId, auditFrom, auditTo]);

  const toggleAuditRow = (id: number) => {
    setAuditExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const fmtVal = (v: unknown): string => {
    if (v === null || v === undefined) return "∅";
    if (typeof v === "string") return v.length > 80 ? v.slice(0, 77) + "…" : v;
    try { return JSON.stringify(v); } catch { return String(v); }
  };

  const toggleEnabled = async (row: IntegrationRow, enabled: boolean) => {
    setIntBusy(row.code);
    // optimistic
    setIntegrations((prev) => prev?.map((r) => r.code === row.code ? { ...r, enabled, status: enabled ? "connected" : "disconnected" } : r) ?? null);
    try {
      await api(`/api/integrations/${row.code}/enable`, { method: "POST", body: JSON.stringify({ enabled }) });
      toast({ title: enabled ? t.settings.integration_enabled : t.settings.integration_disabled, description: row.name });
    } catch (e) {
      toast({ variant: "destructive", title: t.settings.error, description: e instanceof Error ? e.message : String(e) });
      await loadIntegrations();
    } finally {
      setIntBusy(null);
    }
  };

  const testIntegration = async (row: IntegrationRow) => {
    setIntBusy(row.code);
    try {
      const r = await api<{ ok: boolean; message?: string }>(`/api/integrations/${row.code}/test`, { method: "POST" });
      toast({
        variant: r.ok ? "default" : "destructive",
        title: r.ok ? t.settings.connection_ok : t.settings.connection_fail,
        description: r.message ?? row.name,
      });
      await loadIntegrations();
    } catch (e) {
      toast({ variant: "destructive", title: t.settings.test_error, description: e instanceof Error ? e.message : String(e) });
    } finally {
      setIntBusy(null);
    }
  };

  // ─── Permission gate ──
  if (isLoading) {
    return <Layout><div className="p-6"><Skeleton className="h-32 w-full" /></div></Layout>;
  }
  if (!canViewSettings) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold">{t.settings.access_denied}</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            {t.settings.access_denied_subtitle}
          </p>
        </div>
      </Layout>
    );
  }

  const dspIntegrations = (integrations ?? []).filter((i) => i.category === "dsp" || i.category === "delivery");
  const filteredActivity = (activity ?? []).filter((a) => {
    if (!actFilter.trim()) return true;
    const q = actFilter.toLowerCase();
    return a.title.toLowerCase().includes(q)
      || a.description.toLowerCase().includes(q)
      || a.type.toLowerCase().includes(q);
  });

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)] shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            <h1 className="text-2xl font-bold tracking-tight">{t.settings.title}</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">{t.settings.subtitle}</p>
          </div>
        </div>

        <Tabs defaultValue="audit">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1 flex-wrap">
            <TabsTrigger value="audit" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <ScrollText className="h-3.5 w-3.5" aria-hidden="true" /> {t.settings.tab_audit}
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <ActivityIcon className="h-3.5 w-3.5" aria-hidden="true" /> {t.settings.tab_activity}
            </TabsTrigger>
            <TabsTrigger value="ddex" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" /> {t.settings.tab_integrations}
            </TabsTrigger>
          </TabsList>

          {/* ================= GENERAL ================= */}
          {/* ================= DDEX & DSP (live) ================= */}
          <TabsContent value="ddex" className="mt-4 space-y-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>{t.settings.ddex_card_title}</CardTitle>
                <CardDescription>{t.settings.ddex_card_desc}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="dpid" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">DDEX Party ID (DPID)</label>
                  <div className="flex gap-2">
                    <Input id="dpid" value="PA-DPIDA-2024053004-T" readOnly className="bg-background/50 font-mono text-sm" />
                    <Button variant="outline" size="icon" aria-label={t.settings.copy_dpid}
                      onClick={() => { navigator.clipboard?.writeText("PA-DPIDA-2024053004-T"); toast({ title: t.settings.copied }); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Issued by DDEX, registered 2024-05-30</p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="ern-version" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Default ERN Version</label>
                  <Input id="ern-version" value="ERN 4.3" readOnly className="bg-background/50 font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="isrc-pref" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ISRC Prefix</label>
                  <Input id="isrc-pref" value="TJ-MUS-26" readOnly className="bg-background/50 font-mono" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="upc-pref" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">UPC Prefix</label>
                  <Input id="upc-pref" value="888002" readOnly className="bg-background/50 font-mono" />
                </div>
              </CardContent>
            </Card>

            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t.settings.dsp_card_title}</CardTitle>
                  <CardDescription>{t.settings.dsp_card_desc.replace("{n}", String(dspIntegrations.length))}</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={loadIntegrations} disabled={intLoading} aria-label={t.settings.refresh}>
                  <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${intLoading ? "animate-spin" : ""}`} aria-hidden="true" /> {t.settings.refresh}
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {intLoading ? (
                  <div className="p-6"><Skeleton className="h-48 w-full" /></div>
                ) : dspIntegrations.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">{t.settings.no_integrations}</div>
                ) : (
                  <Table>
                    <TableHeader className="bg-background/30">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t.settings.table.dsp}</TableHead>
                        <TableHead>{t.settings.table.auth}</TableHead>
                        <TableHead>{t.settings.table.last_sync}</TableHead>
                        <TableHead>{t.settings.table.status}</TableHead>
                        <TableHead>{t.settings.table.enabled}</TableHead>
                        <TableHead className="text-right">{t.common.actions}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dspIntegrations.map((d) => {
                        const busy = intBusy === d.code;
                        return (
                          <TableRow key={d.id} className="hover:bg-accent/20">
                            <TableCell className="text-sm font-medium">
                              <div className="flex items-center gap-2">
                                <Globe2 className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />
                                <span>{d.name}</span>
                                <code className="text-[10px] text-muted-foreground/70 font-mono">{d.code}</code>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] font-mono uppercase">{d.authType}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{fmtDate(d.lastSyncAt)}</TableCell>
                            <TableCell>
                              {d.status === "connected" && <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20"><CheckCircle2 className="h-2.5 w-2.5 mr-1" aria-hidden="true" /> Connected</Badge>}
                              {d.status === "disconnected" && <Badge variant="outline" className="text-[10px] text-muted-foreground bg-muted/30 border-border/40"><Unplug className="h-2.5 w-2.5 mr-1" aria-hidden="true" /> Disconnected</Badge>}
                              {d.status === "error" && <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10 border-rose-500/20"><AlertTriangle className="h-2.5 w-2.5 mr-1" aria-hidden="true" /> Error</Badge>}
                              {d.lastError && <p className="text-[10px] text-rose-400 mt-0.5 max-w-[200px] truncate" title={d.lastError}>{d.lastError}</p>}
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={d.enabled}
                                disabled={busy}
                                onCheckedChange={(v) => toggleEnabled(d, v)}
                                aria-label={`${d.enabled ? t.settings.integration_disabled : t.settings.integration_enabled} ${d.name}`}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-7 text-xs"
                                  disabled={busy}
                                  onClick={() => setConfigRow(d)}
                                  aria-label={`Configure ${d.name}`}>
                                  <Settings2 className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Настроить
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs"
                                  disabled={busy}
                                  onClick={() => testIntegration(d)}
                                  aria-label={`${t.settings.test_connection} ${d.name}`}>
                                  <FlaskConical className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> {t.settings.test_connection}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <IntegrationConfigDialog
              integration={configRow}
              open={configRow !== null}
              onOpenChange={(v) => { if (!v) setConfigRow(null); }}
              onSaved={loadIntegrations}
            />
          </TabsContent>

          {/* ================= AUDIT LOGS (live, audit_log table) ================= */}
          <TabsContent value="audit" className="mt-4 space-y-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>{t.settings.audit_card_title}</CardTitle>
                  <CardDescription>
                    {t.settings.audit_card_desc} · {auditTotal}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadAudit} disabled={auditLoading} aria-label={t.settings.refresh}>
                  <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${auditLoading ? "animate-spin" : ""}`} aria-hidden="true" /> {t.settings.refresh}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
                  <div className="space-y-1">
                    <label htmlFor="audit-entity" className="text-xs text-muted-foreground uppercase tracking-wider">{t.audit.filter_entity}</label>
                    <select
                      id="audit-entity"
                      value={auditEntityType}
                      onChange={(e) => setAuditEntityType(e.target.value)}
                      className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border"
                    >
                      <option value="">{t.audit.all}</option>
                      {(auditFacets?.entityTypes ?? []).map((et) => (
                        <option key={et} value={et}>{et}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="audit-action" className="text-xs text-muted-foreground uppercase tracking-wider">{t.audit.filter_action}</label>
                    <select
                      id="audit-action"
                      value={auditAction}
                      onChange={(e) => setAuditAction(e.target.value)}
                      className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border"
                    >
                      <option value="">{t.audit.all}</option>
                      {(auditFacets?.actions ?? []).map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="audit-user" className="text-xs text-muted-foreground uppercase tracking-wider">{t.audit.filter_user}</label>
                    <select
                      id="audit-user"
                      value={auditUserId}
                      onChange={(e) => setAuditUserId(e.target.value)}
                      className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border"
                    >
                      <option value="">{t.audit.all}</option>
                      {(auditFacets?.users ?? []).map((u) => (
                        <option key={u.id} value={String(u.id)}>{u.name} ({u.email})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="audit-from" className="text-xs text-muted-foreground uppercase tracking-wider">{t.audit.filter_from}</label>
                    <input
                      id="audit-from"
                      type="date"
                      value={auditFrom}
                      max={auditTo || undefined}
                      onChange={(e) => setAuditFrom(e.target.value)}
                      className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="audit-to" className="text-xs text-muted-foreground uppercase tracking-wider">{t.audit.filter_to}</label>
                    <input
                      id="audit-to"
                      type="date"
                      value={auditTo}
                      min={auditFrom || undefined}
                      onChange={(e) => setAuditTo(e.target.value)}
                      className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border"
                    />
                  </div>
                </div>
                {(auditEntityType || auditAction || auditUserId || auditFrom || auditTo) && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAuditEntityType("");
                        setAuditAction("");
                        setAuditUserId("");
                        setAuditFrom("");
                        setAuditTo("");
                      }}
                    >
                      {t.settings.clear_filters}
                    </Button>
                  </div>
                )}

                {auditLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (audit?.length ?? 0) === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">{t.settings.log_empty}</div>
                ) : (
                  <div className="rounded-md border border-border/60 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-background/30">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-8"></TableHead>
                          <TableHead>{t.audit.table.when}</TableHead>
                          <TableHead>{t.audit.table.who}</TableHead>
                          <TableHead>{t.audit.table.action}</TableHead>
                          <TableHead>{t.audit.table.entity}</TableHead>
                          <TableHead>{t.audit.table.changes}</TableHead>
                          <TableHead>{t.audit.table.ip}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(audit ?? []).map((row) => {
                          const open = auditExpanded.has(row.id);
                          const diffCount = row.diff?.length ?? 0;
                          return (
                            <Fragment key={row.id}>
                              <TableRow className="hover:bg-accent/20 cursor-pointer" onClick={() => toggleAuditRow(row.id)}>
                                <TableCell className="text-xs text-muted-foreground">{open ? "▾" : "▸"}</TableCell>
                                <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">{fmtDate(row.createdAt)}</TableCell>
                                <TableCell className="text-xs">
                                  {row.userEmail ?? <span className="text-muted-foreground">—</span>}
                                  {row.userRole && <span className="ml-1 text-[10px] text-muted-foreground">({row.userRole})</span>}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px] font-mono">
                                    {row.action}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs font-mono">
                                  {row.entityType}
                                  {row.entityId !== null && <span className="text-muted-foreground">#{row.entityId}</span>}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {diffCount > 0
                                    ? <span className="text-primary">{diffCount}</span>
                                    : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-muted-foreground">{row.ip ?? "—"}</TableCell>
                              </TableRow>
                              {open && (
                                <TableRow key={`${row.id}-diff`} className="bg-background/30 hover:bg-background/30">
                                  <TableCell colSpan={7} className="p-4">
                                    {diffCount === 0 ? (
                                      <div className="text-xs text-muted-foreground">{t.settings.no_changes}</div>
                                    ) : (
                                      <div className="space-y-1.5">
                                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                                          Diff ({diffCount}):
                                        </div>
                                        <div className="grid gap-1.5">
                                          {row.diff!.map((d, i) => (
                                            <div key={i} className="grid grid-cols-[160px_1fr_1fr] gap-2 text-xs font-mono items-start">
                                              <div className="text-primary/80 truncate" title={d.field}>{d.field}</div>
                                              <div className="text-rose-300/90 bg-rose-500/5 px-2 py-1 rounded border border-rose-500/20 break-all">
                                                <span className="text-[10px] text-rose-400/60 mr-1">−</span>{fmtVal(d.old)}
                                              </div>
                                              <div className="text-emerald-300/90 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/20 break-all">
                                                <span className="text-[10px] text-emerald-400/60 mr-1">+</span>{fmtVal(d.new)}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                        {row.userAgent && (
                                          <div className="pt-2 mt-2 border-t border-border/40 text-[10px] text-muted-foreground font-mono break-all">
                                            UA: {row.userAgent}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ACTIVITY (dashboard feed) ================= */}
          <TabsContent value="activity" className="mt-4 space-y-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>{t.settings.activity_card_title}</CardTitle>
                  <CardDescription>{t.settings.activity_card_desc}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={actFilter}
                    onChange={(e) => setActFilter(e.target.value)}
                    placeholder={t.settings.filter_placeholder}
                    className="w-64 h-9 bg-background/50"
                    aria-label={t.settings.filter_placeholder}
                  />
                  <Button variant="outline" size="sm" onClick={loadActivity} disabled={actLoading} aria-label={t.settings.refresh}>
                    <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${actLoading ? "animate-spin" : ""}`} aria-hidden="true" /> {t.settings.refresh}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {actLoading ? (
                  <div className="p-6"><Skeleton className="h-32 w-full" /></div>
                ) : filteredActivity.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">{actFilter ? t.settings.no_records_filtered : t.settings.log_empty}</div>
                ) : (
                  <Table>
                    <TableHeader className="bg-background/30">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t.settings.activity_table.timestamp}</TableHead>
                        <TableHead>{t.settings.activity_table.type}</TableHead>
                        <TableHead>{t.settings.activity_table.title}</TableHead>
                        <TableHead>{t.settings.activity_table.severity}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredActivity.map((a) => {
                        const sev = severityFromActivity(a.type);
                        return (
                          <TableRow key={a.id} className="hover:bg-accent/20">
                            <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">{fmtDate(a.timestamp)}</TableCell>
                            <TableCell className="text-xs font-mono text-primary/80">{a.type}</TableCell>
                            <TableCell className="text-xs font-medium">{a.title}</TableCell>
                            <TableCell>
                              {sev === "info" && <Badge variant="outline" className="text-[10px] text-blue-400 bg-blue-500/10 border-blue-500/20">info</Badge>}
                              {sev === "warn" && <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10 border-amber-500/20">warn</Badge>}
                              {sev === "error" && <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10 border-rose-500/20">error</Badge>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// Suppress unused-import warning for icons used only in some branches
void PlugZap;
