import { Layout } from "@/components/layout";
import { useEffect, useState } from "react";
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
  Settings2, KeyRound, Network, FileCode2, ScrollText, Database, Globe2,
  Eye, EyeOff, Copy, Plus, RefreshCcw, Download, CheckCircle2, AlertTriangle, Clock, Lock,
  PlugZap, Unplug, FlaskConical,
} from "lucide-react";

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

// ─── Mock data (clearly labelled "Demo") ────────────────────────────────────

const API_KEYS = [
  { id: "key_1", name: "Production — DSP webhooks", key: "sk_live_a1b2…f9c4", scopes: ["releases:read", "releases:write", "deliveries:read"], created: "2025-09-12", lastUsed: "2026-04-11 14:32", env: "production" },
  { id: "key_2", name: "Staging — partner integration", key: "sk_test_77ee…b2a8", scopes: ["releases:read", "analytics:read"], created: "2026-01-04", lastUsed: "2026-04-09 11:18", env: "staging" },
  { id: "key_3", name: "Internal — Statement Generator", key: "sk_live_2240…dd91", scopes: ["transactions:read", "balances:read", "statements:write"], created: "2025-11-22", lastUsed: "2026-04-01 00:02", env: "production" },
];

const BACKUPS = [
  { id: "BAK-2026-04-11", date: "2026-04-11 03:00", size: "2.41 GB", target: "S3 / eu-central-1", duration: "4m 12s", status: "success" },
  { id: "BAK-2026-04-10", date: "2026-04-10 03:00", size: "2.39 GB", target: "S3 / eu-central-1", duration: "4m 03s", status: "success" },
  { id: "BAK-2026-04-09", date: "2026-04-09 03:00", size: "2.38 GB", target: "S3 / eu-central-1", duration: "4m 18s", status: "success" },
  { id: "BAK-2026-04-08", date: "2026-04-08 03:00", size: "2.36 GB", target: "S3 / eu-central-1", duration: "4m 02s", status: "success" },
];

function severityFromActivity(type: string): "info" | "warn" | "error" {
  if (type.includes("fail") || type.includes("error") || type.includes("rejected")) return "error";
  if (type.includes("delete") || type.includes("suspend") || type.includes("warn") || type.includes("rotat")) return "warn";
  return "info";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

const DemoBadge = () => (
  <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-amber-500/30 text-amber-400 bg-amber-500/8 px-2 py-0.5">
    Demo data
  </Badge>
);

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  // Static settings state (no backend wiring — visual only)
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("Tajik Music Distribution");
  const [partyId] = useState("PA-DPIDA-2024053004-T");
  const [defaultLang, setDefaultLang] = useState("ru");
  const [twoFA, setTwoFA] = useState(true);
  const [autoBackup, setAutoBackup] = useState(true);

  // Live data
  const [integrations, setIntegrations] = useState<IntegrationRow[] | null>(null);
  const [intLoading, setIntLoading] = useState(true);
  const [intBusy, setIntBusy] = useState<string | null>(null);
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
  const [auditExpanded, setAuditExpanded] = useState<Set<number>>(new Set());

  const loadIntegrations = async () => {
    setIntLoading(true);
    try {
      const r = await api<{ data: IntegrationRow[] }>(`/api/integrations`);
      setIntegrations(r.data ?? []);
    } catch (e) {
      toast({ variant: "destructive", title: "Не удалось загрузить интеграции", description: e instanceof Error ? e.message : String(e) });
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
      toast({ variant: "destructive", title: "Не удалось загрузить журнал", description: e instanceof Error ? e.message : String(e) });
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
      params.set("limit", "100");
      const r = await api<{ data: AuditRow[]; pagination: { total: number } }>(`/api/audit?${params.toString()}`);
      setAudit(r.data);
      setAuditTotal(r.pagination.total);
    } catch (e) {
      toast({ variant: "destructive", title: "Не удалось загрузить аудит-лог", description: e instanceof Error ? e.message : String(e) });
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
    if (!isAdmin) return;
    loadIntegrations();
    loadActivity();
    loadAudit();
    loadAuditFacets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Refetch audit when filters change
  useEffect(() => {
    if (!isAdmin) return;
    loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditEntityType, auditAction, auditUserId]);

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
      toast({ title: enabled ? "Интеграция включена" : "Интеграция отключена", description: row.name });
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: e instanceof Error ? e.message : String(e) });
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
        title: r.ok ? "Подключение успешно" : "Подключение не удалось",
        description: r.message ?? row.name,
      });
      await loadIntegrations();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка теста", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setIntBusy(null);
    }
  };

  // ─── Permission gate ──
  if (isLoading) {
    return <Layout><div className="p-6"><Skeleton className="h-32 w-full" /></div></Layout>;
  }
  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold">Доступ ограничен</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Системные настройки доступны только администраторам.
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
            <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Конфигурация платформы, API, DDEX/DSP, безопасность, бэкапы.</p>
          </div>
        </div>

        <Tabs defaultValue="general">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1 flex-wrap">
            <TabsTrigger value="general" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> General
            </TabsTrigger>
            <TabsTrigger value="api" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> API Keys
            </TabsTrigger>
            <TabsTrigger value="ddex" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" /> DDEX & DSP
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Network className="h-3.5 w-3.5" aria-hidden="true" /> Security
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <ScrollText className="h-3.5 w-3.5" aria-hidden="true" /> Audit Logs
            </TabsTrigger>
            <TabsTrigger value="backup" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Database className="h-3.5 w-3.5" aria-hidden="true" /> Backup & Restore
            </TabsTrigger>
          </TabsList>

          {/* ================= GENERAL ================= */}
          <TabsContent value="general" className="mt-4 grid gap-4 md:grid-cols-2">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Organization</CardTitle>
                    <CardDescription>Базовая информация о компании-дистрибьюторе</CardDescription>
                  </div>
                  <DemoBadge />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="org-name" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Organization Name</label>
                  <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="org-country" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Country</label>
                  <Input id="org-country" defaultValue="Tajikistan (TJ)" className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="org-lang" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Default Language</label>
                  <select id="org-lang" value={defaultLang} onChange={(e) => setDefaultLang(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border">
                    <option value="ru">Русский</option>
                    <option value="tg">Тоҷикӣ</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <Button size="sm" disabled title="Демо: сохранение не подключено">Save Changes</Button>
              </CardContent>
            </Card>

            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Branding</CardTitle>
                    <CardDescription>Логотип, акцентный цвет, темы</CardDescription>
                  </div>
                  <DemoBadge />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-background/40 border border-border/40">
                  <img src="/tajikmusic-logo.png" className="h-10 w-auto" alt="Логотип Tajik Music Distribution" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">tajikmusic-logo.png</p>
                    <p className="text-xs text-muted-foreground">Uploaded 2025-09-01</p>
                  </div>
                  <Button variant="outline" size="sm" disabled>Replace</Button>
                </div>
                <div className="space-y-2">
                  <label htmlFor="primary-color" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Primary Color (Electric Indigo)</label>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-md border border-border" style={{ background: "hsl(226 84% 67%)" }} aria-hidden="true" />
                    <Input id="primary-color" defaultValue="#6366F1" className="bg-background/50 font-mono text-xs" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Dark Mode (default)</p>
                    <p className="text-xs text-muted-foreground">Force dark theme for all users</p>
                  </div>
                  <Switch defaultChecked aria-label="Force dark theme" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= API KEYS (demo) ================= */}
          <TabsContent value="api" className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>API Keys</CardTitle>
                    <DemoBadge />
                  </div>
                  <CardDescription>Демо. Таблица api_keys ещё не реализована — генерация и ротация не подключены к БД.</CardDescription>
                </div>
                <Button size="sm" disabled title="Демо">
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Generate Key
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Name</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Env</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {API_KEYS.map((k) => (
                      <TableRow key={k.id} className="hover:bg-accent/20">
                        <TableCell className="text-sm font-medium">{k.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-background/60 px-2 py-1 rounded font-mono">
                              {revealKey === k.id ? k.key.replace("…", "abcdef1234") : k.key}
                            </code>
                            <Button variant="ghost" size="icon" className="h-6 w-6"
                              onClick={() => setRevealKey(revealKey === k.id ? null : k.id)}
                              aria-label={revealKey === k.id ? "Скрыть ключ" : "Показать ключ"}>
                              {revealKey === k.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Копировать ключ" disabled><Copy className="h-3 w-3" /></Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {k.scopes.map((s) => (
                              <Badge key={s} variant="outline" className="text-[10px] font-mono">{s}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] uppercase ${k.env === "production" ? "text-rose-400 bg-rose-500/10 border-rose-500/30" : "text-amber-400 bg-amber-500/10 border-amber-500/30"}`}>
                            {k.env}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{k.lastUsed}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Rotate" disabled aria-label="Rotate key"><RefreshCcw className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-400 hover:bg-rose-500/10" disabled>Revoke</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= DDEX & DSP (live) ================= */}
          <TabsContent value="ddex" className="mt-4 space-y-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>DDEX Party Identification</CardTitle>
                <CardDescription>Уникальный идентификатор лейбла для всех XML-доставок</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="dpid" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">DDEX Party ID (DPID)</label>
                  <div className="flex gap-2">
                    <Input id="dpid" value={partyId} readOnly className="bg-background/50 font-mono text-sm" />
                    <Button variant="outline" size="icon" aria-label="Копировать DPID"
                      onClick={() => { navigator.clipboard?.writeText(partyId); toast({ title: "Скопировано" }); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Issued by DDEX, registered 2024-05-30</p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="ern-version" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Default ERN Version</label>
                  <select id="ern-version" className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border" defaultValue="4.3">
                    <option value="4.3">ERN 4.3 (recommended)</option>
                    <option value="4.2">ERN 4.2</option>
                    <option value="4.1">ERN 4.1</option>
                    <option value="3.8.2">ERN 3.8.2 (legacy)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="isrc-pref" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ISRC Prefix</label>
                  <Input id="isrc-pref" defaultValue="TJ-MUS-26" className="bg-background/50 font-mono" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="upc-pref" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">UPC Prefix</label>
                  <Input id="upc-pref" defaultValue="888002" className="bg-background/50 font-mono" />
                </div>
              </CardContent>
            </Card>

            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>DSP Connections</CardTitle>
                  <CardDescription>Реальные интеграции из БД ({dspIntegrations.length} платформ). Включай/выключай и тестируй подключение.</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={loadIntegrations} disabled={intLoading} aria-label="Обновить список">
                  <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${intLoading ? "animate-spin" : ""}`} aria-hidden="true" /> Обновить
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {intLoading ? (
                  <div className="p-6"><Skeleton className="h-48 w-full" /></div>
                ) : dspIntegrations.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">Нет интеграций</div>
                ) : (
                  <Table>
                    <TableHeader className="bg-background/30">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>DSP</TableHead>
                        <TableHead>Auth</TableHead>
                        <TableHead>Last Sync</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Enabled</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
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
                                aria-label={`${d.enabled ? "Отключить" : "Включить"} ${d.name}`}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="h-7 text-xs"
                                disabled={busy}
                                onClick={() => testIntegration(d)}
                                aria-label={`Тест подключения ${d.name}`}>
                                <FlaskConical className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Test
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
          </TabsContent>

          {/* ================= SECURITY (demo) ================= */}
          <TabsContent value="security" className="mt-4 grid gap-4 md:grid-cols-2">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Two-Factor Authentication</CardTitle>
                    <CardDescription>Обязательно для admin/manager ролей</CardDescription>
                  </div>
                  <DemoBadge />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Require 2FA for admins</p>
                    <p className="text-xs text-muted-foreground">All admin accounts must enroll TOTP</p>
                  </div>
                  <Switch checked={twoFA} onCheckedChange={setTwoFA} aria-label="Require 2FA" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Session timeout</p>
                    <p className="text-xs text-muted-foreground">Auto-logout after inactivity</p>
                  </div>
                  <select className="h-8 px-2 text-xs rounded-md bg-background/50 border border-border" defaultValue="60" aria-label="Session timeout">
                    <option value="30">30 min</option>
                    <option value="60">60 min</option>
                    <option value="240">4 hours</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Password rotation</p>
                    <p className="text-xs text-muted-foreground">Force change every 90 days</p>
                  </div>
                  <Switch defaultChecked aria-label="Password rotation" />
                </div>
              </CardContent>
            </Card>

            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>IP Allow / Deny List</CardTitle>
                    <CardDescription>Доступ к Admin Panel из определённых сетей</CardDescription>
                  </div>
                  <DemoBadge />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <label htmlFor="allowed-ips" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Allowed IPs / CIDR</label>
                  <Input id="allowed-ips" defaultValue="188.92.0.0/16, 5.182.42.0/24" className="bg-background/50 font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Block Tor / VPN</span>
                  <div className="flex items-center justify-between p-2 rounded-md bg-background/40 border border-border/40">
                    <span className="text-xs text-muted-foreground">Auto-block Tor exit nodes</span>
                    <Switch defaultChecked aria-label="Auto-block Tor exit nodes" />
                  </div>
                </div>
                <Button size="sm" variant="outline" className="w-full" disabled>Save Network Rules</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= AUDIT LOGS (live, audit_log table) ================= */}
          <TabsContent value="audit" className="mt-4 space-y-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Audit Log</CardTitle>
                  <CardDescription>
                    Структурированный журнал изменений с before / after diff. Всего записей: {auditTotal}.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadAudit} disabled={auditLoading} aria-label="Обновить аудит-лог">
                  <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${auditLoading ? "animate-spin" : ""}`} aria-hidden="true" /> Обновить
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <label htmlFor="audit-entity" className="text-xs text-muted-foreground uppercase tracking-wider">Сущность</label>
                    <select
                      id="audit-entity"
                      value={auditEntityType}
                      onChange={(e) => setAuditEntityType(e.target.value)}
                      className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border"
                    >
                      <option value="">Все</option>
                      {(auditFacets?.entityTypes ?? []).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="audit-action" className="text-xs text-muted-foreground uppercase tracking-wider">Действие</label>
                    <select
                      id="audit-action"
                      value={auditAction}
                      onChange={(e) => setAuditAction(e.target.value)}
                      className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border"
                    >
                      <option value="">Все</option>
                      {(auditFacets?.actions ?? []).map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="audit-user" className="text-xs text-muted-foreground uppercase tracking-wider">Пользователь</label>
                    <select
                      id="audit-user"
                      value={auditUserId}
                      onChange={(e) => setAuditUserId(e.target.value)}
                      className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border"
                    >
                      <option value="">Все</option>
                      {(auditFacets?.users ?? []).map((u) => (
                        <option key={u.id} value={String(u.id)}>{u.name} ({u.email})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {auditLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (audit?.length ?? 0) === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">Журнал пуст</div>
                ) : (
                  <div className="rounded-md border border-border/60 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-background/30">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Когда</TableHead>
                          <TableHead>Кто</TableHead>
                          <TableHead>Действие</TableHead>
                          <TableHead>Сущность</TableHead>
                          <TableHead>Изменения</TableHead>
                          <TableHead>IP</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(audit ?? []).map((row) => {
                          const open = auditExpanded.has(row.id);
                          const diffCount = row.diff?.length ?? 0;
                          return (
                            <>
                              <TableRow key={row.id} className="hover:bg-accent/20 cursor-pointer" onClick={() => toggleAuditRow(row.id)}>
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
                                    ? <span className="text-primary">{diffCount} {diffCount === 1 ? "поле" : "полей"}</span>
                                    : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-muted-foreground">{row.ip ?? "—"}</TableCell>
                              </TableRow>
                              {open && (
                                <TableRow key={`${row.id}-diff`} className="bg-background/30 hover:bg-background/30">
                                  <TableCell colSpan={7} className="p-4">
                                    {diffCount === 0 ? (
                                      <div className="text-xs text-muted-foreground">Нет полей с изменениями</div>
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
                            </>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity log (legacy / dashboard feed) — keep available below */}
            <Card className="card-surface no-lift border-border/60">
              <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="text-base">Activity feed (для дашборда)</CardTitle>
                  <CardDescription>Человекочитаемые события для виджета «Recent activity»</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={actFilter}
                    onChange={(e) => setActFilter(e.target.value)}
                    placeholder="Фильтр..."
                    className="w-64 h-9 bg-background/50"
                    aria-label="Фильтр activity"
                  />
                  <Button variant="outline" size="sm" onClick={loadActivity} disabled={actLoading} aria-label="Обновить activity">
                    <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${actLoading ? "animate-spin" : ""}`} aria-hidden="true" /> Обновить
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {actLoading ? (
                  <div className="p-6"><Skeleton className="h-32 w-full" /></div>
                ) : filteredActivity.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">{actFilter ? "Нет записей по фильтру" : "Журнал пуст"}</div>
                ) : (
                  <Table>
                    <TableHeader className="bg-background/30">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Severity</TableHead>
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

          {/* ================= BACKUP (demo) ================= */}
          <TabsContent value="backup" className="mt-4 space-y-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Automatic Backups</CardTitle>
                    <CardDescription>Демо. Конфигурация бэкапов БД ещё не подключена.</CardDescription>
                  </div>
                  <DemoBadge />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label htmlFor="bkp-schedule" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Schedule</label>
                    <select id="bkp-schedule" className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border" defaultValue="03:00">
                      <option value="01:00">Daily at 01:00 UTC</option>
                      <option value="03:00">Daily at 03:00 UTC</option>
                      <option value="06:00">Daily at 06:00 UTC</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="bkp-retention" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Retention</label>
                    <select id="bkp-retention" className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border" defaultValue="30">
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="365">365 days</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="bkp-target" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Storage Target</label>
                    <Input id="bkp-target" defaultValue="s3://tajik-music-backups/eu-central-1" className="bg-background/50 font-mono text-xs" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md bg-background/40 border border-border/40">
                  <div>
                    <p className="text-sm font-medium">Auto-backup enabled</p>
                    <p className="text-xs text-muted-foreground">Next run: 2026-04-12 03:00 UTC</p>
                  </div>
                  <Switch checked={autoBackup} onCheckedChange={setAutoBackup} aria-label="Auto-backup" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled>Run Backup Now</Button>
                  <Button size="sm" variant="outline" disabled>Save Schedule</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Backup History</CardTitle>
                    <CardDescription>Последние снапшоты и точки восстановления</CardDescription>
                  </div>
                  <DemoBadge />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-background/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead>ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {BACKUPS.map((b) => (
                      <TableRow key={b.id} className="hover:bg-accent/20">
                        <TableCell className="font-mono text-xs">{b.id}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{b.date}</TableCell>
                        <TableCell className="text-sm tabular-nums">{b.size}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{b.target}</TableCell>
                        <TableCell className="text-xs text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" aria-hidden="true" />{b.duration}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-1" aria-hidden="true" /> {b.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" disabled>Restore</Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled aria-label="Download"><Download className="h-3.5 w-3.5" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
