import { Layout } from "@/components/layout";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Users2, Search, Plus, Phone, Mail, MessageSquare, CheckSquare, Filter, X,
  Pencil, Trash2, Loader2, BarChart2, TrendingUp, Layers, ArrowRight,
  Music2, Mic2, Disc3, DollarSign, Send, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import { useLocation, useSearch } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

type ContactType = "artist" | "author" | "label" | "manager" | "partner";

interface Contact {
  id: number;
  name: string;
  type: ContactType;
  email: string | null;
  phone: string | null;
  company: string | null;
  country: string | null;
  notes: string | null;
  telegram: string | null;
  whatsapp: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
type TaskPriority = "low" | "medium" | "high" | "urgent";

interface CrmTask {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedToId: number | null;
  assignedToName: string | null;
  dueDate: string | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface UserLite {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const CONTACT_TYPE_KEYS = ["artist", "author", "label", "manager", "partner"] as const;

function priorityClass(p: TaskPriority) {
  if (p === "urgent") return "text-rose-400 bg-rose-500/15 border-rose-500/30";
  if (p === "high")   return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  if (p === "medium") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-muted-foreground bg-muted/40";
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// ─── Analytics types ────────────────────────────────────────────────────────

type OverviewData = {
  tracks: number; artists: number; releases: number; users: number;
  revenue: number; sentDeliveries: number; pendingDeliveries: number;
  releasesByStatus: { status: string; cnt: number }[];
  contactsByType: { type: string; cnt: number }[];
};
type UserActivityRow = { id: number; name: string; role: string; createdAt: string; totalTasks: number; doneTasks: number };
type RevenueRow = { id: number; name: string; royalty: number; advance: number; payout: number; net: number };
type GrowthRow = { month: string; artists: number; releases: number; users: number };
type FunnelData = {
  releaseFunnel: { stage: string; key: string; value: number }[];
  deliveryFunnel: { stage: string; key: string; value: number }[];
  taskFunnel: { stage: string; key: string; value: number }[];
};

// ─── Analytics component ─────────────────────────────────────────────────────

const PIE_COLORS = ["#6366f1", "#22d3ee", "#a78bfa", "#34d399", "#f59e0b", "#f87171"];

const STATUS_RU: Record<string, string> = {
  draft: "Черновик", pending_review: "На проверке", approved: "Одобрен",
  delivering: "Доставляется", live: "На площадках", rejected: "Отклонён",
};
const ROLE_RU: Record<string, string> = { admin: "Админ", manager: "Менеджер", label: "Лейбл", artist: "Артист" };

function fmt(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(1)}K`
    : String(n);
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function KpiTile({ icon: Icon, label, value, color }: { icon: React.FC<{ className?: string }>; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color.replace("text-", "bg-").replace("400", "500/15").replace("500", "500/15")}`}>
        <Icon className={`h-4.5 w-4.5 ${color}`} />
      </div>
      <div>
        <div className="text-xl font-bold leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function FunnelBar({ items, colorFrom, colorTo }: { items: { stage: string; value: number }[]; colorFrom: string; colorTo: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const pct = Math.round((item.value / max) * 100);
        const opacity = 1 - idx * 0.15;
        return (
          <div key={item.stage} className="flex items-center gap-3">
            <div className="w-28 text-xs text-muted-foreground text-right shrink-0">{item.stage}</div>
            <div className="flex-1 flex items-center gap-2">
              <div className="h-6 rounded flex-1 bg-muted/20 overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${colorFrom}`}
                  style={{ width: `${pct}%`, opacity }}
                />
              </div>
              <span className="text-xs font-mono w-6 text-right">{item.value}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function useAnalyticsFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    fetch(url, { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { if (alive) setData(d as T); })
      .catch((e) => { if (alive) setError(e?.message ?? "Ошибка загрузки"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [url]);
  return { data, loading, error };
}

function AnalyticsLoader() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />Загрузка аналитики…
    </div>
  );
}

function AnalyticsEmpty({ msg = "Нет данных" }: { msg?: string }) {
  return <div className="text-center py-20 text-muted-foreground text-sm">{msg}</div>;
}

// ─── Tab 1: Overview ────────────────────────────────────────────────────────

function CrmOverviewPanel() {
  const { data, loading } = useAnalyticsFetch<OverviewData>("/api/crm/analytics/overview");
  if (loading) return <AnalyticsLoader />;
  if (!data) return <AnalyticsEmpty />;

  const releasePieData = data.releasesByStatus.map((r) => ({ name: STATUS_RU[r.status] ?? r.status, value: r.cnt }));
  const contactPieData = data.contactsByType.map((r) => ({ name: ROLE_RU[r.type] ?? r.type, value: r.cnt }));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Обзор бизнеса</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile icon={Music2}     label="Треков"               value={fmt(data.tracks)}            color="text-violet-400" />
          <KpiTile icon={Mic2}       label="Артистов"             value={fmt(data.artists)}           color="text-cyan-400" />
          <KpiTile icon={Disc3}      label="Релизов"              value={fmt(data.releases)}          color="text-indigo-400" />
          <KpiTile icon={Users2}     label="Пользователей"        value={fmt(data.users)}             color="text-emerald-400" />
          <KpiTile icon={DollarSign} label="Выручка (роялти)"     value={fmtMoney(data.revenue)}      color="text-green-400" />
          <KpiTile icon={Send}       label="Доставок отправлено"  value={fmt(data.sentDeliveries)}    color="text-blue-400" />
          <KpiTile icon={Clock}      label="Доставок в очереди"   value={fmt(data.pendingDeliveries)} color="text-amber-400" />
          <KpiTile icon={CheckSquare} label="Релизов всего"       value={fmt(data.releases)}          color="text-rose-400" />
        </div>
      </div>

      {(releasePieData.length > 0 || contactPieData.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {releasePieData.length > 0 && (
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Релизы по статусу</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={releasePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                      {releasePieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid #30304a", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          {contactPieData.length > 0 && (
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Контакты по типу</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={contactPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                      {contactPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid #30304a", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: User Activity ───────────────────────────────────────────────────

function CrmActivityPanel() {
  const { data, loading } = useAnalyticsFetch<UserActivityRow[]>("/api/crm/analytics/user-activity");
  if (loading) return <AnalyticsLoader />;
  if (!data || data.length === 0) return <AnalyticsEmpty />;
  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Users2 className="h-4 w-4 text-cyan-400" />Активность пользователей</CardTitle>
        <CardDescription className="text-xs">Задачи назначены / завершены по каждому участнику команды</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border/40">
              <th className="text-left pb-2 font-medium">Пользователь</th>
              <th className="text-left pb-2 font-medium">Роль</th>
              <th className="text-right pb-2 font-medium">Всего задач</th>
              <th className="text-right pb-2 font-medium">Завершено</th>
              <th className="text-right pb-2 font-medium">% выполнения</th>
            </tr>
          </thead>
          <tbody>
            {data.map((u) => {
              const pct = u.totalTasks > 0 ? Math.round((u.doneTasks / u.totalTasks) * 100) : 0;
              return (
                <tr key={u.id} className="border-b border-border/20 hover:bg-muted/10">
                  <td className="py-1.5 font-medium">{u.name}</td>
                  <td className="py-1.5"><Badge variant="outline" className="text-[10px]">{ROLE_RU[u.role] ?? u.role}</Badge></td>
                  <td className="py-1.5 text-right">{u.totalTasks}</td>
                  <td className="py-1.5 text-right text-emerald-400">{u.doneTasks}</td>
                  <td className="py-1.5 text-right">
                    <span className={pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-muted-foreground"}>{pct}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─── Tab 3: ARPU (revenue per artist) ───────────────────────────────────────

function CrmArpuPanel() {
  const { data, loading } = useAnalyticsFetch<RevenueRow[]>("/api/crm/analytics/revenue-per-user");
  if (loading) return <AnalyticsLoader />;
  if (!data || data.length === 0) return <AnalyticsEmpty />;

  const totalRoyalty = data.reduce((s, r) => s + r.royalty, 0);
  const totalPayout  = data.reduce((s, r) => s + r.payout, 0);
  const arpu = data.length > 0 ? totalRoyalty / data.length : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiTile icon={DollarSign} label="Общая выручка"    value={fmtMoney(totalRoyalty)}     color="text-emerald-400" />
        <KpiTile icon={DollarSign} label="Выплачено"        value={fmtMoney(totalPayout)}      color="text-amber-400" />
        <KpiTile icon={TrendingUp} label="ARPU (на артиста)" value={fmtMoney(arpu)}            color="text-indigo-400" />
      </div>
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-400" />Выручка по артистам</CardTitle>
          <CardDescription className="text-xs">Сортировка по нетто-выручке (роялти − выплаты)</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/40">
                <th className="text-left pb-2 font-medium">Артист</th>
                <th className="text-right pb-2 font-medium">Роялти</th>
                <th className="text-right pb-2 font-medium">Аванс</th>
                <th className="text-right pb-2 font-medium">Выплачено</th>
                <th className="text-right pb-2 font-medium">Нетто</th>
              </tr>
            </thead>
            <tbody>
              {[...data].sort((a, b) => b.net - a.net).map((r) => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/10">
                  <td className="py-1.5 font-medium">{r.name}</td>
                  <td className="py-1.5 text-right text-emerald-400">{fmtMoney(r.royalty)}</td>
                  <td className="py-1.5 text-right text-blue-400">{fmtMoney(r.advance)}</td>
                  <td className="py-1.5 text-right text-amber-400">{fmtMoney(r.payout)}</td>
                  <td className={`py-1.5 text-right font-semibold ${r.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtMoney(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 4: Growth ──────────────────────────────────────────────────────────

function CrmGrowthPanel() {
  const { data, loading } = useAnalyticsFetch<GrowthRow[]>("/api/crm/analytics/growth");
  if (loading) return <AnalyticsLoader />;
  if (!data || data.length === 0) return <AnalyticsEmpty />;

  const totalArtists = data.reduce((s, r) => s + r.artists, 0);
  const totalReleases = data.reduce((s, r) => s + r.releases, 0);
  const totalUsers = data.reduce((s, r) => s + r.users, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiTile icon={Mic2}     label="Новых артистов (12м)"      value={fmt(totalArtists)}  color="text-cyan-400" />
        <KpiTile icon={Disc3}    label="Новых релизов (12м)"       value={fmt(totalReleases)} color="text-indigo-400" />
        <KpiTile icon={Users2}   label="Новых пользователей (12м)" value={fmt(totalUsers)}    color="text-emerald-400" />
      </div>
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" />Рост по месяцам</CardTitle>
          <CardDescription className="text-xs">Новые артисты, релизы, пользователи за последние 12 месяцев</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid #30304a", fontSize: 12 }} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="artists"  name="Артисты"       fill="#6366f1" radius={[2,2,0,0]} />
              <Bar dataKey="releases" name="Релизы"        fill="#22d3ee" radius={[2,2,0,0]} />
              <Bar dataKey="users"    name="Пользователи"  fill="#34d399" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 5: Funnels ─────────────────────────────────────────────────────────

function CrmFunnelPanel() {
  const { data, loading } = useAnalyticsFetch<FunnelData>("/api/crm/analytics/funnel");
  if (loading) return <AnalyticsLoader />;
  if (!data) return <AnalyticsEmpty />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4 text-indigo-400" />Воронка релизов</CardTitle>
          <CardDescription className="text-xs">draft → review → approved → delivering → live</CardDescription>
        </CardHeader>
        <CardContent><FunnelBar items={data.releaseFunnel} colorFrom="bg-indigo-500" colorTo="bg-indigo-800" /></CardContent>
      </Card>
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Send className="h-4 w-4 text-blue-400" />Воронка доставок</CardTitle>
          <CardDescription className="text-xs">queued → processing → sent → acked / failed</CardDescription>
        </CardHeader>
        <CardContent><FunnelBar items={data.deliveryFunnel} colorFrom="bg-blue-500" colorTo="bg-blue-800" /></CardContent>
      </Card>
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><CheckSquare className="h-4 w-4 text-emerald-400" />Воронка задач</CardTitle>
          <CardDescription className="text-xs">todo → in_progress → done / cancelled</CardDescription>
        </CardHeader>
        <CardContent><FunnelBar items={data.taskFunnel} colorFrom="bg-emerald-500" colorTo="bg-emerald-800" /></CardContent>
      </Card>
    </div>
  );
}

// ─── API helpers ────────────────────────────────────────────────────────────

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

// ─── Page ───────────────────────────────────────────────────────────────────

// Telegram value can be either an @username or a https://t.me/... URL.
// We refuse anything else to prevent stored open-redirect / phishing links.
function safeTelegramHref(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("@")) return `https://t.me/${v.slice(1).replace(/[^a-zA-Z0-9_]/g, "")}`;
  if (/^https:\/\/(t\.me|telegram\.me)\/[A-Za-z0-9_+/?=&-]+$/.test(v)) return v;
  if (/^[a-zA-Z0-9_]{3,32}$/.test(v)) return `https://t.me/${v}`;
  return null;
}

const CRM_TABS = ["overview", "activity", "arpu", "growth", "funnel", "contacts", "tasks"] as const;
type CrmTab = typeof CRM_TABS[number];

export default function CRM() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const urlSearch = useSearch();

  const activeTab: CrmTab = (() => {
    const v = new URLSearchParams(urlSearch).get("tab") ?? "overview";
    return (CRM_TABS as readonly string[]).includes(v) ? (v as CrmTab) : "overview";
  })();

  const onTabChange = (next: string) => {
    if (next === "overview") setLocation("/crm");
    else setLocation(`/crm?tab=${next}`);
  };

  const contactTypeLabel = (tp: ContactType): string => ({
    artist: t.crm.contact_types.artist,
    author: t.crm.contact_types.author,
    label: t.crm.contact_types.label,
    manager: t.crm.contact_types.manager,
    partner: t.crm.contact_types.partner,
  }[tp] ?? tp);

  const priorityLabel = (p: TaskPriority): string => ({
    low: t.crm.priority.low,
    medium: t.crm.priority.medium,
    high: t.crm.priority.high,
    urgent: t.crm.priority.urgent,
  }[p] ?? p);

  const statusLabel = (s: TaskStatus): string => ({
    todo: t.crm.task_status.todo,
    in_progress: t.crm.task_status.in_progress,
    done: t.crm.task_status.done,
    cancelled: t.crm.task_status.cancelled,
  }[s] ?? s);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");

  const [contactDlg, setContactDlg] = useState<Contact | "new" | null>(null);
  const [taskDlg, setTaskDlg] = useState<CrmTask | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "contact"; id: number; name: string }
    | { kind: "task"; id: number; name: string }
    | null
  >(null);

  const isAdmin = user?.role === "admin" || user?.role === "manager";

  async function reload() {
    setLoading(true);
    try {
      const [c, tasksResp, u] = await Promise.all([
        api<Paginated<Contact>>("/api/crm/contacts?limit=100"),
        api<Paginated<CrmTask>>("/api/crm/tasks?limit=100"),
        api<{ data: UserLite[] }>("/api/users?limit=100").catch(() => ({ data: [] })),
      ]);
      setContacts(c.data);
      setTasks(tasksResp.data);
      setUsers(u.data);
    } catch (e: any) {
      toast({ title: t.crm.loading_error, description: e?.message ?? "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) { setLoading(false); return; }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin]);

  const [filterTypes, setFilterTypes] = useState<Set<ContactType>>(new Set());
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterHasOpen, setFilterHasOpen] = useState<boolean>(false);

  const countryOptions = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => { if (c.country) s.add(c.country); });
    return Array.from(s).sort();
  }, [contacts]);

  // Контакты с открытыми задачами (для фильтра «есть открытые задачи»)
  const contactsWithOpenTasks = useMemo(() => {
    const s = new Set<number>();
    tasks.forEach((t) => {
      if (
        (t.status === "todo" || t.status === "in_progress") &&
        t.relatedEntityType === "contact" &&
        t.relatedEntityId != null
      ) {
        s.add(t.relatedEntityId);
      }
    });
    return s;
  }, [tasks]);

  const activeFilterCount =
    (filterTypes.size > 0 ? 1 : 0) +
    (filterCountry !== "all" ? 1 : 0) +
    (filterHasOpen ? 1 : 0);

  function resetFilters() {
    setFilterTypes(new Set());
    setFilterCountry("all");
    setFilterHasOpen(false);
  }

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (q) {
        const matchSearch =
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q);
        if (!matchSearch) return false;
      }
      if (filterTypes.size > 0 && !filterTypes.has(c.type)) return false;
      if (filterCountry !== "all" && c.country !== filterCountry) return false;
      if (filterHasOpen && !contactsWithOpenTasks.has(c.id)) return false;
      return true;
    });
  }, [contacts, search, filterTypes, filterCountry, filterHasOpen, contactsWithOpenTasks]);

  const kpi = useMemo(() => ({
    total: contacts.length,
    artists: contacts.filter((c) => c.type === "artist").length,
    open: tasks.filter((t) => t.status === "todo" || t.status === "in_progress").length,
    overdue: tasks.filter(
      (t) => (t.status === "todo" || t.status === "in_progress") && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10),
    ).length,
  }), [contacts, tasks]);

  if (!isAdmin) {
    return (
      <Layout>
        <Card className="bg-card/50 border-border/50 max-w-md mx-auto mt-12">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t.crm.access_restricted}
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  async function toggleTaskDone(task: CrmTask) {
    if (pendingTaskIds.has(task.id)) return;
    const previousStatus = task.status;
    const nextStatus: TaskStatus = previousStatus === "done" ? "todo" : "done";
    setPendingTaskIds((p) => new Set(p).add(task.id));
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, status: nextStatus } : x)));
    try {
      const updated = await api<CrmTask>(`/api/crm/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          status: nextStatus,
          priority: task.priority,
          assignedToId: task.assignedToId,
          dueDate: task.dueDate,
          relatedEntityType: task.relatedEntityType,
          relatedEntityId: task.relatedEntityId,
        }),
      });
      setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, ...updated } : x)));
    } catch (e: any) {
      setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, status: previousStatus } : x)));
      toast({ title: t.crm.task_update_error, description: e?.message ?? "", variant: "destructive" });
    } finally {
      setPendingTaskIds((p) => { const n = new Set(p); n.delete(task.id); return n; });
    }
  }

  async function performDelete() {
    if (!confirmDelete) return;
    const item = confirmDelete;
    try {
      if (item.kind === "contact") {
        await api(`/api/crm/contacts/${item.id}`, { method: "DELETE" });
        setContacts((p) => p.filter((c) => c.id !== item.id));
        toast({ title: t.crm.contact_deleted });
      } else {
        await api(`/api/crm/tasks/${item.id}`, { method: "DELETE" });
        setTasks((p) => p.filter((tk) => tk.id !== item.id));
        toast({ title: t.crm.task_deleted });
      }
    } catch (e: any) {
      toast({ title: t.crm.delete_error, description: e?.message ?? "", variant: "destructive" });
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">CRM</h1>
            <p className="text-muted-foreground mt-1">{t.crm.subtitle}</p>
          </div>
          <Button onClick={() => setContactDlg("new")}>
            <Plus className="mr-2 h-4 w-4" />
            {t.crm.add_contact}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: t.crm.kpi.total_contacts, value: kpi.total, icon: Users2, color: "text-primary", bg: "bg-primary/10" },
            { label: t.crm.kpi.artists, value: kpi.artists, icon: Users2, color: "text-violet-400", bg: "bg-violet-500/10" },
            { label: t.crm.kpi.open_tasks, value: kpi.open, icon: CheckSquare, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: t.crm.kpi.overdue, value: kpi.overdue, icon: CheckSquare, color: "text-rose-400", bg: "bg-rose-500/10" },
          ].map((k) => (
            <Card key={k.label} className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="pt-5 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center shrink-0`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList className="bg-card border border-border h-auto p-1 gap-1 flex-wrap">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <BarChart2 className="h-3.5 w-3.5" /> {t.crm.tab_overview}
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Users2 className="h-3.5 w-3.5" /> {t.crm.tab_activity}
            </TabsTrigger>
            <TabsTrigger value="arpu" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> {t.crm.tab_arpu}
            </TabsTrigger>
            <TabsTrigger value="growth" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> {t.crm.tab_growth}
            </TabsTrigger>
            <TabsTrigger value="funnel" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Layers className="h-3.5 w-3.5" /> {t.crm.tab_funnel}
            </TabsTrigger>
            <TabsTrigger value="contacts" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <Mail className="h-3.5 w-3.5" /> {t.crm.tab_contacts}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5">
              <CheckSquare className="h-3.5 w-3.5" /> {t.crm.tab_tasks}
            </TabsTrigger>
          </TabsList>

          {/* ─── Analytics tabs ──────────────────────────────────────────── */}
          <TabsContent value="overview" className="mt-4"><CrmOverviewPanel /></TabsContent>
          <TabsContent value="activity" className="mt-4"><CrmActivityPanel /></TabsContent>
          <TabsContent value="arpu"     className="mt-4"><CrmArpuPanel /></TabsContent>
          <TabsContent value="growth"   className="mt-4"><CrmGrowthPanel /></TabsContent>
          <TabsContent value="funnel"   className="mt-4"><CrmFunnelPanel /></TabsContent>

          {/* ─── Contacts ─────────────────────────────────────────────────── */}
          <TabsContent value="contacts" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <div className="px-6 py-4 border-b border-border/50 flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t.crm.search_contacts}
                    className="pl-8 bg-background/50 border-border h-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 bg-background/50 relative"
                      data-testid="button-filter"
                      aria-label={t.crm.filter_type}
                    >
                      <Filter className="h-4 w-4" />
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-primary text-[10px] text-primary-foreground font-bold flex items-center justify-center">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 space-y-4">
                    <div>
                      <div className="text-xs font-medium mb-2">{t.crm.filter_type}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {CONTACT_TYPE_KEYS.map((tp) => (
                          <label key={tp} className="flex items-center gap-2 text-xs cursor-pointer hover-elevate rounded p-1">
                            <Checkbox
                              checked={filterTypes.has(tp)}
                              onCheckedChange={(v) => {
                                const s = new Set(filterTypes);
                                if (v) s.add(tp); else s.delete(tp);
                                setFilterTypes(s);
                              }}
                              data-testid={`filter-type-${tp}`}
                            />
                            <span>{contactTypeLabel(tp)}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium mb-2">{t.crm.contact_country}</div>
                      <select
                        aria-label="Filter by country"
                        className="w-full h-9 px-2 text-xs rounded-md bg-background border border-border"
                        value={filterCountry}
                        onChange={(e) => setFilterCountry(e.target.value)}
                        data-testid="filter-country"
                      >
                        <option value="all">{t.crm.filter_all_countries}</option>
                        {countryOptions.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-xs cursor-pointer hover-elevate rounded p-1">
                        <Checkbox
                          checked={filterHasOpen}
                          onCheckedChange={(v) => setFilterHasOpen(!!v)}
                          data-testid="filter-has-open-tasks"
                        />
                        <span>{t.crm.filter_open_tasks}</span>
                      </label>
                    </div>

                    {activeFilterCount > 0 && (
                      <Button
                        variant="ghost" size="sm" className="w-full h-8 text-xs"
                        onClick={resetFilters}
                        data-testid="button-reset-filters"
                      >
                        <X className="h-3 w-3 mr-1" /> {t.crm.reset_filters}
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                    <Spinner /> {t.crm.loading}
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    {contacts.length === 0 ? t.crm.no_contacts : t.crm.no_results}
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {filteredContacts.map((c) => (
                      <div key={c.id} className="flex items-center gap-4 px-6 py-4 hover:bg-accent/20 transition-colors group">
                        <Avatar className="h-10 w-10 border border-border shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                            {initialsOf(c.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{c.name}</p>
                            <Badge variant="outline" className="text-xs">{contactTypeLabel(c.type)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {[c.company, c.country].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
                          {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                          {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                          {c.email && (
                            <Button asChild variant="ghost" size="icon" className="h-7 w-7" aria-label={`Написать email ${c.email}`}>
                              <a href={`mailto:${c.email}`}><Mail className="h-3.5 w-3.5 text-muted-foreground" /></a>
                            </Button>
                          )}
                          {c.telegram && safeTelegramHref(c.telegram) && (
                            <Button asChild variant="ghost" size="icon" className="h-7 w-7" aria-label="Открыть Telegram">
                              <a href={safeTelegramHref(c.telegram)!} target="_blank" rel="noopener noreferrer">
                                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                              </a>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${t.crm.edit_aria} ${c.name}`} onClick={() => setContactDlg(c)}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${t.crm.delete_aria} ${c.name}`} onClick={() => setConfirmDelete({ kind: "contact", id: c.id, name: c.name })}>
                            <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Tasks ────────────────────────────────────────────────────── */}
          <TabsContent value="tasks" className="mt-4">
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle>{t.crm.tasks_title}</CardTitle>
                  <CardDescription>{t.crm.tasks_desc}</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => setTaskDlg("new")}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> {t.crm.add_task}
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                    <Spinner /> {t.crm.loading}
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">{t.crm.empty_tasks}</div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {tasks.map((task) => {
                      const done = task.status === "done";
                      const overdue = !done && task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10);
                      return (
                        <div key={task.id} className={`flex items-center gap-4 px-6 py-4 hover:bg-accent/20 transition-colors group ${done ? "opacity-60" : ""}`}>
                          <button
                            type="button"
                            onClick={() => toggleTaskDone(task)}
                            disabled={pendingTaskIds.has(task.id)}
                            className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-wait ${
                              done ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground hover:border-primary"
                            }`}
                            aria-label={done ? t.crm.task_unmark : t.crm.task_mark_done}
                            aria-pressed={done}
                          >
                            {done && <span className="text-white text-[8px]">✓</span>}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {task.dueDate ? <>{t.crm.due}: <span className={overdue ? "text-rose-400 font-medium" : ""}>{task.dueDate}</span></> : t.crm.no_due}
                              {task.assignedToName && <> · {task.assignedToName}</>}
                              {!done && <> · {statusLabel(task.status)}</>}
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-xs shrink-0 ${priorityClass(task.priority)}`}>
                            {priorityLabel(task.priority)}
                          </Badge>
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${t.crm.edit_aria} ${task.title}`} onClick={() => setTaskDlg(task)}>
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${t.crm.delete_aria} ${task.title}`} onClick={() => setConfirmDelete({ kind: "task", id: task.id, name: task.title })}>
                              <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Analytics ────────────────────────────────────────────────── */}
          <TabsContent value="analytics" className="mt-4">
            <CrmAnalytics />
          </TabsContent>
        </Tabs>
      </div>

      <ContactDialog
        state={contactDlg}
        onClose={() => setContactDlg(null)}
        onSaved={(saved, mode) => {
          setContacts((prev) => {
            if (mode === "create") return [saved, ...prev];
            return prev.map((c) => (c.id === saved.id ? saved : c));
          });
          setContactDlg(null);
        }}
      />
      <TaskDialog
        state={taskDlg}
        users={users}
        onClose={() => setTaskDlg(null)}
        onSaved={(saved, mode) => {
          setTasks((prev) => {
            if (mode === "create") return [saved, ...prev];
            return prev.map((t) => (t.id === saved.id ? saved : t));
          });
          setTaskDlg(null);
        }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.crm.delete_confirm_title}</AlertDialogTitle>
            <AlertDialogDescription>
              «{confirmDelete?.name}» {t.crm.delete_confirm_desc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.crm.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={performDelete} className="bg-rose-500 hover:bg-rose-600">{t.crm.confirm_delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

// ─── Contact dialog ─────────────────────────────────────────────────────────

function ContactDialog({
  state,
  onClose,
  onSaved,
}: {
  state: Contact | "new" | null;
  onClose: () => void;
  onSaved: (c: Contact, mode: "create" | "update") => void;
}) {
  const { toast } = useToast();
  const { t } = useLang();
  const isOpen = state !== null;
  const isNew = state === "new";
  const editing = state && state !== "new" ? state : null;

  const [form, setForm] = useState<{
    name: string; type: ContactType;
    email: string; phone: string; company: string; country: string;
    telegram: string; whatsapp: string; notes: string;
  }>({
    name: "", type: "artist",
    email: "", phone: "", company: "", country: "",
    telegram: "", whatsapp: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setForm({
        name: editing.name,
        type: editing.type,
        email: editing.email ?? "",
        phone: editing.phone ?? "",
        company: editing.company ?? "",
        country: editing.country ?? "",
        telegram: editing.telegram ?? "",
        whatsapp: editing.whatsapp ?? "",
        notes: editing.notes ?? "",
      });
    } else {
      setForm({ name: "", type: "artist", email: "", phone: "", company: "", country: "", telegram: "", whatsapp: "", notes: "" });
    }
  }, [isOpen, editing]);

  const contactTypeLabel = (tp: ContactType): string => ({
    artist: t.crm.contact_types.artist,
    author: t.crm.contact_types.author,
    label: t.crm.contact_types.label,
    manager: t.crm.contact_types.manager,
    partner: t.crm.contact_types.partner,
  }[tp] ?? tp);

  async function save() {
    if (!form.name.trim()) {
      toast({ title: t.crm.name_required, variant: "destructive" });
      return;
    }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      type: form.type,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
      country: form.country.trim() || null,
      telegram: form.telegram.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (isNew) {
        const created = await api<Contact>("/api/crm/contacts", { method: "POST", body: JSON.stringify(body) });
        toast({ title: t.crm.contact_added });
        onSaved(created, "create");
      } else if (editing) {
        const updated = await api<Contact>(`/api/crm/contacts/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        toast({ title: t.crm.contact_updated });
        onSaved(updated, "update");
      }
    } catch (e: any) {
      toast({ title: t.crm.save_error, description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? t.crm.new_contact : t.crm.edit_contact}</DialogTitle>
          <DialogDescription>{t.crm.contact_dlg_desc}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="c-name">{t.crm.contact_name} *</Label>
            <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.crm.contact_type}</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ContactType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTACT_TYPE_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>{contactTypeLabel(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-company">{t.crm.contact_company}</Label>
            <Input id="c-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-email">{t.crm.contact_email}</Label>
            <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-phone">{t.crm.contact_phone}</Label>
            <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-tg">Telegram</Label>
            <Input id="c-tg" placeholder="@username" value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-wa">WhatsApp</Label>
            <Input id="c-wa" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-country">{t.crm.contact_country}</Label>
            <Input id="c-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="c-notes">{t.crm.contact_notes}</Label>
            <Textarea id="c-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t.crm.cancel}</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t.crm.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Task dialog ────────────────────────────────────────────────────────────

function TaskDialog({
  state,
  users,
  onClose,
  onSaved,
}: {
  state: CrmTask | "new" | null;
  users: UserLite[];
  onClose: () => void;
  onSaved: (task: CrmTask, mode: "create" | "update") => void;
}) {
  const { toast } = useToast();
  const { t } = useLang();
  const isOpen = state !== null;
  const isNew = state === "new";
  const editing = state && state !== "new" ? state : null;

  const [form, setForm] = useState<{
    title: string; description: string;
    status: TaskStatus; priority: TaskPriority;
    assignedToId: string; dueDate: string;
  }>({
    title: "", description: "",
    status: "todo", priority: "medium",
    assignedToId: "none", dueDate: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setForm({
        title: editing.title,
        description: editing.description ?? "",
        status: editing.status,
        priority: editing.priority,
        assignedToId: editing.assignedToId ? String(editing.assignedToId) : "none",
        dueDate: editing.dueDate ?? "",
      });
    } else {
      setForm({ title: "", description: "", status: "todo", priority: "medium", assignedToId: "none", dueDate: "" });
    }
  }, [isOpen, editing]);

  const priorityLabel = (p: TaskPriority): string => ({
    low: t.crm.priority.low,
    medium: t.crm.priority.medium,
    high: t.crm.priority.high,
    urgent: t.crm.priority.urgent,
  }[p] ?? p);

  const statusLabel = (s: TaskStatus): string => ({
    todo: t.crm.task_status.todo,
    in_progress: t.crm.task_status.in_progress,
    done: t.crm.task_status.done,
    cancelled: t.crm.task_status.cancelled,
  }[s] ?? s);

  async function save() {
    if (!form.title.trim()) {
      toast({ title: t.crm.task_title_required, variant: "destructive" });
      return;
    }
    setSaving(true);
    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      assignedToId: form.assignedToId === "none" ? null : Number(form.assignedToId),
      dueDate: form.dueDate || null,
      relatedEntityType: editing?.relatedEntityType ?? null,
      relatedEntityId: editing?.relatedEntityId ?? null,
    };
    try {
      if (isNew) {
        const created = await api<CrmTask>("/api/crm/tasks", { method: "POST", body: JSON.stringify(body) });
        toast({ title: t.crm.task_created });
        onSaved(created, "create");
      } else if (editing) {
        const updated = await api<CrmTask>(`/api/crm/tasks/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        toast({ title: t.crm.task_updated });
        onSaved(updated, "update");
      }
    } catch (e: any) {
      toast({ title: t.crm.save_error, description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? t.crm.new_task : t.crm.edit_task}</DialogTitle>
          <DialogDescription>{t.crm.task_dlg_desc}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="t-title">{t.crm.task_title_label} *</Label>
            <Input id="t-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="t-desc">{t.crm.task_desc_label}</Label>
            <Textarea id="t-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.crm.task_status_label}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["todo", "in_progress", "done", "cancelled"] as TaskStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>{statusLabel(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t.crm.task_priority_label}</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["low", "medium", "high", "urgent"] as TaskPriority[]).map((k) => (
                  <SelectItem key={k} value={k}>{priorityLabel(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t.crm.task_assignee_label}</Label>
            <Select value={form.assignedToId} onValueChange={(v) => setForm({ ...form, assignedToId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t.crm.not_assigned}</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-due">{t.crm.task_due_label}</Label>
            <Input id="t-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t.crm.cancel}</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t.crm.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
