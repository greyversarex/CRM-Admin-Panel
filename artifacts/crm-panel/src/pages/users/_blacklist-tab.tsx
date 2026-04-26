import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useListUsers, useUpdateUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Ban } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Props = { onCountChange?: (n: number) => void };

export function BlacklistTab({ onCountChange }: Props) {
  const queryClient = useQueryClient();
  const params = { status: "suspended" as const, limit: 100 };
  const { data, isLoading } = useListUsers(params as any, {
    query: {
      queryKey: getListUsersQueryKey(params as any),
    },
  });

  const items = data?.data ?? [];

  // info-only side-effect: оповестить родителя о count (в useEffect, не в render)
  useEffect(() => {
    if (typeof onCountChange === "function" && data) onCountChange(items.length);
  }, [items.length, data, onCountChange]);

  const update = useUpdateUser();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function unblock(u: { id: number; name: string; email: string; role: any }) {
    if (!window.confirm(`Снять блокировку с ${u.name}?`)) return;
    setBusyId(u.id);
    try {
      await update.mutateAsync({
        id: u.id,
        data: {
          name: u.name,
          email: u.email,
          role: u.role,
          status: "active",
        } as any,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Пользователь разблокирован", description: u.name });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Не удалось разблокировать", description: e?.message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="card-surface no-lift border-border/60">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle>Blacklist / Suspended</CardTitle>
        <CardDescription>
          Список пользователей со статусом <code className="text-[11px]">suspended</code>. Они не могут войти и не получают выплат.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-background/30">
            <TableRow className="hover:bg-transparent">
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={`sk-${i}`}><TableCell colSpan={5}><Skeleton className="h-9 w-full" /></TableCell></TableRow>
            ))}
            {!isLoading && items.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                В blacklist никого нет.
              </TableCell></TableRow>
            )}
            {!isLoading && items.map((u) => (
              <TableRow key={u.id} className="hover:bg-accent/20" data-testid={`row-blacklist-${u.id}`}>
                <TableCell>
                  <div className="text-sm font-medium">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] uppercase">{u.role}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 text-xs text-emerald-400 hover:bg-emerald-500/10"
                    disabled={busyId === u.id}
                    onClick={() => unblock(u)}
                    data-testid={`button-unblock-${u.id}`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Разблокировать
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
