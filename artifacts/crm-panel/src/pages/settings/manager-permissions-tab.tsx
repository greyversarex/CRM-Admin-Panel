import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  useFullManagerPermissions,
  useTogglePermission,
  type ManagerPermissionKey,
  type ManagerPermissionItem,
} from "@/lib/manager-permissions";
import { Shield } from "lucide-react";

interface PermDef {
  key: ManagerPermissionKey;
  title: string;
  description: string;
}

const PERM_DEFS: PermDef[] = [
  { key: "catalog",          title: "Каталог",                description: "Релизы, исполнители, лейблы, видео." },
  { key: "distribution",     title: "Дистрибуция",             description: "Очереди, отправки, статусы DSP." },
  { key: "finance",          title: "Финансы",                 description: "Финансовые отчёты, роялти, сплиты, выплаты." },
  { key: "analytics",        title: "Аналитика",               description: "Стримы, чарты, демографика, UGC." },
  { key: "crm",              title: "CRM",                    description: "Аналитика бизнеса платформы (пользователи, ARPU, воронка)." },
  { key: "users_kyc",        title: "Пользователи и KYC",      description: "Управление пользователями, заявки на регистрацию, верификация KYC." },
  { key: "rights",           title: "Права",                   description: "Управление правами, паблишинг (CWR/MLC)." },
  { key: "support_comms",    title: "Поддержка и коммуникации", description: "Тикеты поддержки, рассылки, уведомления." },
  { key: "automation_audit", title: "Автоматизация и аудит",   description: "Сценарии автоматизации и просмотр аудит-лога." },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function TabManagerPermissions() {
  const { data, isLoading, isError } = useFullManagerPermissions();
  const toggle = useTogglePermission();
  const { toast } = useToast();

  const byKey = new Map<ManagerPermissionKey, ManagerPermissionItem>();
  if (data) for (const it of data) byKey.set(it.key, it);

  const handleToggle = (key: ManagerPermissionKey, next: boolean) => {
    toggle.mutate(
      { key, enabled: next },
      {
        onSuccess: () => {
          toast({
            title: next ? "Раздел включён для менеджеров" : "Раздел скрыт от менеджеров",
            description: PERM_DEFS.find((p) => p.key === key)?.title ?? key,
          });
        },
        onError: (err) => {
          toast({
            title: "Ошибка",
            description: err instanceof Error ? err.message : "Не удалось обновить",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">Права менеджеров</CardTitle>
            <CardDescription className="text-xs">
              Управляйте, какие разделы CRM доступны пользователям с ролью «Менеджер». Изменения вступают в силу
              сразу после переключения. Администратор всегда видит все разделы.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {isError && (
          <div className="text-sm text-destructive">Не удалось загрузить права менеджеров.</div>
        )}

        {!isLoading && !isError && PERM_DEFS.map((def) => {
          const item = byKey.get(def.key);
          const enabled = item?.enabled ?? true;
          return (
            <div
              key={def.key}
              className="flex items-start justify-between gap-4 rounded-md border border-border bg-background/40 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{def.title}</span>
                  <code className="text-[10px] text-muted-foreground bg-muted/40 px-1 py-0.5 rounded">
                    {def.key}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
                {item && (
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    Обновлено: {fmtDate(item.updatedAt)}
                    {item.updatedBy ? ` (admin #${item.updatedBy})` : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 pt-0.5">
                <span className={`text-xs ${enabled ? "text-emerald-400" : "text-muted-foreground"}`}>
                  {enabled ? "Включено" : "Скрыто"}
                </span>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => handleToggle(def.key, v)}
                  disabled={toggle.isPending}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
