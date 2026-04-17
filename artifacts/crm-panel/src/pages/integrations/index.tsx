import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Music2,
  Apple,
  Youtube,
  Radio,
  Disc3,
  Headphones,
  Globe2,
  Send,
  Activity,
  PlugZap,
  Server,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Settings as SettingsIcon,
  Key,
  ExternalLink,
} from "lucide-react";

type IntegrationStatus = "connected" | "disconnected" | "pending" | "error";
type IntegrationCategory = "dsp" | "social" | "delivery" | "analytics";

type FieldType = "text" | "password" | "url" | "number";

type IntegrationField = {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  hint?: string;
};

type Integration = {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  status: IntegrationStatus;
  enabled: boolean;
  lastSync?: string;
  docsUrl?: string;
  fields: IntegrationField[];
  values: Record<string, string>;
};

const CATEGORIES: Record<IntegrationCategory, { title: string; subtitle: string; icon: React.ElementType }> = {
  dsp: {
    title: "Стриминговые площадки (DSP)",
    subtitle: "Доставка треков и сбор статистики прослушиваний",
    icon: Radio,
  },
  social: {
    title: "Социальные сети и UGC",
    subtitle: "Мониторинг использования музыки в Reels, TikTok и Shorts",
    icon: Globe2,
  },
  delivery: {
    title: "DDEX-доставка",
    subtitle: "Отправка релизов через стандартные XML-пакеты по SFTP",
    icon: Send,
  },
  analytics: {
    title: "Сторонняя аналитика",
    subtitle: "Внешние сервисы аналитики и трендов",
    icon: Activity,
  },
};

const oauthFields: IntegrationField[] = [
  { key: "client_id", label: "Client ID", type: "text", placeholder: "Введите Client ID" },
  { key: "client_secret", label: "Client Secret", type: "password", placeholder: "••••••••" },
  { key: "redirect_uri", label: "Redirect URI", type: "url", placeholder: "https://crm.tajikmusic.com/oauth/callback" },
];

const sftpFields: IntegrationField[] = [
  { key: "host", label: "SFTP хост", type: "text", placeholder: "ftp.partner.com" },
  { key: "port", label: "Порт", type: "number", placeholder: "22" },
  { key: "username", label: "Пользователь", type: "text", placeholder: "tajikmusic" },
  { key: "password", label: "Пароль / SSH-ключ", type: "password", placeholder: "••••••••" },
  { key: "remote_path", label: "Папка на сервере", type: "text", placeholder: "/incoming/" },
];

const apiKeyFields: IntegrationField[] = [
  { key: "api_key", label: "API ключ", type: "password", placeholder: "Вставьте API key" },
  { key: "partner_id", label: "Partner ID", type: "text", placeholder: "Опционально" },
];

const initialIntegrations: Integration[] = [
  // ── DSP ──
  {
    id: "spotify", name: "Spotify", category: "dsp",
    description: "Spotify for Artists API + DDEX доставка",
    icon: Music2, iconColor: "text-emerald-400", iconBg: "bg-emerald-500/10",
    status: "disconnected", enabled: false,
    docsUrl: "https://developer.spotify.com/",
    fields: oauthFields, values: {},
  },
  {
    id: "apple_music", name: "Apple Music", category: "dsp",
    description: "Apple Music for Artists + iTunes Connect",
    icon: Apple, iconColor: "text-white", iconBg: "bg-white/5",
    status: "disconnected", enabled: false,
    docsUrl: "https://developer.apple.com/apple-music/",
    fields: [
      { key: "team_id", label: "Team ID", type: "text" },
      { key: "key_id", label: "Key ID", type: "text" },
      { key: "private_key", label: "Private Key (.p8)", type: "password" },
    ], values: {},
  },
  {
    id: "youtube_music", name: "YouTube Music", category: "dsp",
    description: "YouTube Content ID + YouTube Music",
    icon: Youtube, iconColor: "text-red-400", iconBg: "bg-red-500/10",
    status: "disconnected", enabled: false,
    docsUrl: "https://developers.google.com/youtube/v3",
    fields: oauthFields, values: {},
  },
  {
    id: "deezer", name: "Deezer", category: "dsp",
    description: "Deezer для артистов и партнёров",
    icon: Headphones, iconColor: "text-purple-400", iconBg: "bg-purple-500/10",
    status: "disconnected", enabled: false,
    docsUrl: "https://developers.deezer.com/",
    fields: oauthFields, values: {},
  },
  {
    id: "tidal", name: "Tidal", category: "dsp",
    description: "Tidal Hi-Fi дистрибуция",
    icon: Disc3, iconColor: "text-cyan-300", iconBg: "bg-cyan-500/10",
    status: "disconnected", enabled: false,
    fields: apiKeyFields, values: {},
  },
  {
    id: "amazon_music", name: "Amazon Music", category: "dsp",
    description: "Amazon Music for Artists",
    icon: Music2, iconColor: "text-orange-300", iconBg: "bg-orange-500/10",
    status: "disconnected", enabled: false,
    fields: apiKeyFields, values: {},
  },
  {
    id: "vk_music", name: "VK Музыка / BOOM", category: "dsp",
    description: "ВКонтакте и BOOM (СНГ-аудитория)",
    icon: Music2, iconColor: "text-blue-300", iconBg: "bg-blue-500/10",
    status: "disconnected", enabled: false,
    docsUrl: "https://dev.vk.com/",
    fields: apiKeyFields, values: {},
  },
  {
    id: "yandex_music", name: "Яндекс Музыка", category: "dsp",
    description: "Яндекс Музыка / Звук",
    icon: Music2, iconColor: "text-yellow-300", iconBg: "bg-yellow-500/10",
    status: "disconnected", enabled: false,
    fields: apiKeyFields, values: {},
  },
  {
    id: "zvuk", name: "Звук (СберЗвук)", category: "dsp",
    description: "Сбер Звук — российский стриминг",
    icon: Music2, iconColor: "text-green-300", iconBg: "bg-green-500/10",
    status: "disconnected", enabled: false,
    fields: apiKeyFields, values: {},
  },

  // ── Social ──
  {
    id: "tiktok", name: "TikTok", category: "social",
    description: "TikTok for Business — UGC мониторинг",
    icon: Music2, iconColor: "text-pink-400", iconBg: "bg-pink-500/10",
    status: "disconnected", enabled: false,
    docsUrl: "https://developers.tiktok.com/",
    fields: oauthFields, values: {},
  },
  {
    id: "instagram", name: "Instagram / Reels", category: "social",
    description: "Meta Graph API — статистика по Reels",
    icon: Globe2, iconColor: "text-fuchsia-400", iconBg: "bg-fuchsia-500/10",
    status: "disconnected", enabled: false,
    docsUrl: "https://developers.facebook.com/",
    fields: oauthFields, values: {},
  },
  {
    id: "youtube_shorts", name: "YouTube Shorts", category: "social",
    description: "Shorts performance + Content ID matches",
    icon: Youtube, iconColor: "text-red-400", iconBg: "bg-red-500/10",
    status: "disconnected", enabled: false,
    fields: oauthFields, values: {},
  },

  // ── DDEX delivery ──
  {
    id: "ddex_main", name: "DDEX SFTP (универсальный)", category: "delivery",
    description: "Стандартная доставка DDEX ERN-4 / 4.3 пакетов",
    icon: Server, iconColor: "text-amber-300", iconBg: "bg-amber-500/10",
    status: "pending", enabled: false,
    fields: sftpFields,
    values: { host: "", port: "22", remote_path: "/incoming/" },
  },
  {
    id: "ddex_party", name: "DDEX Party ID", category: "delivery",
    description: "Идентификатор Tajik Music в DDEX-сети",
    icon: ShieldCheck, iconColor: "text-emerald-300", iconBg: "bg-emerald-500/10",
    status: "connected", enabled: true,
    lastSync: "Действует",
    fields: [
      { key: "party_id", label: "Party ID", type: "text" },
      { key: "party_name", label: "Название партии", type: "text" },
    ],
    values: { party_id: "PA-DPIDA-2024053004-T", party_name: "Tajik Music" },
  },

  // ── Analytics ──
  {
    id: "chartmetric", name: "Chartmetric", category: "analytics",
    description: "Глобальная аналитика чартов и DSP-данные",
    icon: Activity, iconColor: "text-blue-400", iconBg: "bg-blue-500/10",
    status: "disconnected", enabled: false,
    fields: apiKeyFields, values: {},
  },
  {
    id: "soundcharts", name: "Soundcharts", category: "analytics",
    description: "Soundcharts API — статистика и тренды",
    icon: Activity, iconColor: "text-violet-400", iconBg: "bg-violet-500/10",
    status: "disconnected", enabled: false,
    fields: apiKeyFields, values: {},
  },
];

const STATUS_META: Record<IntegrationStatus, { label: string; cls: string; icon: React.ElementType }> = {
  connected:    { label: "Подключено",        cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  disconnected: { label: "Не подключено",     cls: "bg-white/5 text-white/60 border-white/10",                  icon: XCircle },
  pending:      { label: "Ожидает контракта", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",       icon: Clock },
  error:        { label: "Ошибка",            cls: "bg-red-500/15 text-red-300 border-red-500/30",             icon: XCircle },
};

export default function Integrations() {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);

  const editing = useMemo(
    () => integrations.find((i) => i.id === editingId) || null,
    [editingId, integrations],
  );

  const stats = useMemo(() => {
    const total = integrations.length;
    const connected = integrations.filter((i) => i.status === "connected").length;
    const pending = integrations.filter((i) => i.status === "pending").length;
    const enabled = integrations.filter((i) => i.enabled).length;
    return { total, connected, pending, enabled };
  }, [integrations]);

  const openEdit = (i: Integration) => {
    setEditingId(i.id);
    setFormValues({ ...i.values });
  };

  const closeEdit = () => {
    setEditingId(null);
    setFormValues({});
  };

  const saveCredentials = () => {
    if (!editing) return;
    const filledCount = Object.values(formValues).filter(Boolean).length;
    setIntegrations((arr) =>
      arr.map((i) =>
        i.id === editing.id
          ? {
              ...i,
              values: { ...formValues },
              status: filledCount >= 1 ? "connected" : "disconnected",
              enabled: filledCount >= 1 ? true : i.enabled,
              lastSync: filledCount >= 1 ? new Date().toLocaleString("ru-RU") : i.lastSync,
            }
          : i,
      ),
    );
    toast({
      title: "Настройки сохранены",
      description: `Интеграция «${editing.name}» обновлена.`,
    });
    closeEdit();
  };

  const testConnection = async () => {
    if (!editing) return;
    setTesting(true);
    await new Promise((r) => setTimeout(r, 1200));
    setTesting(false);
    const filled = Object.values(formValues).filter(Boolean).length > 0;
    toast({
      title: filled ? "Соединение успешно" : "Заполните обязательные поля",
      description: filled
        ? `Сервер ${editing.name} ответил на запрос.`
        : "Без credentials тест не пройдёт.",
      variant: filled ? "default" : "destructive",
    });
  };

  const toggleEnabled = (id: string, value: boolean) => {
    setIntegrations((arr) =>
      arr.map((i) => (i.id === id ? { ...i, enabled: value } : i)),
    );
  };

  const grouped = useMemo(() => {
    const map: Record<IntegrationCategory, Integration[]> = {
      dsp: [], social: [], delivery: [], analytics: [],
    };
    integrations.forEach((i) => map[i.category].push(i));
    return map;
  }, [integrations]);

  const renderCard = (i: Integration) => {
    const StatusIcon = STATUS_META[i.status].icon;
    return (
      <Card
        key={i.id}
        className="group relative overflow-hidden border-white/[0.06] bg-gradient-to-br from-[hsl(222_40%_8%)] to-[hsl(222_40%_5%)] hover:border-primary/30 transition-all duration-200"
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`shrink-0 h-11 w-11 rounded-xl ${i.iconBg} border border-white/[0.06] flex items-center justify-center`}>
              <i.icon className={`h-5 w-5 ${i.iconColor}`} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-white truncate">{i.name}</h3>
                <Switch
                  checked={i.enabled}
                  onCheckedChange={(v) => toggleEnabled(i.id, v)}
                  className="shrink-0"
                />
              </div>
              <p className="text-[12px] text-white/55 leading-snug mt-0.5 line-clamp-2">
                {i.description}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.05]">
            <Badge variant="outline" className={`gap-1 text-[10px] font-semibold uppercase tracking-wider ${STATUS_META[i.status].cls}`}>
              <StatusIcon className="h-3 w-3" />
              {STATUS_META[i.status].label}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-primary hover:text-primary hover:bg-primary/10"
              onClick={() => openEdit(i)}
            >
              <SettingsIcon className="h-3.5 w-3.5 mr-1" />
              Настроить
            </Button>
          </div>

          {i.lastSync && (
            <p className="text-[10px] text-white/40 mt-2 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {i.lastSync}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                <PlugZap className="h-5 w-5 text-primary" />
              </span>
              Интеграции API
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Подключение Tajik Music к стриминговым площадкам, соцсетям и сервисам аналитики.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <StatBlock label="Всего" value={stats.total} />
            <StatBlock label="Активные" value={stats.enabled} accent="emerald" />
            <StatBlock label="Подключено" value={stats.connected} accent="primary" />
            <StatBlock label="Ожидают" value={stats.pending} accent="amber" />
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="bg-[hsl(222_40%_7%)] border border-white/[0.06]">
            <TabsTrigger value="all">Все</TabsTrigger>
            <TabsTrigger value="dsp">Стриминги</TabsTrigger>
            <TabsTrigger value="social">Соцсети</TabsTrigger>
            <TabsTrigger value="delivery">DDEX-доставка</TabsTrigger>
            <TabsTrigger value="analytics">Аналитика</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-8 mt-6">
            {(Object.keys(CATEGORIES) as IntegrationCategory[]).map((cat) => {
              const items = grouped[cat];
              if (!items.length) return null;
              const meta = CATEGORIES[cat];
              const Icon = meta.icon;
              return (
                <section key={cat}>
                  <div className="flex items-center gap-3 mb-3">
                    <Icon className="h-4 w-4 text-primary" />
                    <div>
                      <h2 className="text-[15px] font-semibold text-white">{meta.title}</h2>
                      <p className="text-[12px] text-white/45">{meta.subtitle}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {items.map(renderCard)}
                  </div>
                </section>
              );
            })}
          </TabsContent>

          {(Object.keys(CATEGORIES) as IntegrationCategory[]).map((cat) => (
            <TabsContent key={cat} value={cat} className="mt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {grouped[cat].map(renderCard)}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {/* Info banner */}
        <Card className="border-primary/20 bg-primary/[0.04]">
          <CardContent className="p-4 flex gap-4 items-start">
            <div className="h-9 w-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
              <Key className="h-4 w-4 text-primary" />
            </div>
            <div className="text-[13px] text-white/75 leading-relaxed">
              <p className="font-semibold text-white mb-1">Как это работает</p>
              По мере заключения контрактов с площадками вы получаете API-ключи и/или SFTP-доступ.
              Введите их в настройках соответствующей интеграции — система сразу начнёт отправлять
              релизы и подтягивать статистику. Все ключи хранятся в зашифрованном виде на сервере.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="sm:max-w-[520px]">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <span className={`h-9 w-9 rounded-lg ${editing.iconBg} border border-white/[0.08] flex items-center justify-center`}>
                    <editing.icon className={`h-4 w-4 ${editing.iconColor}`} />
                  </span>
                  {editing.name}
                </DialogTitle>
                <DialogDescription>
                  {editing.description}
                  {editing.docsUrl && (
                    <a
                      href={editing.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 ml-2 text-primary hover:underline"
                    >
                      документация <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                {editing.fields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={f.key} className="text-[12px]">{f.label}</Label>
                    <Input
                      id={f.key}
                      type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"}
                      placeholder={f.placeholder}
                      value={formValues[f.key] ?? ""}
                      onChange={(e) => setFormValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                    {f.hint && <p className="text-[10px] text-white/45">{f.hint}</p>}
                  </div>
                ))}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={testConnection}
                  disabled={testing}
                  className="gap-2"
                >
                  {testing ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Activity className="h-3.5 w-3.5" />
                  )}
                  Тест подключения
                </Button>
                <Button variant="ghost" onClick={closeEdit}>Отмена</Button>
                <Button onClick={saveCredentials}>Сохранить</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function StatBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "primary" | "amber";
}) {
  const cls =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "amber"
        ? "text-amber-300"
        : accent === "primary"
          ? "text-primary"
          : "text-white";
  return (
    <div className="rounded-lg bg-[hsl(222_40%_7%)] border border-white/[0.06] px-3 py-2 min-w-[90px]">
      <div className={`text-[20px] font-bold leading-none ${cls}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/45 mt-1">{label}</div>
    </div>
  );
}
