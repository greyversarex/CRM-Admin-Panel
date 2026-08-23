// Клиент подтверждает права на свой каталог. Три галочки и территории —
// ровно то, что администратор потом проверяет в карточке пользователя.
//
// Повторная подача перезаписывает прежнюю и возвращает заявку на проверку,
// поэтому отдельной кнопки «изменить» не нужно.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { api } from "../users/_api";

type Rights = {
  ownsRights: boolean;
  authorizedToDistribute: boolean;
  acceptsCopyrightResponsibility: boolean;
  territories: string | null;
  distributionRights: string | null;
  status: string;
  reviewNote: string | null;
  submittedAt: string;
};

const STATUS: Record<string, { label: string; className: string }> = {
  pending:        { label: "на проверке",  className: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
  verified:       { label: "подтверждены", className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
  rejected:       { label: "отклонены",    className: "bg-rose-500/10 border-rose-500/30 text-rose-400" },
  info_requested: { label: "нужны данные", className: "bg-violet-500/10 border-violet-500/30 text-violet-400" },
};

/** Три обязательные галочки: ключ формы и текст. */
const CHECKS: ["ownsRights" | "authorizedToDistribute" | "acceptsCopyrightResponsibility", string][] = [
  ["ownsRights", "Я владею правами на записи, которые загружаю"],
  ["authorizedToDistribute", "Я вправе распространять их на площадках"],
  ["acceptsCopyrightResponsibility", "Я отвечаю за соблюдение авторских прав"],
];

export function RightsTab({ userId }: { userId: number }) {
  const [data, setData] = useState<Rights | null | undefined>(undefined);
  const [form, setForm] = useState({
    ownsRights: false,
    authorizedToDistribute: false,
    acceptsCopyrightResponsibility: false,
    territories: "Весь мир",
    distributionRights: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ data: Rights | null }>("/api/users/me/rights-verification")
      .then((r) => {
        setData(r.data);
        if (r.data) {
          setForm({
            ownsRights: r.data.ownsRights,
            authorizedToDistribute: r.data.authorizedToDistribute,
            acceptsCopyrightResponsibility: r.data.acceptsCopyrightResponsibility,
            territories: r.data.territories ?? "Весь мир",
            distributionRights: r.data.distributionRights ?? "",
          });
        }
      })
      // Заявки может ещё не быть — показываем пустую форму.
      .catch(() => setData(null));
  }, [userId]);

  const allChecked = form.ownsRights && form.authorizedToDistribute && form.acceptsCopyrightResponsibility;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ data: Rights }>("/api/users/me/rights-verification", {
        method: "PUT",
        body: JSON.stringify({
          ownsRights: form.ownsRights,
          authorizedToDistribute: form.authorizedToDistribute,
          acceptsCopyrightResponsibility: form.acceptsCopyrightResponsibility,
          territories: form.territories.trim() || null,
          distributionRights: form.distributionRights.trim() || null,
        }),
      });
      setData(r.data);
      toast({ title: "Отправлено на проверку" });
    } catch (e) {
      toast({ title: "Не получилось", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (data === undefined) return <Skeleton className="h-40 w-full" />;

  return (
    <Card className="card-surface no-lift border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Права на каталог</CardTitle>
            <CardDescription>
              Без подтверждения прав релизы не уходят на площадки.
            </CardDescription>
          </div>
          {data && (
            <Badge variant="outline" className={STATUS[data.status]?.className ?? ""}>
              {STATUS[data.status]?.label ?? data.status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.reviewNote && (
          <p className="text-sm rounded-md border border-border/60 bg-background/40 px-3 py-2">
            Комментарий проверяющего: {data.reviewNote}
          </p>
        )}

        <div className="space-y-2">
          {CHECKS.map(([key, label]) => (
            <label key={key} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-primary"
                checked={Boolean(form[key])}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Территории</label>
            <Input value={form.territories} onChange={(e) => setForm({ ...form, territories: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Ограничения по правам (если есть)</label>
            <Input
              placeholder="Например: без Японии до 2027 года"
              value={form.distributionRights}
              onChange={(e) => setForm({ ...form, distributionRights: e.target.value })}
            />
          </div>
        </div>

        <Button disabled={busy || !allChecked} onClick={submit}>
          {data ? "Отправить заново" : "Отправить на проверку"}
        </Button>
        {!allChecked && (
          <p className="text-xs text-muted-foreground">Отметьте все три пункта — иначе отправить нельзя.</p>
        )}
      </CardContent>
    </Card>
  );
}
