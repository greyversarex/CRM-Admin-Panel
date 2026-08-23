// Договоры глазами клиента: прочитать и подписать кодом из письма.
// Админ этот раздел не открывает — у него договоры в карточке пользователя.
import { useEffect, useState, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { api } from "../users/_api";

type Contract = {
  id: number; contractNumber: string; title: string; body: string | null;
  status: string; version: number; signedAt: string | null;
  effectiveDate: string | null; expiryDate: string | null;
  awaitingSignature: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "готовится", sent: "ждёт вашей подписи", signed: "подписан",
  expired: "истёк", terminated: "расторгнут",
};

export default function MyContracts() {
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [reading, setReading] = useState<Contract | null>(null);
  const [signing, setSigning] = useState<Contract | null>(null);
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ data: Contract[] }>("/api/contracts/mine");
    setRows(r.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sign = async () => {
    if (!signing) return;
    setBusy(true);
    try {
      await api(`/api/contracts/${signing.id}/sign`, {
        method: "POST",
        body: JSON.stringify({ otp: otp.trim(), signedByName: name.trim() }),
      });
      toast({ title: "Договор подписан" });
      setSigning(null); setOtp(""); setName("");
      await load();
    } catch (e) {
      toast({ title: "Не получилось", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Layout>
      <div className="p-6 space-y-5">
        <div className="relative pl-4">
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-primary to-[hsl(271_80%_68%)]" />
          <h1 className="text-2xl font-bold tracking-tight">Договоры</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Здесь появляются договоры с Tajik Music. Код для подписания приходит на вашу почту.
          </p>
        </div>

        {rows === null && <Skeleton className="h-24 w-full" />}
        {rows?.length === 0 && (
          <Card className="card-surface no-lift">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Договоров пока нет.
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {rows?.map((c) => (
            <Card key={c.id} className="card-surface no-lift">
              <CardHeader className="pb-2 flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{c.title}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    № {c.contractNumber} · версия {c.version}
                    {c.effectiveDate ? ` · с ${c.effectiveDate}` : ""}
                    {c.expiryDate ? ` по ${c.expiryDate}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className={
                  c.status === "signed" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : c.status === "sent" ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : ""
                }>
                  {STATUS_LABEL[c.status] ?? c.status}
                </Badge>
              </CardHeader>
              <CardContent className="pt-0 flex gap-2">
                {c.body && (
                  <Button size="sm" variant="outline" onClick={() => setReading(c)}>Читать</Button>
                )}
                {c.awaitingSignature && (
                  <Button size="sm" onClick={() => { setSigning(c); setOtp(""); setName(""); }}>
                    Подписать
                  </Button>
                )}
                {c.signedAt && (
                  <span className="text-xs text-muted-foreground self-center">
                    Подписан {new Date(c.signedAt).toLocaleDateString("ru-RU")}
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={!!reading} onOpenChange={(o) => { if (!o) setReading(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{reading?.title}</DialogTitle>
            <DialogDescription>№ {reading?.contractNumber} · версия {reading?.version}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
            {reading?.body}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!signing} onOpenChange={(o) => { if (!o) setSigning(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подписание договора</DialogTitle>
            <DialogDescription>
              Введите код из письма и своё имя. Мы сохраним дату, время и имя подписавшего.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Код из письма" value={otp} onChange={(e) => setOtp(e.target.value)} />
            <Input placeholder="Фамилия и имя подписывающего" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSigning(null)}>Отмена</Button>
            <Button disabled={busy || otp.trim().length < 4 || name.trim().length < 2} onClick={sign}>
              Подписать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
