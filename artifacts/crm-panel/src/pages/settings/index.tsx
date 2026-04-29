import { Layout } from "@/components/layout";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast, toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  ScrollText, Activity as ActivityIcon, Globe2, Copy, RefreshCcw,
  CheckCircle2, AlertTriangle, Unplug, FlaskConical, Settings2, Lock,
  FileCode2, Key, Webhook, CreditCard, DollarSign, ShieldCheck,
  HardDrive, Bell, Plus, Trash2, Eye, EyeOff, Save,
  User as UserIcon, KeyRound, BellRing, ExternalLink,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { IntegrationConfigDialog } from "@/components/integration-config-dialog";
import { TabManagerPermissions } from "./manager-permissions-tab";
import { useLocation } from "wouter";

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

// ─── Types ───────────────────────────────────────────────────────────────────

interface IntegrationRow {
  id: number; code: string; name: string; category: string; authType: string;
  enabled: boolean; status: string; lastSyncAt: string | null; lastError: string | null;
  hasCredentials: boolean; config?: Record<string, unknown>;
}

interface AuditRow {
  id: number; userId: number | null; userEmail: string | null; userRole: string | null;
  action: string; entityType: string; entityId: number | null;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  diff: Array<{ field: string; old: unknown; new: unknown }> | null;
  ip: string | null; userAgent: string | null; requestId: string | null; createdAt: string;
}

interface AuditFacets {
  entityTypes: string[];
  actions: string[];
  users: Array<{ id: number; name: string; email: string }>;
}

interface ActivityRow {
  id: number; type: string; title: string; description: string; timestamp: string;
  entityType: string | null; entityId: number | null;
}

interface ApiKeyRow {
  id: number; name: string; keyPrefix: string; permissions: string[];
  enabled: boolean; lastUsedAt: string | null; expiresAt: string | null; createdAt: string;
}

interface WebhookRow {
  id: number; name: string; url: string; events: string[]; enabled: boolean;
  retryCount: number; timeoutMs: number; lastTriggeredAt: string | null;
  lastStatus: number | null; lastError: string | null; hasSecret: boolean; createdAt: string;
}

// ─── Shared form helper ──────────────────────────────────────────────────────

function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="card-surface no-lift border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid grid-cols-[220px_1fr] items-start gap-4 py-2 border-b border-border/30 last:border-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─── Tab: General Settings ───────────────────────────────────────────────────

function TabGeneral() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});

  useEffect(() => {
    api<{ value: Record<string, unknown> }>("/api/settings/general").then((r) => {
      setForm(r.value);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const f = (k: string) => (form[k] ?? "") as string;
  const b = (k: string) => (form[k] ?? false) as boolean;
  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/settings/general", { method: "PUT", body: JSON.stringify(form) });
      toast({ title: "Настройки сохранены" });
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка сохранения", description: (e as Error).message });
    } finally { setSaving(false); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SettingsSection title="Основные настройки платформы">
        <FieldRow label="Название платформы"><Input value={f("platformName")} onChange={(e) => set("platformName", e.target.value)} /></FieldRow>
        <FieldRow label="Email поддержки"><Input type="email" value={f("supportEmail")} onChange={(e) => set("supportEmail", e.target.value)} /></FieldRow>
        <FieldRow label="Email администратора"><Input type="email" value={f("contactEmail")} onChange={(e) => set("contactEmail", e.target.value)} /></FieldRow>
        <FieldRow label="Часовой пояс">
          <Select value={f("timezone")} onValueChange={(v) => set("timezone", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Asia/Dushanbe">Asia/Dushanbe (UTC+5)</SelectItem>
              <SelectItem value="Europe/Moscow">Europe/Moscow (UTC+3)</SelectItem>
              <SelectItem value="UTC">UTC</SelectItem>
              <SelectItem value="Europe/Berlin">Europe/Berlin (UTC+1/2)</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Язык интерфейса">
          <Select value={f("language")} onValueChange={(v) => set("language", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ru">Русский</SelectItem>
              <SelectItem value="tg">Тоҷикӣ</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="URL логотипа" hint="Ссылка на изображение логотипа"><Input value={f("logoUrl")} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…/logo.png" /></FieldRow>
        <FieldRow label="Основной цвет" hint="HEX-цвет акцента платформы"><Input value={f("primaryColor")} onChange={(e) => set("primaryColor", e.target.value)} placeholder="#6d28d9" className="font-mono" /></FieldRow>
      </SettingsSection>
      <SettingsSection title="Режим работы">
        <FieldRow label="Режим обслуживания" hint="Если включён — только администраторы могут войти">
          <Switch checked={b("maintenanceMode")} onCheckedChange={(v) => set("maintenanceMode", v)} />
        </FieldRow>
        <FieldRow label="Открытая регистрация" hint="Разрешить самостоятельную регистрацию новых пользователей">
          <Switch checked={b("registrationOpen")} onCheckedChange={(v) => set("registrationOpen", v)} />
        </FieldRow>
      </SettingsSection>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? "Сохраняем…" : "Сохранить"}</Button>
      </div>
    </div>
  );
}

// ─── Tab: Security Settings ──────────────────────────────────────────────────

function TabSecurity() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [ipInput, setIpInput] = useState("");

  useEffect(() => {
    api<{ value: Record<string, unknown> }>("/api/settings/security").then((r) => {
      setForm(r.value);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const f = (k: string) => (form[k] ?? "") as string;
  const n = (k: string) => (form[k] ?? 0) as number;
  const b = (k: string) => (form[k] ?? false) as boolean;
  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));
  const ipList = (form.ipWhitelist ?? []) as string[];

  const addIp = () => {
    const ip = ipInput.trim();
    if (!ip || ipList.includes(ip)) return;
    set("ipWhitelist", [...ipList, ip]);
    setIpInput("");
  };

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/settings/security", { method: "PUT", body: JSON.stringify(form) });
      toast({ title: "Настройки безопасности сохранены" });
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setSaving(false); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SettingsSection title="Сессии и авторизация">
        <FieldRow label="Таймаут сессии (мин)" hint="0 = без ограничений">
          <Input type="number" min={0} value={n("sessionTimeoutMinutes")} onChange={(e) => set("sessionTimeoutMinutes", Number(e.target.value))} className="w-36" />
        </FieldRow>
        <FieldRow label="Макс. попыток входа">
          <Input type="number" min={1} max={20} value={n("maxLoginAttempts")} onChange={(e) => set("maxLoginAttempts", Number(e.target.value))} className="w-36" />
        </FieldRow>
        <FieldRow label="Блокировка (мин)">
          <Input type="number" min={1} value={n("lockoutDurationMinutes")} onChange={(e) => set("lockoutDurationMinutes", Number(e.target.value))} className="w-36" />
        </FieldRow>
        <FieldRow label="Обязательная 2FA" hint="Флаг сохранится, но фактическое подтверждение второго фактора пока не реализовано">
          <div className="flex items-center gap-2">
            <Switch checked={b("require2FA")} onCheckedChange={(v) => set("require2FA", v)} disabled />
            <Badge variant="outline" className="text-xs">Скоро (требует доработки)</Badge>
          </div>
        </FieldRow>
      </SettingsSection>

      <SettingsSection title="Требования к паролю">
        <FieldRow label="Минимальная длина">
          <Input type="number" min={6} max={32} value={n("passwordMinLength")} onChange={(e) => set("passwordMinLength", Number(e.target.value))} className="w-24" />
        </FieldRow>
        <FieldRow label="Заглавные буквы"><Switch checked={b("passwordRequireUppercase")} onCheckedChange={(v) => set("passwordRequireUppercase", v)} /></FieldRow>
        <FieldRow label="Цифры"><Switch checked={b("passwordRequireNumbers")} onCheckedChange={(v) => set("passwordRequireNumbers", v)} /></FieldRow>
        <FieldRow label="Спецсимволы"><Switch checked={b("passwordRequireSpecial")} onCheckedChange={(v) => set("passwordRequireSpecial", v)} /></FieldRow>
      </SettingsSection>

      <SettingsSection title="IP Whitelist" description="Оставьте пустым для разрешения со всех адресов">
        <div className="flex gap-2 mb-3">
          <Input className="w-56 font-mono" value={ipInput} onChange={(e) => setIpInput(e.target.value)}
            placeholder="192.168.1.0/24" onKeyDown={(e) => e.key === "Enter" && addIp()} />
          <Button variant="outline" onClick={addIp}><Plus className="w-4 h-4 mr-1" />Добавить</Button>
        </div>
        {ipList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ipList.map((ip) => (
              <Badge key={ip} variant="outline" className="font-mono gap-1">
                {ip}
                <button className="ml-1 text-muted-foreground hover:text-destructive" onClick={() => set("ipWhitelist", ipList.filter((x) => x !== ip))}>×</button>
              </Badge>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Хранение логов">
        <FieldRow label="Хранить аудит (дней)" hint="Записи старше будут удалены при очистке">
          <Input type="number" min={30} max={3650} value={n("auditRetentionDays")} onChange={(e) => set("auditRetentionDays", Number(e.target.value))} className="w-36" />
        </FieldRow>
      </SettingsSection>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? "Сохраняем…" : "Сохранить"}</Button>
      </div>
    </div>
  );
}

// ─── Tab: File Storage ───────────────────────────────────────────────────────

function TabStorage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});

  useEffect(() => {
    api<{ value: Record<string, unknown> }>("/api/settings/storage").then((r) => {
      setForm(r.value); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const f = (k: string) => (form[k] ?? "") as string;
  const n = (k: string) => (form[k] ?? 0) as number;
  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/settings/storage", { method: "PUT", body: JSON.stringify(form) });
      toast({ title: "Настройки хранилища сохранены" });
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setSaving(false); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SettingsSection title="Провайдер хранилища">
        <FieldRow label="Провайдер">
          <Select value={f("provider")} onValueChange={(v) => set("provider", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Локальная файловая система</SelectItem>
              <SelectItem value="s3">AWS S3 / S3-совместимый</SelectItem>
              <SelectItem value="cdn">CDN (только раздача)</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
        {f("provider") === "local" && (
          <FieldRow label="Путь на сервере"><Input value={f("localBasePath")} onChange={(e) => set("localBasePath", e.target.value)} className="font-mono" /></FieldRow>
        )}
        {f("provider") === "s3" && (
          <>
            <FieldRow label="S3 Bucket"><Input value={f("s3Bucket")} onChange={(e) => set("s3Bucket", e.target.value)} className="font-mono" /></FieldRow>
            <FieldRow label="S3 Region"><Input value={f("s3Region")} onChange={(e) => set("s3Region", e.target.value)} className="font-mono" /></FieldRow>
            <FieldRow label="Key Prefix"><Input value={f("s3KeyPrefix")} onChange={(e) => set("s3KeyPrefix", e.target.value)} className="font-mono" /></FieldRow>
          </>
        )}
        <FieldRow label="CDN Base URL" hint="Если пусто — отдаётся через API"><Input value={f("cdnBaseUrl")} onChange={(e) => set("cdnBaseUrl", e.target.value)} placeholder="https://cdn.example.com" /></FieldRow>
      </SettingsSection>

      <SettingsSection title="Ограничения файлов">
        <FieldRow label="Макс. размер файла (МБ)">
          <Input type="number" min={1} value={n("maxFileSizeMb")} onChange={(e) => set("maxFileSizeMb", Number(e.target.value))} className="w-32" />
        </FieldRow>
        <FieldRow label="Форматы аудио" hint="Через запятую"><Input value={(form.allowedAudioFormats as string[] ?? []).join(", ")} onChange={(e) => set("allowedAudioFormats", e.target.value.split(",").map((s) => s.trim()))} className="font-mono" /></FieldRow>
        <FieldRow label="Форматы изображений" hint="Через запятую"><Input value={(form.allowedImageFormats as string[] ?? []).join(", ")} onChange={(e) => set("allowedImageFormats", e.target.value.split(",").map((s) => s.trim()))} className="font-mono" /></FieldRow>
      </SettingsSection>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? "Сохраняем…" : "Сохранить"}</Button>
      </div>
    </div>
  );
}

// ─── Tab: Notifications ──────────────────────────────────────────────────────

function TabNotifications() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    api<{ value: Record<string, unknown> }>("/api/settings/notifications").then((r) => {
      setForm(r.value); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const f = (k: string) => (form[k] ?? "") as string;
  const n = (k: string) => (form[k] ?? 0) as number;
  const b = (k: string) => (form[k] ?? false) as boolean;
  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/settings/notifications", { method: "PUT", body: JSON.stringify(form) });
      toast({ title: "Настройки уведомлений сохранены" });
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setSaving(false); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SettingsSection title="Email / SMTP">
        <FieldRow label="Включить Email"><Switch checked={b("emailEnabled")} onCheckedChange={(v) => set("emailEnabled", v)} /></FieldRow>
        <FieldRow label="SMTP Host"><Input value={f("smtpHost")} onChange={(e) => set("smtpHost", e.target.value)} className="font-mono" placeholder="smtp.mailgun.org" /></FieldRow>
        <FieldRow label="SMTP Port"><Input type="number" value={n("smtpPort")} onChange={(e) => set("smtpPort", Number(e.target.value))} className="w-28 font-mono" /></FieldRow>
        <FieldRow label="SMTP Пользователь"><Input value={f("smtpUser")} onChange={(e) => set("smtpUser", e.target.value)} className="font-mono" /></FieldRow>
        <FieldRow label="SMTP Пароль">
          <div className="flex gap-2">
            <Input type={showPwd ? "text" : "password"} value={f("smtpPassword")} onChange={(e) => set("smtpPassword", e.target.value)} className="font-mono" placeholder="(не сохранён)" />
            <Button variant="ghost" size="icon" onClick={() => setShowPwd((p) => !p)}>{showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
          </div>
        </FieldRow>
        <FieldRow label="TLS/STARTTLS"><Switch checked={b("smtpTls")} onCheckedChange={(v) => set("smtpTls", v)} /></FieldRow>
        <FieldRow label="From Address"><Input type="email" value={f("smtpFromAddress")} onChange={(e) => set("smtpFromAddress", e.target.value)} /></FieldRow>
        <FieldRow label="From Name"><Input value={f("smtpFromName")} onChange={(e) => set("smtpFromName", e.target.value)} /></FieldRow>
      </SettingsSection>

      <SettingsSection title="Push-уведомления">
        <FieldRow label="Включить Push"><Switch checked={b("pushEnabled")} onCheckedChange={(v) => set("pushEnabled", v)} /></FieldRow>
        <FieldRow label="VAPID Public Key" hint="Web Push"><Input value={f("pushVapidPublicKey")} onChange={(e) => set("pushVapidPublicKey", e.target.value)} className="font-mono text-xs" /></FieldRow>
      </SettingsSection>

      <SettingsSection title="Типы событий">
        <FieldRow label="Новый релиз"><Switch checked={b("notifyOnNewRelease")} onCheckedChange={(v) => set("notifyOnNewRelease", v)} /></FieldRow>
        <FieldRow label="Платёж"><Switch checked={b("notifyOnPayment")} onCheckedChange={(v) => set("notifyOnPayment", v)} /></FieldRow>
        <FieldRow label="KYC обновление"><Switch checked={b("notifyOnKyc")} onCheckedChange={(v) => set("notifyOnKyc", v)} /></FieldRow>
        <FieldRow label="DDEX доставка"><Switch checked={b("notifyOnDelivery")} onCheckedChange={(v) => set("notifyOnDelivery", v)} /></FieldRow>
      </SettingsSection>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? "Сохраняем…" : "Сохранить"}</Button>
      </div>
    </div>
  );
}

// ─── Tab: Currency / Tax ─────────────────────────────────────────────────────

function TabCurrency() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});

  useEffect(() => {
    api<{ value: Record<string, unknown> }>("/api/settings/currency").then((r) => {
      setForm(r.value); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const f = (k: string) => (form[k] ?? "") as string;
  const n = (k: string) => (form[k] ?? 0) as number;
  const b = (k: string) => (form[k] ?? false) as boolean;
  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/settings/currency", { method: "PUT", body: JSON.stringify(form) });
      toast({ title: "Настройки валюты сохранены" });
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setSaving(false); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SettingsSection title="Валюты">
        <FieldRow label="Валюта по умолчанию">
          <Select value={f("defaultCurrency")} onValueChange={(v) => set("defaultCurrency", v)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["USD", "EUR", "RUB", "TJS", "GBP"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Доступные валюты" hint="Через запятую">
          <Input value={(form.supportedCurrencies as string[] ?? []).join(", ")} onChange={(e) => set("supportedCurrencies", e.target.value.split(",").map((s) => s.trim()))} className="font-mono" />
        </FieldRow>
        <FieldRow label="Обновление курсов">
          <Select value={f("fxUpdateFrequency")} onValueChange={(v) => set("fxUpdateFrequency", v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Каждый час</SelectItem>
              <SelectItem value="daily">Ежедневно</SelectItem>
              <SelectItem value="manual">Вручную</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
      </SettingsSection>

      <SettingsSection title="Налоги">
        <FieldRow label="Включить налоги"><Switch checked={b("taxEnabled")} onCheckedChange={(v) => set("taxEnabled", v)} /></FieldRow>
        <FieldRow label="Ставка налога (%)">
          <Input type="number" min={0} max={100} step={0.1} value={n("taxRate")} onChange={(e) => set("taxRate", Number(e.target.value))} className="w-28" />
        </FieldRow>
        <FieldRow label="Название налога" hint="Например: НДС, VAT, GST"><Input value={f("taxLabel")} onChange={(e) => set("taxLabel", e.target.value)} className="w-40" /></FieldRow>
        <FieldRow label="Налог включён в цену"><Switch checked={b("taxIncluded")} onCheckedChange={(v) => set("taxIncluded", v)} /></FieldRow>
      </SettingsSection>

      <SettingsSection title="Выплаты роялти">
        <FieldRow label="Минимум выплаты (USD)" hint="Ниже этой суммы — не выплачивается">
          <Input type="number" min={0} value={n("royaltyPayoutThreshold")} onChange={(e) => set("royaltyPayoutThreshold", Number(e.target.value))} className="w-28" />
        </FieldRow>
        <FieldRow label="Валюты выплат" hint="Через запятую">
          <Input value={(form.payoutCurrencies as string[] ?? []).join(", ")} onChange={(e) => set("payoutCurrencies", e.target.value.split(",").map((s) => s.trim()))} className="font-mono w-52" />
        </FieldRow>
      </SettingsSection>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? "Сохраняем…" : "Сохранить"}</Button>
      </div>
    </div>
  );
}

// ─── Tab: API Keys & Webhooks ─────────────────────────────────────────────────

const ALL_EVENTS = [
  "release.status_changed", "release.published", "delivery.sent", "delivery.acked",
  "payment.completed", "payment.failed", "kyc.approved", "kyc.rejected",
  "user.registered", "rights.conflict_detected",
];

const ALL_PERMISSIONS = [
  "read:releases", "write:releases", "read:artists", "read:royalties",
  "write:royalties", "read:deliveries", "write:deliveries", "read:finance",
];

function TabApiKeys() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>([]);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api<{ data: ApiKeyRow[] }>("/api/api-keys"); setKeys(r.data); }
    catch (e) { toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const createKey = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await api<{ rawKey: string } & ApiKeyRow>("/api/api-keys", { method: "POST", body: JSON.stringify({ name: newName.trim(), permissions: newPerms }) });
      setRawKey(r.rawKey);
      setNewName(""); setNewPerms([]);
      void load();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка создания ключа", description: (e as Error).message });
    } finally { setCreating(false); }
  };

  const deleteKey = async (id: number) => {
    try {
      await api(`/api/api-keys/${id}`, { method: "DELETE" });
      setKeys((p) => p.filter((k) => k.id !== id));
      toast({ title: "Ключ удалён" });
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    }
  };

  const toggleKey = async (row: ApiKeyRow) => {
    try {
      await api(`/api/api-keys/${row.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !row.enabled }) });
      setKeys((p) => p.map((k) => k.id === row.id ? { ...k, enabled: !k.enabled } : k));
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <SettingsSection title="API-ключи" description="Для внешних интеграций и автоматизации. Секретная часть ключа показывается однократно при создании.">
        <div className="flex justify-end mb-3">
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />Создать ключ</Button>
        </div>
        {loading ? <Skeleton className="h-32 w-full" /> : keys.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">API-ключей нет</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Префикс</TableHead>
                <TableHead>Права</TableHead>
                <TableHead>Последнее использование</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell><code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">{k.keyPrefix}…</code></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {k.permissions.slice(0, 3).map((p) => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}
                      {k.permissions.length > 3 && <Badge variant="outline" className="text-[10px]">+{k.permissions.length - 3}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(k.lastUsedAt)}</TableCell>
                  <TableCell><Switch checked={k.enabled} onCheckedChange={() => toggleKey(k)} /></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => deleteKey(k.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SettingsSection>

      {/* Webhooks section */}
      <TabWebhooksInner />

      {/* Create key dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Создать API-ключ</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-sm font-medium">Название</label><Input className="mt-1" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Automation Key" /></div>
            <div>
              <label className="text-sm font-medium">Права доступа</label>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {ALL_PERMISSIONS.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={newPerms.includes(p)} onChange={(e) => setNewPerms((prev) => e.target.checked ? [...prev, p] : prev.filter((x) => x !== p))} />
                    <span className="font-mono text-xs">{p}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Отмена</Button>
            <Button onClick={createKey} disabled={creating || !newName.trim()}>{creating ? "Создаём…" : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raw key reveal dialog */}
      <Dialog open={!!rawKey} onOpenChange={() => setRawKey(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Key className="w-4 h-4 text-amber-500" />Сохраните ключ немедленно</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Ключ показывается только один раз. После закрытия этого окна восстановить его невозможно.</p>
            <div className="relative">
              <Input readOnly value={rawKey ?? ""} className="font-mono text-xs pr-10 bg-amber-500/5 border-amber-500/30" />
              <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7"
                onClick={() => { navigator.clipboard?.writeText(rawKey ?? ""); toast({ title: "Скопировано" }); }}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <DialogFooter><Button onClick={() => setRawKey(null)}>Закрыть</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabWebhooksInner() {
  const { toast } = useToast();
  const [hooks, setHooks] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<WebhookRow | null>(null);
  const [form, setForm] = useState({ name: "", url: "", secret: "", events: [] as string[], enabled: true, retryCount: 3, timeoutMs: 5000 });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api<{ data: WebhookRow[] }>("/api/webhooks"); setHooks(r.data); }
    catch { /* noop */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditRow(null);
    setForm({ name: "", url: "", secret: "", events: [], enabled: true, retryCount: 3, timeoutMs: 5000 });
    setShowCreate(true);
  };

  const openEdit = (row: WebhookRow) => {
    setEditRow(row);
    setForm({ name: row.name, url: row.url, secret: "", events: row.events, enabled: row.enabled, retryCount: row.retryCount, timeoutMs: row.timeoutMs });
    setShowCreate(true);
  };

  const saveHook = async () => {
    if (!form.name.trim() || !form.url.trim()) return;
    setSaving(true);
    try {
      const body = { ...form, secret: form.secret || undefined };
      if (editRow) { await api(`/api/webhooks/${editRow.id}`, { method: "PUT", body: JSON.stringify(body) }); }
      else { await api("/api/webhooks", { method: "POST", body: JSON.stringify(body) }); }
      toast({ title: editRow ? "Webhook обновлён" : "Webhook создан" });
      setShowCreate(false);
      void load();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setSaving(false); }
  };

  const deleteHook = async (id: number) => {
    try {
      await api(`/api/webhooks/${id}`, { method: "DELETE" });
      setHooks((p) => p.filter((h) => h.id !== id));
      toast({ title: "Webhook удалён" });
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message }); }
  };

  const testHook = async (id: number) => {
    try {
      const r = await api<{ ok: boolean; status: number | null; message: string }>(`/api/webhooks/${id}/test`, { method: "POST" });
      toast({ variant: r.ok ? "default" : "destructive", title: r.ok ? "Ping успешен" : "Ping не прошёл", description: r.message });
      void load();
    } catch (e) { toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message }); }
  };

  return (
    <SettingsSection title="Webhooks" description="Автоматические HTTP-колбэки при событиях платформы">
      <div className="flex justify-end mb-3">
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Добавить webhook</Button>
      </div>
      {loading ? <Skeleton className="h-24 w-full" /> : hooks.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">Webhooks не настроены</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>События</TableHead>
              <TableHead>Последний вызов</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hooks.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="font-medium">{h.name}</TableCell>
                <TableCell><code className="text-xs font-mono break-all">{h.url.slice(0, 40)}{h.url.length > 40 ? "…" : ""}</code></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {h.events.slice(0, 2).map((e) => <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>)}
                    {h.events.length > 2 && <Badge variant="outline" className="text-[10px]">+{h.events.length - 2}</Badge>}
                    {h.events.length === 0 && <span className="text-xs text-muted-foreground">все</span>}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {h.lastTriggeredAt ? (
                    <span className={h.lastStatus && h.lastStatus < 400 ? "text-emerald-500" : "text-red-500"}>{fmtDate(h.lastTriggeredAt)} · {h.lastStatus ?? "—"}</span>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell><Switch checked={h.enabled} onCheckedChange={async (v) => { await api(`/api/webhooks/${h.id}`, { method: "PUT", body: JSON.stringify({ enabled: v }) }); void load(); }} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => testHook(h.id)}><FlaskConical className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(h)}><Settings2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteHook(h.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editRow ? "Редактировать webhook" : "Новый webhook"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-sm font-medium">Название</label><Input className="mt-1" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div><label className="text-sm font-medium">URL</label><Input className="mt-1 font-mono" value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} placeholder="https://…/webhook" /></div>
            <div><label className="text-sm font-medium">Секрет подписи (опционально)</label><Input type="password" className="mt-1 font-mono" value={form.secret} onChange={(e) => setForm((p) => ({ ...p, secret: e.target.value }))} placeholder={editRow?.hasSecret ? "(изменить — оставьте пустым чтобы не менять)" : ""} /></div>
            <div>
              <label className="text-sm font-medium block mb-2">События</label>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={form.events.includes(ev)} onChange={(e) => setForm((p) => ({ ...p, events: e.target.checked ? [...p.events, ev] : p.events.filter((x) => x !== ev) }))} />
                    <span className="font-mono">{ev}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Retry count</label><Input type="number" min={0} max={10} className="mt-1" value={form.retryCount} onChange={(e) => setForm((p) => ({ ...p, retryCount: Number(e.target.value) }))} /></div>
              <div><label className="text-sm font-medium">Timeout (ms)</label><Input type="number" min={1000} className="mt-1" value={form.timeoutMs} onChange={(e) => setForm((p) => ({ ...p, timeoutMs: Number(e.target.value) }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Отмена</Button>
            <Button onClick={saveHook} disabled={saving || !form.name.trim() || !form.url.trim()}>{saving ? "Сохраняем…" : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

// ─── Tab: DSP Configuration ──────────────────────────────────────────────────

function TabDsp({ integrations, intLoading, onRefresh, onConfigure, onToggle, onTest, intBusy }:
  { integrations: IntegrationRow[]; intLoading: boolean; onRefresh: () => void; onConfigure: (r: IntegrationRow) => void; onToggle: (r: IntegrationRow, v: boolean) => void; onTest: (r: IntegrationRow) => void; intBusy: string | null }) {
  const dsp = integrations.filter((i) => i.category === "dsp");
  return (
    <Card className="card-surface no-lift border-border/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Настройка DSP-платформ</CardTitle>
          <CardDescription>Подключение Spotify, Apple Music, TikTok и других платформ. Правила доставки, территории, комиссии.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={intLoading}><RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${intLoading ? "animate-spin" : ""}`} />Обновить</Button>
      </CardHeader>
      <CardContent className="p-0">
        {intLoading ? <div className="p-6"><Skeleton className="h-48 w-full" /></div> : dsp.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">DSP-интеграции не настроены</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Платформа</TableHead><TableHead>Auth</TableHead>
              <TableHead>Последняя синхр.</TableHead><TableHead>Статус</TableHead>
              <TableHead>Включён</TableHead><TableHead className="text-right">Действия</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {dsp.map((d) => {
                const busy = intBusy === d.code;
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Globe2 className="h-3.5 w-3.5 text-primary/70" />
                        <span className="font-medium text-sm">{d.name}</span>
                        <code className="text-[10px] text-muted-foreground font-mono">{d.code}</code>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] uppercase">{d.authType}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(d.lastSyncAt)}</TableCell>
                    <TableCell>
                      {d.status === "connected" && <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10 border-emerald-500/20"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Connected</Badge>}
                      {d.status === "disconnected" && <Badge variant="outline" className="text-[10px] text-muted-foreground"><Unplug className="h-2.5 w-2.5 mr-1" />Disconnected</Badge>}
                      {d.status === "error" && <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10"><AlertTriangle className="h-2.5 w-2.5 mr-1" />Error</Badge>}
                    </TableCell>
                    <TableCell><Switch checked={d.enabled} disabled={busy} onCheckedChange={(v) => onToggle(d, v)} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => onConfigure(d)}><Settings2 className="h-3.5 w-3.5 mr-1" />Настроить</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => onTest(d)}><FlaskConical className="h-3.5 w-3.5 mr-1" />Тест</Button>
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
  );
}

// ─── Tab: Payment Gateways ───────────────────────────────────────────────────

function TabPayment({ integrations, intLoading, onRefresh, onConfigure, onToggle, onTest, intBusy }:
  { integrations: IntegrationRow[]; intLoading: boolean; onRefresh: () => void; onConfigure: (r: IntegrationRow) => void; onToggle: (r: IntegrationRow, v: boolean) => void; onTest: (r: IntegrationRow) => void; intBusy: string | null }) {
  const payment = integrations.filter((i) => i.category === "payment" || i.category === "payment_gateway");
  return (
    <div className="space-y-4">
      <Card className="card-surface no-lift border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Платёжные системы</CardTitle>
            <CardDescription>Подключение Stripe, PayPal, платёжных шлюзов. Настройки транзакций и выплат.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={intLoading}><RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${intLoading ? "animate-spin" : ""}`} />Обновить</Button>
        </CardHeader>
        <CardContent className="p-0">
          {intLoading ? <div className="p-6"><Skeleton className="h-32 w-full" /></div> : payment.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              Платёжных интеграций нет. Добавьте их в разделе DDEX &amp; DSP выбрав категорию <code className="font-mono">payment</code>.
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Шлюз</TableHead><TableHead>Статус</TableHead>
                <TableHead>Включён</TableHead><TableHead className="text-right">Действия</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {payment.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell><span className="font-medium">{d.name}</span><code className="ml-2 text-xs text-muted-foreground font-mono">{d.code}</code></TableCell>
                    <TableCell>
                      {d.status === "connected" && <Badge className="text-[10px] text-emerald-400 bg-emerald-500/10"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Connected</Badge>}
                      {d.status !== "connected" && <Badge className="text-[10px] text-muted-foreground"><Unplug className="h-2.5 w-2.5 mr-1" />{d.status}</Badge>}
                    </TableCell>
                    <TableCell><Switch checked={d.enabled} onCheckedChange={(v) => onToggle(d, v)} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => onConfigure(d)}><Settings2 className="h-3.5 w-3.5 mr-1" />Настроить</Button>
                      <Button variant="ghost" size="sm" onClick={() => onTest(d)}><FlaskConical className="h-3.5 w-3.5 mr-1" />Тест</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: DDEX Integration ────────────────────────────────────────────────────

function TabDdex({ integrations, intLoading, onRefresh, onConfigure, onToggle, onTest, intBusy }:
  { integrations: IntegrationRow[]; intLoading: boolean; onRefresh: () => void; onConfigure: (r: IntegrationRow) => void; onToggle: (r: IntegrationRow, v: boolean) => void; onTest: (r: IntegrationRow) => void; intBusy: string | null }) {
  const delivery = integrations.filter((i) => i.category === "delivery");
  const { toast } = useToast();
  return (
    <div className="space-y-4">
      <Card className="card-surface no-lift border-border/60">
        <CardHeader>
          <CardTitle>DDEX Party Identification</CardTitle>
          <CardDescription>Параметры лейбла для XML-доставок ERN 4.3</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">DDEX Party ID (DPID)</label>
            <div className="flex gap-2">
              <Input value="PA-DPIDA-2024053004-T" readOnly className="bg-background/50 font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard?.writeText("PA-DPIDA-2024053004-T"); toast({ title: "Скопировано" }); }}><Copy className="h-3.5 w-3.5" /></Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Issued by DDEX, registered 2024-05-30</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Default ERN Version</label>
            <Input value="ERN 4.3" readOnly className="bg-background/50 font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ISRC Prefix</label>
            <Input value="TJ-MUS-26" readOnly className="bg-background/50 font-mono" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">UPC Prefix</label>
            <Input value="888002" readOnly className="bg-background/50 font-mono" />
          </div>
        </CardContent>
      </Card>

      <Card className="card-surface no-lift border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>DDEX-партнёры (транспорты)</CardTitle>
            <CardDescription>SFTP/HTTPS эндпоинты для доставки ERN-батчей</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={intLoading}><RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${intLoading ? "animate-spin" : ""}`} />Обновить</Button>
        </CardHeader>
        <CardContent className="p-0">
          {intLoading ? <div className="p-6"><Skeleton className="h-32 w-full" /></div> : delivery.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Нет DDEX-транспортов</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Партнёр</TableHead><TableHead>Auth</TableHead>
                <TableHead>Статус</TableHead><TableHead>Включён</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {delivery.map((d) => {
                  const busy = intBusy === d.code;
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileCode2 className="h-3.5 w-3.5 text-primary/70" />
                          <span className="font-medium">{d.name}</span>
                          <code className="text-[10px] font-mono text-muted-foreground">{d.code}</code>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] uppercase">{d.authType}</Badge></TableCell>
                      <TableCell>
                        {d.status === "connected" && <Badge variant="outline" className="text-[10px] text-emerald-400 bg-emerald-500/10"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Connected</Badge>}
                        {d.status !== "connected" && <Badge variant="outline" className="text-[10px] text-muted-foreground"><Unplug className="h-2.5 w-2.5 mr-1" />{d.status}</Badge>}
                      </TableCell>
                      <TableCell><Switch checked={d.enabled} disabled={busy} onCheckedChange={(v) => onToggle(d, v)} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => onConfigure(d)}><Settings2 className="h-3.5 w-3.5 mr-1" />Настроить</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => onTest(d)}><FlaskConical className="h-3.5 w-3.5 mr-1" />Тест</Button>
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
    </div>
  );
}

// ─── Tab: Audit Log ──────────────────────────────────────────────────────────

function TabAudit() {
  const { toast } = useToast();
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState<AuditFacets | null>(null);
  const [fEntity, setFEntity] = useState("");
  const [fAction, setFAction] = useState("");
  const [fUser, setFUser] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fEntity) params.set("entity_type", fEntity);
      if (fAction) params.set("action", fAction);
      if (fUser) params.set("user_id", fUser);
      if (fFrom) params.set("from", new Date(`${fFrom}T00:00:00.000Z`).toISOString());
      if (fTo) params.set("to", new Date(`${fTo}T23:59:59.999Z`).toISOString());
      params.set("limit", "100");
      const r = await api<{ data: AuditRow[]; pagination: { total: number } }>(`/api/audit?${params}`);
      setAudit(r.data);
      setAuditTotal(r.pagination.total);
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setLoading(false); }
  }, [fEntity, fAction, fUser, fFrom, fTo, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api<AuditFacets>("/api/audit/facets").then(setFacets).catch(() => { /* optional */ });
  }, []);

  const fmtVal = (v: unknown): string => {
    if (v === null || v === undefined) return "∅";
    if (typeof v === "string") return v.length > 80 ? v.slice(0, 77) + "…" : v;
    try { return JSON.stringify(v); } catch { return String(v); }
  };
  const toggle = (id: number) => setExpanded((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearFilters = () => { setFEntity(""); setFAction(""); setFUser(""); setFFrom(""); setFTo(""); };

  return (
    <Card className="card-surface no-lift border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>Аудит-лог</CardTitle>
          <CardDescription>Полная история изменений · {auditTotal} записей</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Обновить</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Сущность</label>
            <select value={fEntity} onChange={(e) => setFEntity(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border">
              <option value="">Все</option>
              {(facets?.entityTypes ?? []).map((et) => <option key={et} value={et}>{et}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Действие</label>
            <select value={fAction} onChange={(e) => setFAction(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border">
              <option value="">Все</option>
              {(facets?.actions ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Пользователь</label>
            <select value={fUser} onChange={(e) => setFUser(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border">
              <option value="">Все</option>
              {(facets?.users ?? []).map((u) => <option key={u.id} value={String(u.id)}>{u.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">С</label>
            <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">По</label>
            <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-background/50 border border-border" />
          </div>
        </div>
        {(fEntity || fAction || fUser || fFrom || fTo) && (
          <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={clearFilters}>Сбросить фильтры</Button></div>
        )}

        {loading ? <Skeleton className="h-48 w-full" /> : (audit?.length ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">Записей нет</div>
        ) : (
          <div className="rounded-md border border-border/60 overflow-hidden">
            <Table>
              <TableHeader className="bg-background/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Когда</TableHead><TableHead>Кто</TableHead>
                  <TableHead>Действие</TableHead><TableHead>Сущность</TableHead>
                  <TableHead>Изменений</TableHead><TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(audit ?? []).map((row) => {
                  const open = expanded.has(row.id);
                  const diffCount = row.diff?.length ?? 0;
                  return (
                    <Fragment key={row.id}>
                      <TableRow className="hover:bg-accent/20 cursor-pointer" onClick={() => toggle(row.id)}>
                        <TableCell className="text-xs text-muted-foreground">{open ? "▾" : "▸"}</TableCell>
                        <TableCell className="text-xs font-mono whitespace-nowrap">{fmtDate(row.createdAt)}</TableCell>
                        <TableCell className="text-xs">
                          {row.userEmail ?? <span className="text-muted-foreground">—</span>}
                          {row.userRole && <span className="ml-1 text-[10px] text-muted-foreground">({row.userRole})</span>}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] font-mono">{row.action}</Badge></TableCell>
                        <TableCell className="text-xs font-mono">{row.entityType}{row.entityId !== null && <span className="text-muted-foreground">#{row.entityId}</span>}</TableCell>
                        <TableCell className="text-xs">{diffCount > 0 ? <span className="text-primary">{diffCount}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{row.ip ?? "—"}</TableCell>
                      </TableRow>
                      {open && (
                        <TableRow key={`${row.id}-d`} className="bg-background/30 hover:bg-background/30">
                          <TableCell colSpan={7} className="p-4">
                            {diffCount === 0 ? (
                              <div className="text-xs text-muted-foreground">Нет изменений полей</div>
                            ) : (
                              <div className="grid gap-1.5">
                                {row.diff!.map((d, i) => (
                                  <div key={i} className="grid grid-cols-[160px_1fr_1fr] gap-2 text-xs font-mono items-start">
                                    <div className="text-primary/80 truncate">{d.field}</div>
                                    <div className="text-rose-300/90 bg-rose-500/5 px-2 py-1 rounded border border-rose-500/20 break-all"><span className="text-[10px] text-rose-400/60 mr-1">−</span>{fmtVal(d.old)}</div>
                                    <div className="text-emerald-300/90 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/20 break-all"><span className="text-[10px] text-emerald-400/60 mr-1">+</span>{fmtVal(d.new)}</div>
                                  </div>
                                ))}
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
  );
}

// ─── Tab: Activity ───────────────────────────────────────────────────────────

function TabActivity() {
  const { toast } = useToast();
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<ActivityRow[]>("/api/dashboard/recent-activity");
      setActivity(r);
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = activity.filter((a) => !filter.trim() || [a.title, a.type, a.description].some((s) => s.toLowerCase().includes(filter.toLowerCase())));

  function sev(type: string) {
    if (type.includes("fail") || type.includes("error") || type.includes("rejected")) return "error";
    if (type.includes("delete") || type.includes("suspend") || type.includes("warn")) return "warn";
    return "info";
  }

  return (
    <Card className="card-surface no-lift border-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div><CardTitle>Активность</CardTitle><CardDescription>Последние события платформы</CardDescription></div>
        <div className="flex gap-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Фильтр…" className="w-56 h-9 bg-background/50" />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Обновить</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <div className="p-6"><Skeleton className="h-32 w-full" /></div> : filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Записей нет</div>
        ) : (
          <Table>
            <TableHeader className="bg-background/30"><TableRow className="hover:bg-transparent">
              <TableHead>Когда</TableHead><TableHead>Тип</TableHead>
              <TableHead>Событие</TableHead><TableHead>Уровень</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((a) => {
                const s = sev(a.type);
                return (
                  <TableRow key={a.id} className="hover:bg-accent/20">
                    <TableCell className="text-xs font-mono whitespace-nowrap text-muted-foreground">{fmtDate(a.timestamp)}</TableCell>
                    <TableCell className="text-xs font-mono text-primary/80">{a.type}</TableCell>
                    <TableCell className="text-xs font-medium">{a.title}</TableCell>
                    <TableCell>
                      {s === "info" && <Badge variant="outline" className="text-[10px] text-blue-400 bg-blue-500/10">info</Badge>}
                      {s === "warn" && <Badge variant="outline" className="text-[10px] text-amber-400 bg-amber-500/10">warn</Badge>}
                      {s === "error" && <Badge variant="outline" className="text-[10px] text-rose-400 bg-rose-500/10">error</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Personal settings (for label / artist roles) ───────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  label: "Лейбл",
  artist: "Артист",
};

function PersonalPasswordTab() {
  const { toast } = useToast();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [conf, setConf] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCur, setShowCur] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const handleSubmit = async () => {
    if (!cur || !next) { toast({ variant: "destructive", title: "Заполните все поля" }); return; }
    if (next !== conf) { toast({ variant: "destructive", title: "Пароли не совпадают" }); return; }
    if (next.length < 8) { toast({ variant: "destructive", title: "Пароль должен содержать не менее 8 символов" }); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = j?.error ?? msg; } catch {}
        throw new Error(msg);
      }
      toast({ title: "Пароль изменён" });
      setCur(""); setNext(""); setConf("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Ошибка", description: e?.message ?? "Неизвестная ошибка" });
    } finally { setBusy(false); }
  };

  return (
    <Card className="card-surface border-border/60 max-w-lg">
      <CardHeader>
        <CardTitle className="text-base">Смена пароля</CardTitle>
        <CardDescription>Минимум 8 символов. Рекомендуем использовать цифры и спецсимволы.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Текущий пароль</Label>
          <div className="relative">
            <Input type={showCur ? "text" : "password"} value={cur} onChange={(e) => setCur(e.target.value)} className="pr-10" />
            <button type="button" className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => setShowCur((v) => !v)}>
              {showCur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Новый пароль</Label>
          <div className="relative">
            <Input type={showNext ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)} className="pr-10" />
            <button type="button" className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => setShowNext((v) => !v)}>
              {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Подтверждение нового пароля</Label>
          <Input type="password" value={conf} onChange={(e) => setConf(e.target.value)} />
        </div>
        <Button onClick={() => void handleSubmit()} disabled={busy}>
          <Save className="mr-2 h-4 w-4" />
          {busy ? "Сохранение…" : "Сохранить пароль"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PersonalNotificationsTab() {
  const [prefs, setPrefs] = useState({
    emailNewRelease: true,
    emailRoyalty: true,
    emailDelivery: true,
    emailReports: false,
  });
  const [saved, setSaved] = useState(false);
  const toggle = (k: keyof typeof prefs) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  const save = () => {
    localStorage.setItem("notif_prefs", JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  useEffect(() => {
    const raw = localStorage.getItem("notif_prefs");
    if (raw) { try { setPrefs(JSON.parse(raw)); } catch {} }
  }, []);

  return (
    <Card className="card-surface border-border/60 max-w-lg">
      <CardHeader>
        <CardTitle className="text-base">Уведомления</CardTitle>
        <CardDescription>Выберите, о чём получать email-оповещения.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {([
          ["emailNewRelease", "Новый релиз одобрен / отклонён"],
          ["emailRoyalty", "Начисление роялти"],
          ["emailDelivery", "Статус доставки на площадки"],
          ["emailReports", "Ежемесячные финансовые отчёты"],
        ] as const).map(([k, label]) => (
          <div key={k} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
            <Label className="text-sm cursor-pointer" htmlFor={`notif-${k}`}>{label}</Label>
            <Switch id={`notif-${k}`} checked={prefs[k]} onCheckedChange={() => toggle(k)} />
          </div>
        ))}
        <Button onClick={save} variant={saved ? "outline" : "default"} className="mt-2">
          {saved ? <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" /> : <Save className="mr-2 h-4 w-4" />}
          {saved ? "Сохранено" : "Сохранить"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PersonalSettings() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="relative pl-4">
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)]" />
          <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Личные настройки аккаунта</p>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="bg-card border border-border h-auto p-1 gap-0.5">
            <TabsTrigger value="profile" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <UserIcon className="h-3.5 w-3.5" />Профиль
            </TabsTrigger>
            <TabsTrigger value="password" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <KeyRound className="h-3.5 w-3.5" />Смена пароля
            </TabsTrigger>
            <TabsTrigger value="notifications" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <BellRing className="h-3.5 w-3.5" />Уведомления
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <Card className="card-surface border-border/60 max-w-lg">
              <CardHeader>
                <CardTitle className="text-base">Профиль</CardTitle>
                <CardDescription>Просмотр и редактирование персональных данных, KYC и банковских реквизитов.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1.5 border-b border-border/30">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium">{user?.email}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/30">
                    <span className="text-muted-foreground">Роль</span>
                    <Badge variant="outline">{ROLE_LABELS[user?.role ?? ""] ?? user?.role}</Badge>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">KYC-статус</span>
                    <Badge variant={user?.kycStatus === "approved" ? "default" : "secondary"}>
                      {user?.kycStatus === "approved" ? "Одобрен" :
                       user?.kycStatus === "pending"  ? "На проверке" :
                       user?.kycStatus === "rejected" ? "Отклонён" : "Не пройден"}
                    </Badge>
                  </div>
                </div>
                <Button onClick={() => setLocation("/profile")}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Перейти в полный профиль
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="password" className="mt-4">
            <PersonalPasswordTab />
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <PersonalNotificationsTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// ─── Main settings page ──────────────────────────────────────────────────────

export default function Settings() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const canView = user?.role === "admin" || user?.role === "manager";

  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [intLoading, setIntLoading] = useState(true);
  const [intBusy, setIntBusy] = useState<string | null>(null);
  const [configRow, setConfigRow] = useState<IntegrationRow | null>(null);

  const loadIntegrations = useCallback(async () => {
    setIntLoading(true);
    try {
      const r = await api<{ data: IntegrationRow[] }>("/api/integrations");
      setIntegrations(r.data ?? []);
    } catch { /* noop */ } finally { setIntLoading(false); }
  }, []);

  useEffect(() => { if (canView) void loadIntegrations(); }, [canView, loadIntegrations]);

  const toggleEnabled = async (row: IntegrationRow, enabled: boolean) => {
    setIntBusy(row.code);
    setIntegrations((p) => p.map((r) => r.code === row.code ? { ...r, enabled } : r));
    try {
      await api(`/api/integrations/${row.code}/enable`, { method: "POST", body: JSON.stringify({ enabled }) });
      toast({ title: enabled ? "Включено" : "Отключено", description: row.name });
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
      void loadIntegrations();
    } finally { setIntBusy(null); }
  };

  const testIntegration = async (row: IntegrationRow) => {
    setIntBusy(row.code);
    try {
      const r = await api<{ ok: boolean; message?: string }>(`/api/integrations/${row.code}/test`, { method: "POST" });
      toast({ variant: r.ok ? "default" : "destructive", title: r.ok ? "Соединение успешно" : "Сбой соединения", description: r.message ?? row.name });
      void loadIntegrations();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setIntBusy(null); }
  };

  if (isLoading) return <Layout><div className="p-6"><Skeleton className="h-32 w-full" /></div></Layout>;
  if (!canView) {
    if (user?.role === "label" || user?.role === "artist") {
      return <PersonalSettings />;
    }
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Доступ ограничен</h1>
          <p className="text-sm text-muted-foreground max-w-md">Настройки системы доступны только администраторам и менеджерам.</p>
        </div>
      </Layout>
    );
  }

  const intProps = { integrations, intLoading, onRefresh: loadIntegrations, onConfigure: setConfigRow, onToggle: toggleEnabled, onTest: testIntegration, intBusy };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div className="relative pl-4">
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)]" />
          <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Управление платформой, интеграциями, безопасностью и уведомлениями</p>
        </div>

        <Tabs defaultValue="general">
          <TabsList className="bg-card border border-border h-auto p-1 gap-0.5 flex-wrap">
            <TabsTrigger value="general" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <Settings2 className="h-3.5 w-3.5" />Общие
            </TabsTrigger>
            <TabsTrigger value="ddex" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <FileCode2 className="h-3.5 w-3.5" />DDEX
            </TabsTrigger>
            <TabsTrigger value="api" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <Key className="h-3.5 w-3.5" />API &amp; Webhooks
            </TabsTrigger>
            <TabsTrigger value="payment" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <CreditCard className="h-3.5 w-3.5" />Оплата
            </TabsTrigger>
            <TabsTrigger value="currency" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <DollarSign className="h-3.5 w-3.5" />Валюта / НДС
            </TabsTrigger>
            <TabsTrigger value="dsp" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <Globe2 className="h-3.5 w-3.5" />DSP
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />Безопасность
            </TabsTrigger>
            <TabsTrigger value="storage" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <HardDrive className="h-3.5 w-3.5" />Хранилище
            </TabsTrigger>
            <TabsTrigger value="notifications" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <Bell className="h-3.5 w-3.5" />Уведомления
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <ScrollText className="h-3.5 w-3.5" />Аудит
            </TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              <ActivityIcon className="h-3.5 w-3.5" />Активность
            </TabsTrigger>
            <TabsTrigger value="channels" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              Каналы (Telegram/WhatsApp)
            </TabsTrigger>
            <TabsTrigger value="acrcloud" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              ACRCloud
            </TabsTrigger>
            <TabsTrigger value="pros" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
              PRO (ASCAP/BMI/…)
            </TabsTrigger>
            {user?.role === "admin" && (
              <TabsTrigger value="manager-perms" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5 text-xs">
                <ShieldCheck className="h-3.5 w-3.5" />
                Права менеджеров
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="general" className="mt-4"><TabGeneral /></TabsContent>
          <TabsContent value="ddex" className="mt-4"><TabDdex {...intProps} /></TabsContent>
          <TabsContent value="api" className="mt-4"><TabApiKeys /></TabsContent>
          <TabsContent value="payment" className="mt-4"><TabPayment {...intProps} /></TabsContent>
          <TabsContent value="currency" className="mt-4"><TabCurrency /></TabsContent>
          <TabsContent value="dsp" className="mt-4"><TabDsp {...intProps} /></TabsContent>
          <TabsContent value="security" className="mt-4"><TabSecurity /></TabsContent>
          <TabsContent value="storage" className="mt-4"><TabStorage /></TabsContent>
          <TabsContent value="notifications" className="mt-4"><TabNotifications /></TabsContent>
          <TabsContent value="audit" className="mt-4"><TabAudit /></TabsContent>
          <TabsContent value="activity" className="mt-4"><TabActivity /></TabsContent>
          <TabsContent value="channels" className="mt-4"><TabChannels /></TabsContent>
          <TabsContent value="acrcloud" className="mt-4"><TabAcrcloud /></TabsContent>
          <TabsContent value="pros" className="mt-4"><TabPros /></TabsContent>
          <TabsContent value="manager-perms" className="mt-4"><TabManagerPermissions /></TabsContent>
        </Tabs>

        <IntegrationConfigDialog
          integration={configRow}
          open={configRow !== null}
          onOpenChange={(v) => { if (!v) setConfigRow(null); }}
          onSaved={loadIntegrations}
        />
      </div>
    </Layout>
  );
}

void Webhook;

// ─── New Tabs (Channels / ACRCloud / PRO) ─────────────────────────────────

function TabChannels() {
  const [tg, setTg] = useState({ enabled: true, botToken: "", defaultChatId: "" });
  const [wa, setWa] = useState({ enabled: true, provider: "twilio", accountSid: "", authToken: "", fromNumber: "" });
  const [status, setStatus] = useState<{ telegram: boolean; whatsapp: boolean } | null>(null);
  const [tgTestTo, setTgTestTo] = useState("");
  const [waTestTo, setWaTestTo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/communications/channels-status", { credentials: "same-origin" });
        if (r.ok) {
          const d = await r.json();
          setStatus({ telegram: d.telegram?.configured, whatsapp: d.whatsapp?.configured });
        }
        const a = await fetch("/api/settings/channels", { credentials: "same-origin" });
        if (a.ok) {
          const d = await a.json();
          if (d.value?.telegram) setTg((p) => ({ ...p, ...d.value.telegram }));
          if (d.value?.whatsapp) setWa((p) => ({ ...p, ...d.value.whatsapp }));
        }
      } catch { /* noop */ }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/channels", {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram: tg, whatsapp: wa }),
      });
      toast({ title: "Сохранено" });
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setSaving(false); }
  };

  const test = async (channel: "telegram" | "whatsapp", to: string) => {
    if (!to.trim()) {
      toast({ variant: "destructive", title: "Укажите получателя для проверки" });
      return;
    }
    try {
      const r = await fetch("/api/communications/test-channel", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, to: to.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      toast({ variant: r.ok ? "default" : "destructive", title: r.ok ? "Сообщение отправлено" : "Сбой", description: (d as { error?: string; message?: string }).error ?? (d as { message?: string }).message ?? "" });
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Telegram Bot</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs">Статус: {status?.telegram ? <Badge>настроен</Badge> : <Badge variant="destructive">не настроен</Badge>}</div>
          <div><Label>Bot Token</Label><Input value={tg.botToken} onChange={(e) => setTg((p) => ({ ...p, botToken: e.target.value }))} data-testid="input-tg-token" /></div>
          <div><Label>Chat ID по умолчанию</Label><Input value={tg.defaultChatId} onChange={(e) => setTg((p) => ({ ...p, defaultChatId: e.target.value }))} data-testid="input-tg-chat" /></div>
          <div className="flex items-end gap-2">
            <div className="flex-1"><Label>Тест: Chat ID</Label><Input value={tgTestTo} onChange={(e) => setTgTestTo(e.target.value)} placeholder="например 123456789" data-testid="input-tg-test-to" /></div>
            <Button variant="outline" size="sm" onClick={() => void test("telegram", tgTestTo)} data-testid="button-test-telegram">Проверить</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">WhatsApp Business (Twilio)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs">Статус: {status?.whatsapp ? <Badge>настроен</Badge> : <Badge variant="destructive">не настроен</Badge>}</div>
          <div><Label>Account SID</Label><Input value={wa.accountSid} onChange={(e) => setWa((p) => ({ ...p, accountSid: e.target.value }))} data-testid="input-wa-sid" /></div>
          <div><Label>Auth Token</Label><Input type="password" value={wa.authToken} onChange={(e) => setWa((p) => ({ ...p, authToken: e.target.value }))} data-testid="input-wa-token" /></div>
          <div><Label>From Number (E.164)</Label><Input value={wa.fromNumber} onChange={(e) => setWa((p) => ({ ...p, fromNumber: e.target.value }))} placeholder="+1234567890" data-testid="input-wa-from" /></div>
          <div className="flex items-end gap-2">
            <div className="flex-1"><Label>Тест: номер получателя (E.164)</Label><Input value={waTestTo} onChange={(e) => setWaTestTo(e.target.value)} placeholder="+1234567890" data-testid="input-wa-test-to" /></div>
            <Button variant="outline" size="sm" onClick={() => void test("whatsapp", waTestTo)} data-testid="button-test-whatsapp">Проверить</Button>
          </div>
        </CardContent>
      </Card>
      <div><Button onClick={() => void save()} disabled={saving} data-testid="button-save-channels">Сохранить</Button></div>
    </div>
  );
}

function TabAcrcloud() {
  const [form, setForm] = useState({ host: "identify-eu-west-1.acrcloud.com", accessKey: "", accessSecret: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/settings/acrcloud", { credentials: "same-origin" });
        if (r.ok) { const d = await r.json(); if (d.value) setForm((p) => ({ ...p, ...d.value })); }
      } catch { /* noop */ }
    })();
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/acrcloud", {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast({ title: "Сохранено" });
    } finally { setSaving(false); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">ACRCloud — учётные данные</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div><Label>Host</Label><Input value={form.host} onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))} data-testid="input-acr-host" /></div>
        <div><Label>Access Key</Label><Input value={form.accessKey} onChange={(e) => setForm((p) => ({ ...p, accessKey: e.target.value }))} data-testid="input-acr-key" /></div>
        <div><Label>Access Secret</Label><Input type="password" value={form.accessSecret} onChange={(e) => setForm((p) => ({ ...p, accessSecret: e.target.value }))} data-testid="input-acr-secret" /></div>
        <Button onClick={() => void save()} disabled={saving} data-testid="button-save-acr">Сохранить</Button>
      </CardContent>
    </Card>
  );
}

function TabPros() {
  const [form, setForm] = useState({
    ascap: { endpoint: "", apiKey: "" },
    bmi: { endpoint: "", apiKey: "" },
    songtrust: { endpoint: "", apiKey: "" },
    mlc: { endpoint: "", apiKey: "" },
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/settings/pros", { credentials: "same-origin" });
        if (r.ok) { const d = await r.json(); if (d.value) setForm((p) => ({ ...p, ...d.value })); }
      } catch { /* noop */ }
    })();
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/pros", {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast({ title: "Сохранено" });
    } finally { setSaving(false); }
  };
  const setPro = (k: "ascap" | "bmi" | "songtrust" | "mlc", field: "endpoint" | "apiKey", v: string) =>
    setForm((p) => ({ ...p, [k]: { ...p[k], [field]: v } }));
  return (
    <div className="space-y-6">
      {(["ascap", "bmi", "songtrust", "mlc"] as const).map((k) => (
        <Card key={k}>
          <CardHeader><CardTitle className="text-base">{k.toUpperCase()}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Endpoint</Label><Input value={form[k].endpoint} onChange={(e) => setPro(k, "endpoint", e.target.value)} data-testid={`input-${k}-endpoint`} /></div>
            <div><Label>API Key</Label><Input type="password" value={form[k].apiKey} onChange={(e) => setPro(k, "apiKey", e.target.value)} data-testid={`input-${k}-key`} /></div>
          </CardContent>
        </Card>
      ))}
      <div><Button onClick={() => void save()} disabled={saving} data-testid="button-save-pros">Сохранить</Button></div>
    </div>
  );
}
