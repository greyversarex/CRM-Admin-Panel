import { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Search, Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: "admin" | "manager" | "label" | "artist";
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ImpersonateDialog({ open, onOpenChange }: Props) {
  const { impersonate } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setLoading(true);
    fetch("/api/users?limit=200", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        const rows: UserRow[] = (data.data ?? []).filter(
          (u: UserRow) => u.role !== "admin",
        );
        setUsers(rows);
      })
      .catch(() => {
        toast({ variant: "destructive", title: "Не удалось загрузить пользователей" });
      })
      .finally(() => {
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      });
  }, [open]);

  const filtered = users.filter((u) => {
    const q = query.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const handleImpersonate = async (u: UserRow) => {
    if (busyId !== null) return;
    setBusyId(u.id);
    const r = await impersonate(u.id);
    setBusyId(null);
    if (!r.ok) {
      toast({ variant: "destructive", title: "Ошибка", description: r.error });
      return;
    }
    toast({ title: `Вы вошли как ${u.name}`, description: u.email });
    onOpenChange(false);
    navigate("/");
  };

  const initials = (name: string) =>
    name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

  const grouped: Record<string, UserRow[]> = {};
  for (const u of filtered) {
    if (!grouped[u.role]) grouped[u.role] = [];
    grouped[u.role].push(u);
  }
  const roleOrder = ["manager", "label", "artist"] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle>Войти как пользователь</DialogTitle>
          <DialogDescription className="text-[13px]">
            Выберите аккаунт для просмотра системы от его лица.
            Жёлтая полоса вверху покажет, что вы в режиме просмотра.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Поиск по имени, email или роли…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-background/50"
          />
        </div>

        <div className="max-h-[360px] overflow-y-auto -mx-1 px-1 flex flex-col gap-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">
              Пользователи не найдены
            </p>
          ) : (
            roleOrder.map((role) => {
              const group = grouped[role];
              if (!group?.length) return null;
              return (
                <div key={role}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 mb-1.5 px-1">
                    {ROLE_LABELS[role]}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {group.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleImpersonate(u)}
                        disabled={busyId !== null || u.status !== "active"}
                        className={cn(
                          "flex items-center gap-3 w-full px-2.5 py-2 rounded-lg text-left transition-colors",
                          "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                          u.status !== "active" && "opacity-40 cursor-not-allowed",
                          busyId === u.id && "opacity-60",
                        )}
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                            {initials(u.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight truncate">{u.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {u.status !== "active" && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                              {u.status}
                            </Badge>
                          )}
                          <span className={cn(
                            "text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border",
                            ROLE_COLORS[u.role],
                          )}>
                            {ROLE_LABELS[u.role]}
                          </span>
                          {busyId === u.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            : <LogIn className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                          }
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-1">
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
