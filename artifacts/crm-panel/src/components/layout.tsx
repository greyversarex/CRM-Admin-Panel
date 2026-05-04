import { SidebarNav } from "./sidebar-nav";
import { WaveBackground } from "./wave-background";
import { NotificationsPopover } from "./notifications-popover";
import { ImpersonateDialog } from "./impersonate-dialog";
import {
  Globe, ChevronDown, Plus,
  User as UserIcon, CreditCard, Repeat, Moon, Sun, LogOut,
} from "lucide-react";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Switch } from "./ui/switch";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function Layout({ children }: { children: React.ReactNode }) {
  const { lang, setLang, t } = useLang();
  const { user, logout, impersonator, stopImpersonating } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [stopBusy, setStopBusy] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);

  const handleStopImpersonating = async () => {
    setStopBusy(true);
    const r = await stopImpersonating();
    setStopBusy(false);
    if (r.ok) {
      toast({ title: "Возврат в учётную запись администратора" });
      navigate("/users");
    } else {
      toast({ variant: "destructive", title: "Не удалось вернуться", description: r.error });
    }
  };
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try { return localStorage.getItem("theme") !== "light"; } catch { return true; }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
    }
    try { localStorage.setItem("theme", darkMode ? "dark" : "light"); } catch { /* ignore */ }
  }, [darkMode]);
  const accountNumber = "28301";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {impersonator && (
          <div
            role="status"
            aria-live="polite"
            className="h-9 shrink-0 flex items-center justify-between gap-3 px-5 text-[12px] font-medium text-amber-50 bg-gradient-to-r from-amber-600/90 via-amber-500/90 to-amber-600/90 border-b border-amber-700/40 shadow-[inset_0_-1px_0_rgba(0,0,0,0.15)]"
          >
            <span className="truncate">
              Вы вошли как <strong className="font-bold">{user?.name ?? "—"}</strong>{" "}
              <span className="opacity-80">({user?.email})</span>
              <span className="mx-2 opacity-60">·</span>
              admin: <strong className="font-bold">{impersonator.name}</strong>{" "}
              <span className="opacity-80">({impersonator.email})</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2.5 text-[11px] font-semibold text-amber-50 hover:text-white hover:bg-amber-700/40"
              onClick={handleStopImpersonating}
              disabled={stopBusy}
            >
              <LogOut className="h-3 w-3 mr-1.5" />
              Вернуться к админу
            </Button>
          </div>
        )}
        <header className="h-[60px] flex items-center justify-end px-5 border-b border-border/60 bg-card/40 backdrop-blur-md shrink-0 z-10">
          <div className="flex items-center gap-2">
            {(user?.role === "artist" || user?.role === "label") && (
              <Button size="sm" onClick={() => navigate("/releases/new")} className="h-8 gap-1.5 mr-2">
                <Plus className="h-3.5 w-3.5" />
                {t.releases.create_release}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="uppercase font-semibold tracking-wide">{lang}</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-28 bg-card border-border shadow-lg">
                <DropdownMenuItem
                  className={`text-xs cursor-pointer ${lang === "en" ? "text-primary font-semibold" : ""}`}
                  onClick={() => setLang("en")}
                >
                  🇬🇧 English
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={`text-xs cursor-pointer ${lang === "ru" ? "text-primary font-semibold" : ""}`}
                  onClick={() => setLang("ru")}
                >
                  🇷🇺 Русский
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="w-px h-5 bg-border/60 mx-1" />

            <NotificationsPopover />

            <div className="flex items-center gap-2.5 pl-2 ml-1 border-l border-border/60">
              <div className="hidden md:block text-right">
                <p className="text-[12px] font-semibold text-foreground leading-tight">{user?.name ?? "—"}</p>
                <span className={cn(
                  "inline-block text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-px rounded border",
                  user ? ROLE_COLORS[user.role] : ""
                )}>
                  {user ? ROLE_LABELS[user.role] : ""}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="h-8 w-8 border border-border/50 ring-1 ring-primary/10 cursor-pointer">
                    <AvatarImage src="" alt={user?.name} />
                    <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-[11px] font-bold">
                      {user?.avatarInitials ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 bg-card border-border shadow-xl p-0">
                  {/* Header with user info */}
                  <div className="flex items-center gap-3 p-3 border-b border-border/60">
                    <Avatar className="h-10 w-10 ring-2 ring-primary/30">
                      <AvatarFallback className="bg-gradient-to-br from-primary/40 to-primary/10 text-primary text-sm font-bold">
                        {user?.avatarInitials ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold leading-tight truncate">{user?.name ?? "Tajik Music"}</p>
                      <p className="text-[11px] text-muted-foreground">Account# {accountNumber}</p>
                    </div>
                  </div>

                  <div className="p-1">
                    <DropdownMenuItem
                      className="text-sm cursor-pointer gap-3 py-2.5"
                      onClick={() => navigate("/profile")}
                    >
                      <span className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                        <UserIcon className="h-3.5 w-3.5 text-primary" />
                      </span>
                      Мой профиль
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-sm cursor-pointer gap-3 py-2.5"
                      onClick={() => navigate("/payouts")}
                    >
                      <span className="h-7 w-7 rounded-md bg-violet-500/10 flex items-center justify-center">
                        <CreditCard className="h-3.5 w-3.5 text-violet-400" />
                      </span>
                      Оплата и налоги
                    </DropdownMenuItem>
                    {user?.role === "admin" && !impersonator && (
                      <DropdownMenuItem
                        className="text-sm cursor-pointer gap-3 py-2.5"
                        onSelect={() => setImpersonateOpen(true)}
                      >
                        <span className="h-7 w-7 rounded-md bg-cyan-500/10 flex items-center justify-center">
                          <Repeat className="h-3.5 w-3.5 text-cyan-400" />
                        </span>
                        Сменить аккаунт
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />

                    <DropdownMenuLabel className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                      Предпочтения
                    </DropdownMenuLabel>
                    <div className="flex items-center gap-3 px-2 py-2 rounded-md">
                      <span className="h-7 w-7 rounded-md bg-emerald-500/10 flex items-center justify-center">
                        <Globe className="h-3.5 w-3.5 text-emerald-400" />
                      </span>
                      <span className="text-sm flex-1">Язык</span>
                      <select
                        value={lang}
                        onChange={(e) => setLang(e.target.value as "en" | "ru")}
                        className="h-7 px-2 text-xs rounded-md bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary/40"
                      >
                        <option value="en">English</option>
                        <option value="ru">Русский</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-3 px-2 py-2 rounded-md">
                      <span className="h-7 w-7 rounded-md bg-indigo-500/10 flex items-center justify-center">
                        {darkMode
                          ? <Moon className="h-3.5 w-3.5 text-indigo-400" />
                          : <Sun className="h-3.5 w-3.5 text-amber-400" />}
                      </span>
                      <span className="text-sm flex-1">{darkMode ? "Тёмная тема" : "Светлая тема"}</span>
                      <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                    </div>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      className="text-sm cursor-pointer text-red-400 hover:text-red-300 gap-3 py-2.5"
                      onClick={logout}
                    >
                      <span className="h-7 w-7 rounded-md bg-red-500/10 flex items-center justify-center">
                        <LogOut className="h-3.5 w-3.5" />
                      </span>
                      Выйти из системы
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto relative">
          <WaveBackground />
          <div className="relative z-10 p-6 md:p-7 mx-auto max-w-[1400px]">
            {children}
          </div>
        </main>
      </div>
      <ImpersonateDialog open={impersonateOpen} onOpenChange={setImpersonateOpen} />
    </div>
  );
}
