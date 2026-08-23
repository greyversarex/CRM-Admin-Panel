// Все договоры разом — вкладка в разделе «Пользователи».
// Создание и отправка живут в карточке пользователя; здесь только общий обзор
// и переход к нужному клиенту, чтобы не плодить одинаковые формы в двух местах.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "./_api";

type Contract = {
  id: number; userId: number; contractNumber: string; title: string;
  status: string; version: number; signedAt: string | null;
  effectiveDate: string | null; expiryDate: string | null;
  userName: string | null; userEmail: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "черновик", sent: "на подписи", signed: "подписан",
  expired: "истёк", terminated: "расторгнут",
};
const STATUS_CLASS: Record<string, string> = {
  signed: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  sent: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  expired: "bg-rose-500/10 border-rose-500/30 text-rose-400",
  terminated: "bg-rose-500/10 border-rose-500/30 text-rose-400",
};

export function ContractsTab() {
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    void api<{ data: Contract[] }>("/api/contracts")
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "Не удалось загрузить"));
  }, []);

  return (
    <Card className="card-surface no-lift border-border/60">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle>Договоры</CardTitle>
        <CardDescription>
          Договор создаётся и отправляется на подпись в карточке пользователя, на вкладке «Договоры».
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {error && <p className="p-6 text-sm text-rose-400">{error}</p>}
        <Table>
          <TableHeader className="bg-background/30">
            <TableRow className="hover:bg-transparent">
              <TableHead>Клиент</TableHead>
              <TableHead>Договор</TableHead>
              <TableHead>Версия</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Подписан</TableHead>
              <TableHead>Действует до</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null && !error && (
              <TableRow><TableCell colSpan={6}><Skeleton className="h-9 w-full" /></TableCell></TableRow>
            )}
            {rows?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Договоров пока нет.
                </TableCell>
              </TableRow>
            )}
            {rows?.map((c) => (
              <TableRow
                key={c.id}
                className="hover:bg-accent/20 cursor-pointer"
                onClick={() => navigate(`/users/${c.userId}`)}
              >
                <TableCell>
                  <div className="text-sm font-medium">{c.userName ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{c.userEmail}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{c.title}</div>
                  <div className="text-xs text-muted-foreground">№ {c.contractNumber}</div>
                </TableCell>
                <TableCell className="text-sm">{c.version}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_CLASS[c.status] ?? ""}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.signedAt ? new Date(c.signedAt).toLocaleDateString("ru-RU") : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.expiryDate ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
