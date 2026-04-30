import { Layout } from "@/components/layout";
import { useCallback, useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import {
  MessageSquare, Mail, Megaphone, Zap, StickyNote, LifeBuoy,
  Plus, Trash2, Pencil, Send, Eye, Pin, PinOff, RefreshCcw, Copy,
  CheckCircle2, Clock, XCircle, AlertTriangle, Play, Ban,
  BarChart3, Users, FileText, Layers,
  Sparkles, ArrowLeft, Monitor, ChevronDown,
} from "lucide-react";

// ─── API helper ──────────────────────────────────────────────────────────────

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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Overview {
  templates: { total: number; active: number };
  campaigns: { total: number; sent: number; draft: number; totalEmailsSent: number };
  triggers: { total: number; enabled: number; totalFires: number };
}

interface Template {
  id: number; code: string; name: string; type: string; category: string;
  subject: string; bodyHtml: string; bodyText: string; variables: string[];
  isActive: boolean; createdAt: string; updatedAt: string;
}

interface Campaign {
  id: number; name: string; type: string; status: string;
  templateId: number | null; subject: string | null;
  audienceFilter: Record<string, unknown>; scheduledAt: string | null;
  sentAt: string | null; recipientCount: number; openCount: number;
  errors: string[]; createdAt: string;
}

interface Trigger {
  id: number; name: string; event: string; enabled: boolean;
  templateId: number | null; delayMinutes: number; recipient: string;
  lastFiredAt: string | null; fireCount: number;
}

interface InternalNote {
  id: number; entityType: string; entityId: number; body: string;
  tags: string[]; pinned: boolean; editedAt: string | null; createdAt: string;
  authorUserId: number | null; authorName: string | null; authorEmail: string | null;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const CAMPAIGN_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:     { label: "Черновик",    color: "text-muted-foreground" },
  scheduled: { label: "Запланирован", color: "text-blue-400" },
  sending:   { label: "Отправляется", color: "text-amber-400" },
  sent:      { label: "Отправлена",   color: "text-emerald-400" },
  failed:    { label: "Ошибка",       color: "text-rose-400" },
  cancelled: { label: "Отменена",     color: "text-muted-foreground" },
};

const EVENTS = [
  { value: "signup",           label: "Регистрация пользователя" },
  { value: "release_uploaded", label: "Загрузка релиза" },
  { value: "release_approved", label: "Релиз одобрен" },
  { value: "release_rejected", label: "Релиз отклонён" },
  { value: "payout_sent",      label: "Выплата отправлена" },
  { value: "kyc_approved",     label: "KYC одобрен" },
  { value: "kyc_rejected",     label: "KYC отклонён" },
  { value: "delivery_sent",    label: "DDEX-доставка отправлена" },
  { value: "delivery_acked",   label: "DDEX-доставка подтверждена" },
];

const RECIPIENTS = [
  { value: "requester", label: "Инициатор события" },
  { value: "assignee",  label: "Ответственный менеджер" },
  { value: "admins",    label: "Все администраторы" },
  { value: "managers",  label: "Все менеджеры" },
  { value: "all",       label: "Все пользователи" },
];

const TEMPLATE_CATEGORIES = [
  { value: "general",      label: "Общие" },
  { value: "onboarding",   label: "Онбординг" },
  { value: "distribution", label: "Дистрибуция" },
  { value: "finance",      label: "Финансы" },
  { value: "kyc",          label: "KYC" },
  { value: "system",       label: "Система" },
];

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function TabOverview({ onTabChange }: { onTabChange: (t: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Overview>("/api/communications/overview").then((r) => { setData(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const tiles = data ? [
    { icon: FileText,  label: "Шаблонов",      value: data.templates.total,     sub: `${data.templates.active} активных`,     color: "text-blue-400",    bg: "bg-blue-500/10",    tab: "templates" },
    { icon: Megaphone, label: "Рассылок",       value: data.campaigns.total,     sub: `${data.campaigns.sent} отправлено`,     color: "text-rose-400",    bg: "bg-rose-500/10",    tab: "campaigns" },
    { icon: Zap,       label: "Триггеров",      value: data.triggers.total,      sub: `${data.triggers.enabled} включено`,     color: "text-amber-400",   bg: "bg-amber-500/10",   tab: "automation" },
    { icon: Mail,      label: "Email отправлено",value: data.campaigns.totalEmailsSent, sub: "всего за всё время",            color: "text-emerald-400", bg: "bg-emerald-500/10", tab: "campaigns" },
    { icon: Zap,       label: "Срабатываний",   value: data.triggers.totalFires, sub: "триггеров за всё время",               color: "text-violet-400",  bg: "bg-violet-500/10",  tab: "automation" },
  ] : [];

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {tiles.map((tile) => (
            <button key={tile.label} onClick={() => onTabChange(tile.tab)}
              className="text-left rounded-xl border border-border/60 bg-card p-4 hover:border-primary/40 transition-colors group">
              <div className={`w-8 h-8 rounded-lg ${tile.bg} flex items-center justify-center mb-3`}>
                <tile.icon className={`w-4 h-4 ${tile.color}`} />
              </div>
              <div className="text-2xl font-bold tabular-nums">{tile.value.toLocaleString()}</div>
              <div className="text-xs font-medium mt-0.5 group-hover:text-primary transition-colors">{tile.label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{tile.sub}</div>
            </button>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="card-surface no-lift border-border/60">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-yellow-400" />Входящие обращения
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Тикеты поддержки, переписка с лейблами и артистами</p>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = "/support")}>
              Открыть Inbox
            </Button>
          </CardContent>
        </Card>

        <Card className="card-surface no-lift border-border/60">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />Быстрые действия
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onTabChange("templates")}><Plus className="w-3.5 h-3.5 mr-1.5" />Новый шаблон</Button>
              <Button variant="outline" size="sm" onClick={() => onTabChange("campaigns")}><Megaphone className="w-3.5 h-3.5 mr-1.5" />Создать рассылку</Button>
              <Button variant="outline" size="sm" onClick={() => onTabChange("automation")}><Zap className="w-3.5 h-3.5 mr-1.5" />Настроить триггер</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab: Email Templates ─────────────────────────────────────────────────────

const emptyTemplate = () => ({ code: "", name: "", type: "email", category: "general", subject: "", bodyHtml: "", bodyText: "", variables: [] as string[], isActive: true });

function TabTemplates() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<Template | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyTemplate());
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [varInput, setVarInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api<{ data: Template[] }>("/api/communications/templates"); setRows(r.data); }
    catch { /* noop */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openNew = () => { setEditRow(null); setForm(emptyTemplate()); setShowForm(true); };
  const openEdit = (t: Template) => {
    setEditRow(t);
    setForm({ code: t.code, name: t.name, type: t.type, category: t.category, subject: t.subject, bodyHtml: t.bodyHtml, bodyText: t.bodyText, variables: t.variables, isActive: t.isActive });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editRow) await api(`/api/communications/templates/${editRow.id}`, { method: "PUT", body: JSON.stringify(form) });
      else await api("/api/communications/templates", { method: "POST", body: JSON.stringify(form) });
      toast({ title: editRow ? "Шаблон обновлён" : "Шаблон создан" });
      setShowForm(false);
      void load();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setSaving(false); }
  };

  const del = async (id: number) => {
    try { await api(`/api/communications/templates/${id}`, { method: "DELETE" }); void load(); toast({ title: "Шаблон удалён" }); }
    catch (e) { toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message }); }
  };

  const preview = async (t: Template) => {
    try { const r = await api<{ bodyHtml: string }>(`/api/communications/templates/${t.id}/preview`, { method: "POST", body: JSON.stringify({}) }); setPreviewHtml(r.bodyHtml || t.bodyText || "(пусто)"); }
    catch { setPreviewHtml(t.bodyText || "(пусто)"); }
  };

  const filtered = rows.filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase()));

  const setF = (k: keyof typeof form, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по названию или коду…" className="w-64 bg-background/50" />
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Новый шаблон</Button>
      </div>

      {loading ? <Skeleton className="h-48 w-full" /> : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          {rows.length === 0 ? "Шаблонов ещё нет" : "Нет совпадений"}
        </div>
      ) : (
        <div className="rounded-md border border-border/60 overflow-hidden">
          <Table>
            <TableHeader className="bg-background/30">
              <TableRow className="hover:bg-transparent">
                <TableHead>Название</TableHead><TableHead>Код</TableHead>
                <TableHead>Тип</TableHead><TableHead>Категория</TableHead>
                <TableHead>Переменные</TableHead><TableHead>Обновлён</TableHead>
                <TableHead>Статус</TableHead><TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className="hover:bg-accent/20">
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell><code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{t.code}</code></TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{t.type === "email" ? "Email" : "Push"}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">{t.category}</TableCell>
                  <TableCell>
                    {t.variables.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : (
                      <div className="flex flex-wrap gap-1">
                        {t.variables.slice(0, 3).map((v) => <Badge key={v} variant="outline" className="text-[9px] font-mono">{v}</Badge>)}
                        {t.variables.length > 3 && <Badge variant="outline" className="text-[9px]">+{t.variables.length - 3}</Badge>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(t.updatedAt)}</TableCell>
                  <TableCell>
                    {t.isActive
                      ? <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Активен</Badge>
                      : <Badge variant="outline" className="text-[10px] text-muted-foreground">Неактивен</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => preview(t)}><Eye className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del(t.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Preview dialog */}
      <Dialog open={previewHtml !== null} onOpenChange={(v) => { if (!v) setPreviewHtml(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Предпросмотр шаблона</DialogTitle></DialogHeader>
          <div className="bg-background/50 border border-border rounded-md p-4 text-sm font-mono whitespace-pre-wrap overflow-x-auto"
            dangerouslySetInnerHTML={previewHtml?.includes("<") ? { __html: previewHtml } : undefined}>
            {!previewHtml?.includes("<") ? previewHtml : null}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPreviewHtml(null)}>Закрыть</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/Create dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editRow ? "Редактировать шаблон" : "Новый шаблон"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Название</label><Input className="mt-1" value={form.name} onChange={(e) => setF("name", e.target.value)} /></div>
              <div>
                <label className="text-sm font-medium">Код</label>
                <Input className="mt-1 font-mono" value={form.code} onChange={(e) => setF("code", e.target.value.toLowerCase())} placeholder="welcome_artist" disabled={!!editRow} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Тип</label>
                <Select value={form.type} onValueChange={(v) => setF("type", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="push">Push</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Категория</label>
                <Select value={form.category} onValueChange={(v) => setF("category", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{TEMPLATE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><label className="text-sm font-medium">Тема письма (Subject)</label><Input className="mt-1" value={form.subject} onChange={(e) => setF("subject", e.target.value)} placeholder="Добро пожаловать, {{ user_name }}!" /></div>
            <div>
              <label className="text-sm font-medium">HTML-тело</label>
              <Textarea className="mt-1 font-mono text-xs min-h-[120px]" value={form.bodyHtml} onChange={(e) => setF("bodyHtml", e.target.value)} placeholder="<p>Привет, {{ user_name }}!</p>" />
            </div>
            <div>
              <label className="text-sm font-medium">Текстовая версия</label>
              <Textarea className="mt-1 font-mono text-xs min-h-[80px]" value={form.bodyText} onChange={(e) => setF("bodyText", e.target.value)} placeholder="Привет, {{ user_name }}!" />
            </div>
            <div>
              <label className="text-sm font-medium">Переменные</label>
              <div className="flex gap-2 mt-1">
                <Input value={varInput} onChange={(e) => setVarInput(e.target.value)} placeholder="user_name" className="font-mono w-48"
                  onKeyDown={(e) => { if (e.key === "Enter") { if (varInput.trim()) setF("variables", [...form.variables, varInput.trim()]); setVarInput(""); } }} />
                <Button variant="outline" onClick={() => { if (varInput.trim()) { setF("variables", [...form.variables, varInput.trim()]); setVarInput(""); } }}>Добавить</Button>
              </div>
              {form.variables.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.variables.map((v) => (
                    <Badge key={v} variant="outline" className="font-mono gap-1">
                      {`{{ ${v} }}`}
                      <button onClick={() => setF("variables", form.variables.filter((x) => x !== v))} className="ml-1 hover:text-destructive">×</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={(v) => setF("isActive", v)} />
              <label className="text-sm">Шаблон активен</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Отмена</Button>
            <Button onClick={save} disabled={saving || !form.name || !form.code}>{saving ? "Сохраняем…" : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab: Campaigns ───────────────────────────────────────────────────────────

const NEWSLETTER_TEMPLATE = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>{{subject}}</title>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#e6edf3;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#161b27 0%,#0d1117 100%);border-radius:12px 12px 0 0;padding:40px 40px 32px;text-align:center;border-bottom:1px solid #21262d;">
              <div style="font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#6e7681;margin-bottom:12px;font-weight:600;">TAJIK MUSIC DISTRIBUTION</div>
              <h1 style="margin:0;font-size:30px;font-weight:800;color:#ffffff;line-height:1.25;">{{title}}</h1>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="background:#161b27;padding:24px 40px;text-align:center;border-bottom:1px solid #21262d;">
              <p style="margin:0;font-size:15px;color:#8b949e;line-height:1.7;">{{intro}}</p>
            </td>
          </tr>

          <!-- Content block -->
          <tr>
            <td style="background:#0d1117;padding:32px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#161b27;border:1px solid #21262d;border-radius:10px;padding:28px;">
                    <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#f78166;margin-bottom:10px;font-weight:700;">Новость</div>
                    <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#e6edf3;line-height:1.3;">{{news_title}}</h2>
                    <p style="margin:0 0 20px;font-size:14px;color:#8b949e;line-height:1.7;">{{news_body}}</p>
                    <a href="{{news_link}}" style="display:inline-block;background:#238636;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:6px;font-size:13px;font-weight:600;letter-spacing:0.3px;">Узнать больше</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tips section -->
          <tr>
            <td style="background:#0d1117;padding:0 40px 32px;">
              <h3 style="margin:0 0 20px;font-size:18px;font-weight:700;color:#e6edf3;text-align:center;">Советы и рекомендации</h3>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="48%" valign="top" style="background:#161b27;border:1px solid #21262d;border-radius:10px;padding:20px;">
                    <h4 style="margin:0 0 8px;font-size:15px;font-weight:700;color:#e6edf3;">{{tip1_title}}</h4>
                    <p style="margin:0 0 14px;font-size:13px;color:#8b949e;line-height:1.6;">{{tip1_body}}</p>
                    <a href="{{tip1_link}}" style="font-size:12px;color:#58a6ff;text-decoration:none;font-weight:600;">Читать далее &rarr;</a>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" valign="top" style="background:#161b27;border:1px solid #21262d;border-radius:10px;padding:20px;">
                    <h4 style="margin:0 0 8px;font-size:15px;font-weight:700;color:#e6edf3;">{{tip2_title}}</h4>
                    <p style="margin:0 0 14px;font-size:13px;color:#8b949e;line-height:1.6;">{{tip2_body}}</p>
                    <a href="{{tip2_link}}" style="font-size:12px;color:#58a6ff;text-decoration:none;font-weight:600;">Читать далее &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#161b27;border-radius:0 0 12px 12px;padding:28px 40px;text-align:center;border-top:1px solid #21262d;">
              <p style="margin:0 0 6px;font-size:13px;color:#8b949e;">Привет, {{user_name}}! Это письмо отправлено от <strong style="color:#e6edf3;">{{platform_name}}</strong>.</p>
              <p style="margin:0;font-size:11px;color:#484f58;">
                Вы получили это письмо как пользователь платформы.
                <a href="#" style="color:#58a6ff;text-decoration:none;">Отписаться от рассылки</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const AUDIENCE_OPTIONS = [
  { value: "all",     label: "Все пользователи",  filter: {} },
  { value: "artist",  label: "Только артисты",    filter: { roles: ["artist"] } },
  { value: "label",   label: "Только лейблы",     filter: { roles: ["label"] } },
  { value: "manager", label: "Только менеджеры",  filter: { roles: ["manager"] } },
  { value: "admin",   label: "Только админы",     filter: { roles: ["admin"] } },
];

const emptyCampaign = () => ({ name: "", type: "email", templateId: null as number | null, subject: "", audienceFilter: {} as Record<string, unknown>, scheduledAt: "" });

function TabCampaigns({ templates }: { templates: Template[] }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<Campaign | null>(null);
  const [form, setForm] = useState(emptyCampaign());
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);

  // ── Compose mode ─────────────────────────────────────────────────
  const [compose, setCompose] = useState(false);
  const [cSubject, setCSubject] = useState("");
  const [cAudience, setCAudience] = useState("all");
  const [cHtml, setCHtml] = useState("");
  const [cSending, setCsending] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument ?? iframeRef.current.contentWindow?.document;
      if (doc) {
        doc.open(); doc.write(cHtml || "<html><body style='background:#0d1117;color:#8b949e;font-family:sans-serif;padding:32px;text-align:center;'><p>Превью появится здесь</p></body></html>"); doc.close();
      }
    }
  }, [cHtml]);

  const quickSend = async () => {
    if (!cSubject.trim() || !cHtml.trim()) {
      toast({ variant: "destructive", title: "Заполните тему и текст письма" }); return;
    }
    setCsending(true);
    try {
      const audienceOpt = AUDIENCE_OPTIONS.find((a) => a.value === cAudience) ?? AUDIENCE_OPTIONS[0];
      const r = await api<{ ok: boolean; recipientCount: number; campaign: Campaign }>(
        "/api/communications/campaigns/quick-send",
        { method: "POST", body: JSON.stringify({ subject: cSubject, bodyHtml: cHtml, audienceFilter: audienceOpt.filter }) },
      );
      toast({ title: "Рассылка отправлена", description: `Получателей: ${r.recipientCount}` });
      setCompose(false); setCSubject(""); setCHtml(""); setCAudience("all");
      void load();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка отправки", description: (e as Error).message });
    } finally { setCsending(false); }
  };
  // ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api<{ data: Campaign[] }>("/api/communications/campaigns"); setRows(r.data); }
    catch { /* noop */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openNew = () => { setEditRow(null); setForm(emptyCampaign()); setShowForm(true); };
  const openEdit = (c: Campaign) => {
    setEditRow(c);
    setForm({ name: c.name, type: c.type, templateId: c.templateId, subject: c.subject ?? "", audienceFilter: c.audienceFilter, scheduledAt: c.scheduledAt ? new Date(c.scheduledAt).toISOString().slice(0, 16) : "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = { ...form, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined };
      if (editRow) await api(`/api/communications/campaigns/${editRow.id}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/api/communications/campaigns", { method: "POST", body: JSON.stringify(body) });
      toast({ title: editRow ? "Рассылка обновлена" : "Рассылка создана" });
      setShowForm(false);
      void load();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setSaving(false); }
  };

  const sendNow = async (id: number) => {
    setSendingId(id);
    try {
      const r = await api<{ ok: boolean; recipientCount: number }>(`/api/communications/campaigns/${id}/send`, { method: "POST" });
      toast({ title: "Рассылка отправлена", description: `Получателей: ${r.recipientCount}` });
      void load();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка отправки", description: (e as Error).message });
    } finally { setSendingId(null); }
  };

  const cancel = async (id: number) => {
    try { await api(`/api/communications/campaigns/${id}/cancel`, { method: "POST" }); void load(); toast({ title: "Рассылка отменена" }); }
    catch (e) { toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message }); }
  };

  const setF = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  // ── Compose view ──────────────────────────────────────────────────
  if (compose) {
    return (
      <div className="flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => setCompose(false)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent/40"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Назад к списку рассылок
          </button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCHtml(NEWSLETTER_TEMPLATE)}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />Вставить шаблон Newsletter
            </Button>
            <Button size="sm" onClick={() => void quickSend()} disabled={cSending || !cSubject.trim() || !cHtml.trim()}>
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {cSending ? "Отправка…" : "Создать и отправить"}
            </Button>
          </div>
        </div>

        {/* Fields row */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Тема письма *</label>
            <Input
              value={cSubject}
              onChange={(e) => setCSubject(e.target.value)}
              placeholder="Обновления платформы Tajik Music Distribution — апрель 2026"
              className="bg-background/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Аудитория</label>
            <Select value={cAudience} onValueChange={setCAudience}>
              <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUDIENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Split pane: editor + preview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-xl border border-border/60 overflow-hidden" style={{ height: "65vh" }}>
          {/* Editor */}
          <div className="flex flex-col border-r border-border/60">
            <div className="flex items-center gap-2 px-4 py-2 bg-background/50 border-b border-border/60 shrink-0">
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">HTML-редактор</span>
              <span className="ml-auto text-[10px] text-muted-foreground/60">Переменные: &#123;&#123;user_name&#125;&#125;, &#123;&#123;platform_name&#125;&#125;</span>
            </div>
            <Textarea
              value={cHtml}
              onChange={(e) => setCHtml(e.target.value)}
              placeholder={"<!DOCTYPE html>\n<html>\n<body>\n  <p>Привет, {{user_name}}!</p>\n</body>\n</html>"}
              className="flex-1 resize-none rounded-none border-0 font-mono text-xs bg-background/30 focus-visible:ring-0 focus-visible:ring-offset-0"
              style={{ minHeight: 0 }}
            />
          </div>

          {/* Preview */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2 bg-background/50 border-b border-border/60 shrink-0">
              <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Превью письма</span>
            </div>
            <iframe
              ref={iframeRef}
              className="flex-1 w-full border-0 bg-[#0d1117]"
              title="Email preview"
              sandbox="allow-same-origin"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Для реальной отправки необходимо настроить SMTP в разделе Настройки → Уведомления.
          Переменные <code className="font-mono bg-muted px-1 rounded">&#123;&#123;user_name&#125;&#125;</code> и <code className="font-mono bg-muted px-1 rounded">&#123;&#123;platform_name&#125;&#125;</code> заменяются автоматически при отправке.
        </p>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">Рассылки отправляются через SMTP (Настройки → Уведомления) или push/Telegram/WhatsApp.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openNew}><Plus className="w-4 h-4 mr-2" />Черновик рассылки</Button>
          <Button onClick={() => setCompose(true)}><Send className="w-4 h-4 mr-2" />Новая рассылка</Button>
        </div>
      </div>

      {loading ? <Skeleton className="h-48 w-full" /> : rows.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          <Megaphone className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>Рассылок ещё нет.</p>
          <Button className="mt-4" onClick={() => setCompose(true)}><Send className="w-4 h-4 mr-2" />Создать первую рассылку</Button>
        </div>
      ) : (
        <div className="rounded-md border border-border/60 overflow-hidden">
          <Table>
            <TableHeader className="bg-background/30">
              <TableRow className="hover:bg-transparent">
                <TableHead>Название</TableHead><TableHead>Тип</TableHead>
                <TableHead>Статус</TableHead><TableHead>Получатели</TableHead>
                <TableHead>Запланирован</TableHead><TableHead>Отправлен</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const st = CAMPAIGN_STATUS_MAP[c.status] ?? { label: c.status, color: "" };
                const busy = sendingId === c.id;
                return (
                  <TableRow key={c.id} className="hover:bg-accent/20">
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{c.type === "email" ? "Email" : c.type}</Badge></TableCell>
                    <TableCell><span className={`text-xs font-medium ${st.color}`}>{st.label}</span></TableCell>
                    <TableCell className="text-sm">{c.recipientCount > 0 ? c.recipientCount.toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(c.scheduledAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(c.sentAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(c.status === "draft" || c.status === "scheduled") && (
                          <>
                            <Button variant="ghost" size="sm" title="Отправить сейчас" onClick={() => sendNow(c.id)} disabled={busy}>
                              <Send className="w-3.5 h-3.5 text-primary" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Редактировать" onClick={() => openEdit(c)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Отменить" onClick={() => cancel(c.id)}>
                              <Ban className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editRow ? "Редактировать рассылку" : "Новая рассылка (черновик)"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">Название</label><Input className="mt-1" value={form.name} onChange={(e) => setF("name", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Тип канала</label>
                <Select value={form.type} onValueChange={(v) => setF("type", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="push">Push</SelectItem>
                    <SelectItem value="telegram">Telegram</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Шаблон</label>
                <Select value={form.templateId ? String(form.templateId) : "__none__"} onValueChange={(v) => setF("templateId", v === "__none__" ? null : parseInt(v, 10))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Не выбран" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Без шаблона —</SelectItem>
                    {templates.filter((t) => t.type === form.type && t.isActive).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><label className="text-sm font-medium">Тема письма</label><Input className="mt-1" value={form.subject} onChange={(e) => setF("subject", e.target.value)} /></div>
            <div>
              <label className="text-sm font-medium">Аудитория</label>
              <div className="mt-1">
                <Select value={(form.audienceFilter.roles as string[] | undefined)?.[0] ?? "all"} onValueChange={(v) => setF("audienceFilter", v === "all" ? {} : { roles: [v] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Запланировать отправку</label>
              <Input type="datetime-local" className="mt-1" value={form.scheduledAt} onChange={(e) => setF("scheduledAt", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Отмена</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>{saving ? "Сохраняем…" : "Сохранить черновик"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab: Automation Triggers ─────────────────────────────────────────────────

const emptyTrigger = () => ({ name: "", event: "signup", enabled: false, templateId: null as number | null, delayMinutes: 0, recipient: "requester" });

function TabAutomation({ templates }: { templates: Template[] }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Trigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<Trigger | null>(null);
  const [form, setForm] = useState(emptyTrigger());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api<{ data: Trigger[] }>("/api/communications/triggers"); setRows(r.data); }
    catch { /* noop */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openNew = () => { setEditRow(null); setForm(emptyTrigger()); setShowForm(true); };
  const openEdit = (t: Trigger) => {
    setEditRow(t);
    setForm({ name: t.name, event: t.event, enabled: t.enabled, templateId: t.templateId, delayMinutes: t.delayMinutes, recipient: t.recipient });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editRow) await api(`/api/communications/triggers/${editRow.id}`, { method: "PUT", body: JSON.stringify(form) });
      else await api("/api/communications/triggers", { method: "POST", body: JSON.stringify(form) });
      toast({ title: editRow ? "Триггер обновлён" : "Триггер создан" });
      setShowForm(false);
      void load();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setSaving(false); }
  };

  const toggle = async (id: number) => {
    try { await api(`/api/communications/triggers/${id}/toggle`, { method: "PATCH" }); void load(); }
    catch (e) { toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message }); }
  };

  const del = async (id: number) => {
    try { await api(`/api/communications/triggers/${id}`, { method: "DELETE" }); void load(); toast({ title: "Триггер удалён" }); }
    catch (e) { toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message }); }
  };

  const setF = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const eventLabel = (ev: string) => EVENTS.find((e) => e.value === ev)?.label ?? ev;
  const recipientLabel = (r: string) => RECIPIENTS.find((x) => x.value === r)?.label ?? r;
  const tplName = (id: number | null) => id ? (templates.find((t) => t.id === id)?.name ?? `#${id}`) : "—";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-lg">
          Триггеры автоматически отправляют письма или push-уведомления при наступлении системных событий.
          Для работы требуется настроенный SMTP (Настройки → Уведомления).
        </p>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Добавить триггер</Button>
      </div>

      {loading ? <Skeleton className="h-48 w-full" /> : rows.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Триггеров ещё нет</div>
      ) : (
        <div className="rounded-md border border-border/60 overflow-hidden">
          <Table>
            <TableHeader className="bg-background/30">
              <TableRow className="hover:bg-transparent">
                <TableHead>Включён</TableHead><TableHead>Название</TableHead>
                <TableHead>Событие</TableHead><TableHead>Шаблон</TableHead>
                <TableHead>Задержка</TableHead><TableHead>Получатель</TableHead>
                <TableHead>Последнее срабатывание</TableHead><TableHead>Всего</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id} className="hover:bg-accent/20">
                  <TableCell><Switch checked={t.enabled} onCheckedChange={() => toggle(t.id)} /></TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] font-mono">{t.event}</Badge>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{eventLabel(t.event)}</div>
                  </TableCell>
                  <TableCell className="text-xs">{tplName(t.templateId)}</TableCell>
                  <TableCell className="text-xs">{t.delayMinutes === 0 ? "Сразу" : `${t.delayMinutes} мин`}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{recipientLabel(t.recipient)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(t.lastFiredAt)}</TableCell>
                  <TableCell className="text-xs font-medium">{t.fireCount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del(t.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editRow ? "Редактировать триггер" : "Новый триггер"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">Название</label><Input className="mt-1" value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="Приветствие при регистрации" /></div>
            <div>
              <label className="text-sm font-medium">Событие</label>
              <Select value={form.event} onValueChange={(v) => setF("event", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{EVENTS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Шаблон</label>
              <Select value={form.templateId ? String(form.templateId) : "__none__"} onValueChange={(v) => setF("templateId", v === "__none__" ? null : parseInt(v, 10))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Выбрать шаблон" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Без шаблона —</SelectItem>
                  {templates.filter((t) => t.isActive).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Задержка (мин)</label>
                <Input type="number" min={0} className="mt-1" value={form.delayMinutes} onChange={(e) => setF("delayMinutes", Number(e.target.value))} />
              </div>
              <div>
                <label className="text-sm font-medium">Кому отправлять</label>
                <Select value={form.recipient} onValueChange={(v) => setF("recipient", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{RECIPIENTS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.enabled} onCheckedChange={(v) => setF("enabled", v)} />
              <label className="text-sm">Триггер активен</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Отмена</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>{saving ? "Сохраняем…" : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Shared: Internal Notes Panel ────────────────────────────────────────────
// Reusable component — используется и на странице Communications, и embedded в других

interface InternalNotesPanelProps {
  entityType: string;
  entityId: number;
  compact?: boolean;
}

export function InternalNotesPanel({ entityType, entityId, compact = false }: InternalNotesPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<InternalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBody, setNewBody] = useState("");
  const [newTags, setNewTags] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ data: InternalNote[] }>(`/api/communications/notes?entity_type=${entityType}&entity_id=${entityId}`);
      setRows(r.data);
    } catch { /* noop */ } finally { setLoading(false); }
  }, [entityType, entityId]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!newBody.trim()) return;
    setSaving(true);
    try {
      await api("/api/communications/notes", {
        method: "POST",
        body: JSON.stringify({ entityType, entityId, body: newBody.trim(), tags: newTags.split(",").map((s) => s.trim()).filter(Boolean) }),
      });
      setNewBody(""); setNewTags("");
      void load();
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message }); }
    finally { setSaving(false); }
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try { await api(`/api/communications/notes/${id}`, { method: "PUT", body: JSON.stringify({ body: editBody }) }); setEditId(null); void load(); }
    catch (e) { toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message }); }
    finally { setSaving(false); }
  };

  const del = async (id: number) => {
    try { await api(`/api/communications/notes/${id}`, { method: "DELETE" }); void load(); }
    catch (e) { toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message }); }
  };

  const pin = async (id: number) => {
    try { await api(`/api/communications/notes/${id}/pin`, { method: "PATCH" }); void load(); }
    catch { /* noop */ }
  };

  const initials = (name: string | null) => name ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "?";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {loading ? <Skeleton className="h-24 w-full" /> : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4">Заметок нет</div>
      ) : (
        <div className="space-y-2">
          {rows.map((note) => (
            <div key={note.id} className={`rounded-lg border p-3 text-sm transition-colors ${note.pinned ? "border-amber-500/30 bg-amber-500/5" : "border-border/50 bg-card"}`}>
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0 mt-0.5">
                  {initials(note.authorName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-xs">{note.authorName ?? "—"}</span>
                    <span className="text-[10px] text-muted-foreground">{fmtDate(note.createdAt)}</span>
                    {note.editedAt && <span className="text-[10px] text-muted-foreground">(ред. {fmtDate(note.editedAt)})</span>}
                    {note.pinned && <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/20 py-0">Закреплена</Badge>}
                    {note.tags.map((tag) => <Badge key={tag} variant="outline" className="text-[9px] py-0">{tag}</Badge>)}
                  </div>
                  {editId === note.id ? (
                    <div className="mt-2 space-y-2">
                      <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="text-xs min-h-[60px]" autoFocus />
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7" onClick={() => saveEdit(note.id)} disabled={saving}>Сохранить</Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditId(null)}>Отмена</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm leading-snug whitespace-pre-wrap">{note.body}</p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => pin(note.id)}>
                    {note.pinned ? <PinOff className="w-3 h-3 text-amber-400" /> : <Pin className="w-3 h-3 text-muted-foreground" />}
                  </Button>
                  {(user?.role === "admin" || user?.id === note.authorUserId) && editId !== note.id && (
                    <>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditId(note.id); setEditBody(note.body); }}>
                        <Pencil className="w-3 h-3 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => del(note.id)}>
                        <Trash2 className="w-3 h-3 text-destructive/70" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-border/40 pt-3">
        <Textarea
          ref={textRef}
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Внутренняя заметка… (Ctrl+Enter для сохранения)"
          className="text-sm min-h-[80px] bg-background/50"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { void add(); } }}
        />
        <div className="flex items-center gap-2">
          <Input value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="Теги через запятую" className="text-xs h-8 bg-background/50" />
          <Button size="sm" onClick={add} disabled={saving || !newBody.trim()}><Send className="w-3.5 h-3.5 mr-1.5" />Добавить</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Notes Browser ───────────────────────────────────────────────────────

function TabNotes() {
  const [entityType, setEntityType] = useState("release");
  const [entityIdStr, setEntityIdStr] = useState("1");
  const entityId = parseInt(entityIdStr, 10);

  return (
    <div className="space-y-4">
      <Card className="card-surface no-lift border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Внутренние заметки команды</CardTitle>
          <CardDescription>
            Заметки привязаны к конкретной сущности (релиз, артист, лейбл, пользователь, тикет).
            Видны только администраторам и менеджерам.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Тип сущности</label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="mt-1 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="release">Релиз</SelectItem>
                  <SelectItem value="artist">Артист</SelectItem>
                  <SelectItem value="label">Лейбл</SelectItem>
                  <SelectItem value="user">Пользователь</SelectItem>
                  <SelectItem value="ticket">Тикет поддержки</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ID</label>
              <Input type="number" min={1} className="mt-1 w-28" value={entityIdStr} onChange={(e) => setEntityIdStr(e.target.value)} />
            </div>
          </div>

          {Number.isFinite(entityId) && entityId > 0 && (
            <InternalNotesPanel entityType={entityType} entityId={entityId} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Communications() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [templates, setTemplates] = useState<Template[]>([]);
  const canView = user?.role === "admin" || user?.role === "manager";

  useEffect(() => {
    if (canView) {
      api<{ data: Template[] }>("/api/communications/templates").then((r) => setTemplates(r.data)).catch(() => { /* noop */ });
    }
  }, [canView]);

  if (isLoading) return <Layout><div className="p-6"><Skeleton className="h-32 w-full" /></div></Layout>;

  if (!canView) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Доступ ограничен</h1>
          <p className="text-sm text-muted-foreground">Раздел коммуникаций доступен только администраторам и менеджерам.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="relative pl-4">
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-rose-400 to-pink-500" />
          <h1 className="text-2xl font-bold tracking-tight">Коммуникации</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Шаблоны, рассылки, автоматизация, внутренние заметки</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-card border border-border h-auto p-1 gap-0.5 flex-wrap">
            <TabsTrigger value="overview"    className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs"><BarChart3 className="h-3.5 w-3.5" />Обзор</TabsTrigger>
            <TabsTrigger value="inbox"       className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs"><LifeBuoy className="h-3.5 w-3.5" />Inbox</TabsTrigger>
            <TabsTrigger value="templates"   className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />Шаблоны</TabsTrigger>
            <TabsTrigger value="campaigns"   className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs"><Megaphone className="h-3.5 w-3.5" />Рассылки</TabsTrigger>
            <TabsTrigger value="automation"  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs"><Zap className="h-3.5 w-3.5" />Автоматизация</TabsTrigger>
            <TabsTrigger value="notes"       className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs"><StickyNote className="h-3.5 w-3.5" />Заметки</TabsTrigger>
          </TabsList>

          <TabsContent value="overview"   className="mt-4"><TabOverview onTabChange={setActiveTab} /></TabsContent>
          <TabsContent value="inbox"      className="mt-4">
            <Card className="card-surface no-lift border-border/60">
              <CardHeader>
                <CardTitle>Входящие обращения (Support Inbox)</CardTitle>
                <CardDescription>Тикеты, переписка с лейблами и артистами, внутренние заметки к тикетам</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">Полный Inbox с поиском, фильтрами и просмотром тредов находится в разделе Поддержки.</p>
                <Button onClick={() => (window.location.href = "/support")}><LifeBuoy className="w-4 h-4 mr-2" />Открыть Support Inbox</Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="templates"  className="mt-4"><TabTemplates /></TabsContent>
          <TabsContent value="campaigns"  className="mt-4"><TabCampaigns templates={templates} /></TabsContent>
          <TabsContent value="automation" className="mt-4"><TabAutomation templates={templates} /></TabsContent>
          <TabsContent value="notes"      className="mt-4"><TabNotes /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
