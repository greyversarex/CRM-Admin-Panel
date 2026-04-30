/**
 * Вкладка «Интеграции» — центральный хаб для подключения внешних сервисов.
 * Показывает все доступные сервисы по категориям, их статус и позволяет
 * ввести API-ключи через простой диалог.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, AlertTriangle, CircleDashed, Settings2, FlaskConical,
  RefreshCcw, Eye, EyeOff, HardDrive, Mail, BarChart2,
  CreditCard, MessageSquare, Music2, BookOpen, Unplug,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface IntegrationRecord {
  id: number; code: string; name: string; category: string; authType: string;
  enabled: boolean; status: string; lastSyncAt: string | null; lastError: string | null;
  hasCredentials: boolean;
}

interface FieldDef {
  key: string; label: string; type?: "text" | "password" | "url";
  hint?: string; placeholder?: string; required?: boolean;
}

// ─── Service catalog (what we know how to connect) ───────────────────────────

interface ServiceDef {
  code: string;
  name: string;
  category: "storage" | "email" | "analytics" | "payments" | "communications" | "dsp" | "publishing";
  authType: "api_key" | "oauth2" | "basic" | "bearer" | "sftp" | "none";
  description: string;
  fields: FieldDef[];
  docsUrl?: string;
}

const SERVICES: ServiceDef[] = [
  // Storage
  {
    code: "cloudflare_r2", name: "Cloudflare R2", category: "storage", authType: "api_key",
    description: "S3-совместимое хранилище для аудио-файлов и обложек. Дешевле AWS, без платы за исходящий трафик.",
    fields: [
      { key: "account_id",        label: "Account ID",        required: true },
      { key: "access_key_id",     label: "Access Key ID",     required: true },
      { key: "access_key_secret", label: "Secret Access Key", type: "password", required: true },
      { key: "bucket",            label: "Bucket Name",       required: true, placeholder: "my-music-files" },
      { key: "endpoint",          label: "Endpoint URL",      type: "url", hint: "https://<account_id>.r2.cloudflarestorage.com" },
    ],
  },
  {
    code: "aws_s3", name: "AWS S3", category: "storage", authType: "api_key",
    description: "Amazon Simple Storage Service. Стандарт индустрии для хранения файлов.",
    fields: [
      { key: "access_key_id",     label: "Access Key ID",     required: true },
      { key: "secret_access_key", label: "Secret Access Key", type: "password", required: true },
      { key: "region",            label: "Region",            required: true, placeholder: "eu-central-1" },
      { key: "bucket",            label: "Bucket Name",       required: true },
    ],
  },
  // Email
  {
    code: "resend", name: "Resend", category: "email", authType: "api_key",
    description: "Современный email-провайдер. Простая интеграция, высокая доставляемость.",
    fields: [
      { key: "api_key",    label: "API Key",    type: "password", required: true, placeholder: "re_..." },
      { key: "from_email", label: "From Email", placeholder: "noreply@yourdomain.com" },
      { key: "from_name",  label: "From Name",  placeholder: "Tajik Music Distribution" },
    ],
  },
  {
    code: "sendgrid", name: "SendGrid", category: "email", authType: "api_key",
    description: "Email-платформа от Twilio. Широко используется для транзакционных писем.",
    fields: [
      { key: "api_key",    label: "API Key",    type: "password", required: true, placeholder: "SG...." },
      { key: "from_email", label: "From Email" },
      { key: "from_name",  label: "From Name" },
    ],
  },
  // Analytics
  {
    code: "acrcloud", name: "ACRCloud", category: "analytics", authType: "api_key",
    description: "Распознавание аудио на UGC-платформах (YouTube, TikTok, Instagram). Защита прав на треки.",
    fields: [
      { key: "access_key",    label: "Access Key",    required: true },
      { key: "access_secret", label: "Access Secret", type: "password", required: true },
      { key: "host",          label: "Host",          placeholder: "identify-eu-west-1.acrcloud.com" },
    ],
  },
  // Payments
  {
    code: "wise", name: "Wise", category: "payments", authType: "api_key",
    description: "Международные переводы. Поддерживает TJS. Оптимален для выплат артистам в Таджикистане.",
    fields: [
      { key: "api_key",    label: "API Key",    type: "password", required: true },
      { key: "profile_id", label: "Profile ID", hint: "Найти в Wise → Settings → Profiles" },
    ],
  },
  {
    code: "stripe", name: "Stripe", category: "payments", authType: "api_key",
    description: "Приём платежей картой. Подходит для подписок и разовых платежей.",
    fields: [
      { key: "secret_key",     label: "Secret Key",     type: "password", required: true, placeholder: "sk_live_..." },
      { key: "webhook_secret", label: "Webhook Secret", type: "password", placeholder: "whsec_..." },
    ],
  },
  // Communications
  {
    code: "telegram_bot", name: "Telegram Bot", category: "communications", authType: "api_key",
    description: "Отправка уведомлений артистам и менеджерам через Telegram.",
    fields: [
      { key: "bot_token",      label: "Bot Token",       type: "password", required: true, hint: "Получить у @BotFather" },
      { key: "default_chat_id", label: "Chat ID по умолч.", hint: "ID чата для системных уведомлений" },
    ],
  },
  {
    code: "twilio_whatsapp", name: "WhatsApp (Twilio)", category: "communications", authType: "basic",
    description: "Уведомления через WhatsApp Business API.",
    fields: [
      { key: "account_sid", label: "Account SID",   required: true },
      { key: "auth_token",  label: "Auth Token",    type: "password", required: true },
      { key: "from_number", label: "From (E.164)",  placeholder: "+1234567890" },
    ],
  },
  // Publishing
  {
    code: "ascap", name: "ASCAP", category: "publishing", authType: "api_key",
    description: "Регистрация произведений в ASCAP (американское авторское общество).",
    fields: [
      { key: "api_key",  label: "API Key",      type: "password", required: true },
      { key: "endpoint", label: "Endpoint URL", type: "url" },
    ],
  },
  {
    code: "bmi", name: "BMI", category: "publishing", authType: "api_key",
    description: "Broadcast Music, Inc. — авторское общество. Регистрация и управление правами.",
    fields: [
      { key: "api_key",  label: "API Key",      type: "password", required: true },
      { key: "endpoint", label: "Endpoint URL", type: "url" },
    ],
  },
  {
    code: "songtrust", name: "Songtrust", category: "publishing", authType: "api_key",
    description: "Глобальное администрирование паблишинга. Охват 245+ территорий.",
    fields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
  },
];

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  storage:        { label: "Хранилище",   icon: HardDrive },
  email:          { label: "Email",        icon: Mail },
  analytics:      { label: "Аналитика",   icon: BarChart2 },
  payments:       { label: "Выплаты",     icon: CreditCard },
  communications: { label: "Каналы",      icon: MessageSquare },
  dsp:            { label: "DSP",          icon: Music2 },
  publishing:     { label: "Publishing",  icon: BookOpen },
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j?.error ?? msg; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ─── Configure Dialog ─────────────────────────────────────────────────────────

interface ConfigureDialogProps {
  service: ServiceDef | null;
  record: IntegrationRecord | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

function ConfigureDialog({ service, record, open, onOpenChange, onSaved }: ConfigureDialogProps) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!service || !open) return;
    setValues(Object.fromEntries(service.fields.map((f) => [f.key, ""])));
    setRevealed(new Set());
    setTestResult(null);
  }, [service, open]);

  if (!service) return null;

  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const toggleReveal = (k: string) =>
    setRevealed((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const filledValues = () => Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ""));

  const ensureRegistered = async () => {
    await apiCall(`/api/integrations/${service.code}/register`, {
      method: "POST",
      body: JSON.stringify({ name: service.name, category: service.category, authType: service.authType }),
    }).catch(() => {});
  };

  const save = async () => {
    const filled = filledValues();
    const requiredMissing = service.fields.filter((f) => f.required && !values[f.key]?.trim());
    if (requiredMissing.length > 0 && !record?.hasCredentials) {
      toast({ variant: "destructive", title: "Заполните обязательные поля", description: requiredMissing.map((f) => f.label).join(", ") });
      return;
    }
    setSaving(true);
    try {
      await ensureRegistered();
      if (Object.keys(filled).length > 0) {
        await apiCall(`/api/integrations/${service.code}/credentials`, {
          method: "POST",
          body: JSON.stringify({ fields: filled }),
        });
      }
      toast({ title: "Сохранено", description: `${service.name} настроен` });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await ensureRegistered();
      const filled = filledValues();
      if (Object.keys(filled).length > 0) {
        await apiCall(`/api/integrations/${service.code}/credentials`, {
          method: "POST",
          body: JSON.stringify({ fields: filled }),
        });
      }
      const r = await apiCall<{ ok: boolean; message?: string }>(`/api/integrations/${service.code}/test`, { method: "POST" });
      setTestResult({ ok: r.ok, message: r.message ?? (r.ok ? "Соединение установлено" : "Ошибка соединения") });
      if (r.ok) onSaved();
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message });
    } finally { setTesting(false); }
  };

  const busy = saving || testing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {service.name}
            <Badge variant="outline" className="text-[10px] uppercase font-mono">{service.authType}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">{service.description}</p>

          {record?.hasCredentials && (
            <div className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-md px-3 py-2">
              Учётные данные сохранены. Оставьте поля пустыми, чтобы не менять.
            </div>
          )}

          {record?.lastError && (
            <div className="text-xs bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-md px-3 py-2">
              Последняя ошибка: {record.lastError}
            </div>
          )}

          {service.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-sm">
                {f.label}
                {f.required && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              <div className="relative">
                <Input
                  type={f.type === "password" && !revealed.has(f.key) ? "password" : "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder ?? (f.type === "password" && record?.hasCredentials ? "(без изменений)" : "")}
                  className={`font-mono text-sm ${f.type === "password" ? "pr-10" : ""}`}
                  disabled={busy}
                />
                {f.type === "password" && (
                  <button type="button" className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => toggleReveal(f.key)}>
                    {revealed.has(f.key) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>
              {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
            </div>
          ))}

          {testResult && (
            <div className={`rounded-md border p-3 text-sm ${testResult.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
              <p className="font-medium">{testResult.ok ? "Соединение успешно" : "Сбой соединения"}</p>
              <p className="text-xs opacity-90 mt-1 break-words">{testResult.message}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Отмена</Button>
          <Button variant="outline" onClick={test} disabled={busy}>
            <FlaskConical className="h-4 w-4 mr-1.5" />
            {testing ? "Проверяем…" : "Проверить"}
          </Button>
          <Button onClick={save} disabled={busy}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Service card ─────────────────────────────────────────────────────────────

function StatusBadge({ status, hasCredentials }: { status?: string; hasCredentials?: boolean }) {
  if (!hasCredentials) {
    return <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground"><CircleDashed className="h-2.5 w-2.5" />Не настроен</Badge>;
  }
  if (status === "connected") {
    return <Badge variant="outline" className="text-[10px] gap-1 text-emerald-400 bg-emerald-500/10 border-emerald-500/20"><CheckCircle2 className="h-2.5 w-2.5" />Подключён</Badge>;
  }
  if (status === "error") {
    return <Badge variant="outline" className="text-[10px] gap-1 text-rose-400 bg-rose-500/10 border-rose-500/20"><AlertTriangle className="h-2.5 w-2.5" />Ошибка</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] gap-1 text-amber-400 bg-amber-500/10 border-amber-500/20"><Unplug className="h-2.5 w-2.5" />Настроен</Badge>;
}

interface ServiceCardProps {
  service: ServiceDef;
  record?: IntegrationRecord;
  onConfigure: () => void;
  onTest: () => void;
  busy: boolean;
}

function ServiceCard({ service, record, onConfigure, onTest, busy }: ServiceCardProps) {
  return (
    <Card className="card-surface border-border/60 no-lift">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{service.name}</span>
              <StatusBadge status={record?.status} hasCredentials={record?.hasCredentials} />
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{service.description}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {record?.hasCredentials && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onTest} disabled={busy} title="Проверить соединение">
                <FlaskConical className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onConfigure} disabled={busy}>
              <Settings2 className="h-3.5 w-3.5" />
              {record?.hasCredentials ? "Изменить" : "Настроить"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function TabIntegrations() {
  const { toast } = useToast();
  const [records, setRecords] = useState<IntegrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [configService, setConfigService] = useState<ServiceDef | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiCall<{ data: IntegrationRecord[] }>("/api/integrations");
      setRecords(r.data ?? []);
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const getRecord = (code: string) => records.find((r) => r.code === code);

  const openConfigure = (service: ServiceDef) => {
    setConfigService(service);
    setDialogOpen(true);
  };

  const testService = async (service: ServiceDef) => {
    setBusyCode(service.code);
    try {
      await apiCall(`/api/integrations/${service.code}/register`, {
        method: "POST",
        body: JSON.stringify({ name: service.name, category: service.category, authType: service.authType }),
      }).catch(() => {});
      const r = await apiCall<{ ok: boolean; message?: string }>(`/api/integrations/${service.code}/test`, { method: "POST" });
      toast({
        variant: r.ok ? "default" : "destructive",
        title: r.ok ? `${service.name}: соединение OK` : `${service.name}: сбой`,
        description: r.message,
      });
      void load();
    } catch (e) {
      toast({ variant: "destructive", title: "Ошибка", description: (e as Error).message });
    } finally { setBusyCode(null); }
  };

  const categories = [...new Set(SERVICES.map((s) => s.category))];

  const connectedCount = SERVICES.filter((s) => getRecord(s.code)?.hasCredentials).length;

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Подключено сервисов: <span className="text-foreground font-medium">{connectedCount}</span> из {SERVICES.length}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            API-ключи шифруются AES-256-GCM перед сохранением в базе данных
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCcw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        categories.map((category) => {
          const meta = CATEGORY_META[category] ?? { label: category, icon: Settings2 };
          const Icon = meta.icon;
          const categoryServices = SERVICES.filter((s) => s.category === category);

          return (
            <div key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary/70" />
                <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">{meta.label}</h3>
                <div className="flex-1 border-t border-border/40" />
                <span className="text-xs text-muted-foreground">
                  {categoryServices.filter((s) => getRecord(s.code)?.hasCredentials).length}/{categoryServices.length}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {categoryServices.map((service) => (
                  <ServiceCard
                    key={service.code}
                    service={service}
                    record={getRecord(service.code)}
                    onConfigure={() => openConfigure(service)}
                    onTest={() => void testService(service)}
                    busy={busyCode === service.code}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}

      <ConfigureDialog
        service={configService}
        record={configService ? getRecord(configService.code) ?? null : null}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />
    </div>
  );
}
