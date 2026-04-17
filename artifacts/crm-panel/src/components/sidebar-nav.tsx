import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { canAccess } from "@/lib/permissions";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  BarChart3,
  Radio,
  Disc3,
  Mic2,
  Building2,
  Clapperboard,
  BookMarked,
  ShieldCheck,
  Users2,
  MessageSquare,
  Megaphone,
  Banknote,
  PieChart,
  Wallet,
  UserCog,
  Zap,
  Settings2,
  PlugZap,
  LogOut,
  Music2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type NavItem = {
  nameKey: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: string;
  iconColor?: string;
};

type NavGroup = {
  titleKey: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    titleKey: "overview",
    items: [
      { nameKey: "dashboard", href: "/",          icon: LayoutDashboard, iconColor: "text-blue-400" },
      { nameKey: "analytics", href: "/analytics", icon: BarChart3,        iconColor: "text-blue-400" },
    ],
  },
  {
    titleKey: "distribution_group",
    items: [
      { nameKey: "distribution", href: "/distribution", icon: Radio, badge: "3", badgeColor: "bg-amber-500", iconColor: "text-amber-400" },
    ],
  },
  {
    titleKey: "catalog",
    items: [
      { nameKey: "releases", href: "/releases", icon: Disc3,       iconColor: "text-emerald-400" },
      { nameKey: "artists",  href: "/artists",  icon: Mic2,        iconColor: "text-emerald-400" },
      { nameKey: "labels",   href: "/labels",   icon: Building2,   iconColor: "text-emerald-400" },
      { nameKey: "videos",   href: "/videos",   icon: Clapperboard,iconColor: "text-emerald-400" },
    ],
  },
  {
    titleKey: "users_group",
    items: [
      { nameKey: "users", href: "/users", icon: UserCog, iconColor: "text-violet-400" },
    ],
  },
  {
    titleKey: "operations",
    items: [
      { nameKey: "publishing",     href: "/publishing",     icon: BookMarked,   iconColor: "text-cyan-400" },
      { nameKey: "rights",         href: "/rights",         icon: ShieldCheck,  iconColor: "text-cyan-400" },
      { nameKey: "crm",            href: "/crm",            icon: Users2,       iconColor: "text-cyan-400" },
      { nameKey: "communications", href: "/communications", icon: MessageSquare,iconColor: "text-cyan-400" },
      { nameKey: "marketing",      href: "/marketing",      icon: Megaphone,    iconColor: "text-cyan-400" },
    ],
  },
  {
    titleKey: "financials",
    items: [
      { nameKey: "finance", href: "/finance", icon: Banknote, iconColor: "text-green-400" },
      { nameKey: "splits",  href: "/splits",  icon: PieChart, iconColor: "text-green-400" },
      { nameKey: "payouts", href: "/payouts", icon: Wallet,   iconColor: "text-green-400" },
    ],
  },
  {
    titleKey: "system",
    items: [
      { nameKey: "automation",   href: "/automation",   icon: Zap,      iconColor: "text-slate-400" },
      { nameKey: "integrations", href: "/integrations", icon: PlugZap,  iconColor: "text-amber-400" },
      { nameKey: "settings",     href: "/settings",     icon: Settings2,iconColor: "text-slate-400" },
    ],
  },
];

export function SidebarNav() {
  const [location] = useLocation();
  const { t } = useLang();
  const nav = t.nav as Record<string, string>;
  const { user, logout } = useAuth();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("sidebar-collapsed", String(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  return (
    <div
      className={cn(
        "flex h-full flex-col shrink-0 border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] transition-all duration-300 ease-in-out overflow-hidden",
        collapsed ? "w-[64px]" : "w-[230px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "border-b border-[hsl(var(--sidebar-border))] transition-all duration-300 flex items-center",
        collapsed ? "px-3 py-4 justify-center" : "px-4 py-3"
      )}>
        {collapsed ? (
          /* Collapsed: just the icon badge */
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-[hsl(271_80%_68%)] flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
            <Music2 className="h-[18px] w-[18px] text-white" />
            <span className="absolute inset-0 rounded-xl ring-1 ring-white/10" />
          </div>
        ) : (
          /* Expanded: logo image */
          <img
            src="/tajikmusic-logo.png"
            alt="Tajik Music"
            className="h-10 w-auto object-contain select-none"
            draggable={false}
          />
        )}
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-3 space-y-4" style={{ padding: collapsed ? "12px 8px" : "12px 10px" }}>
        {navGroups.map((group) => {
          const visibleItems = user
            ? group.items.filter(item => canAccess(user.role, item.href))
            : [];
          if (visibleItems.length === 0) return null;
          return (
          <div key={group.titleKey}>
            {/* Section label — hidden when collapsed */}
            {!collapsed && (
              <p className="mb-1.5 px-2 text-[9px] font-bold uppercase tracking-[0.14em] text-white/50">
                {nav[group.titleKey] ?? group.titleKey}
              </p>
            )}
            {collapsed && <div className="h-px bg-white/[0.07] mb-2 mx-1" />}

            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));

                const iconEl = (
                  <span
                    className={cn(
                      "flex items-center justify-center rounded-lg transition-all duration-150",
                      collapsed ? "h-[34px] w-[34px]" : "h-[26px] w-[26px] mr-2.5",
                      isActive
                        ? "bg-primary/20 shadow-sm shadow-primary/20"
                        : "group-hover:bg-white/[0.06]"
                    )}
                  >
                    <Icon
                      className={cn(
                        "transition-colors duration-150",
                        collapsed ? "h-[17px] w-[17px]" : "h-[15px] w-[15px]",
                        isActive
                          ? "text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.7)]"
                          : item.iconColor
                            ? cn(item.iconColor, "opacity-70 group-hover:opacity-100")
                            : "text-muted-foreground/60 group-hover:text-muted-foreground"
                      )}
                      strokeWidth={1.8}
                    />
                  </span>
                );

                return (
                  <Link key={item.href} href={item.href}>
                    <span
                      title={collapsed ? (nav[item.nameKey] ?? item.nameKey) : undefined}
                      className={cn(
                        "nav-item group relative flex items-center rounded-lg cursor-pointer transition-all duration-150",
                        collapsed ? "px-0 py-0 justify-center" : "px-2 py-[6px]",
                        isActive
                          ? "nav-active-bar nav-item-active"
                          : "nav-item-inactive"
                      )}
                    >
                      {iconEl}

                      {!collapsed && (
                        <>
                          <span
                            className={cn(
                              "flex-1 truncate text-[13px] font-medium transition-colors",
                              isActive ? "text-white" : "text-white/75 group-hover:text-white"
                            )}
                          >
                            {nav[item.nameKey] ?? item.nameKey}
                          </span>

                          {item.badge && (
                            <span
                              className={cn(
                                "ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white",
                                item.badgeColor ?? "bg-primary"
                              )}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}

                      {/* Badge dot in collapsed mode */}
                      {collapsed && item.badge && (
                        <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-amber-500 border border-[hsl(var(--sidebar))]" />
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      {/* User footer */}
      <div className={cn(
        "border-t border-[hsl(var(--sidebar-border))]",
        collapsed ? "p-2" : "p-3"
      )}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={logout}
              title={user?.name}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center cursor-pointer hover:border-primary/40 transition-all"
            >
              <span className="text-[11px] font-bold text-primary">{user?.avatarInitials ?? "?"}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all duration-150">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-primary">{user?.avatarInitials ?? "?"}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-white truncate leading-tight">{user?.name ?? "—"}</p>
              <span className={cn(
                "inline-block text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-px rounded border",
                user ? ROLE_COLORS[user.role] : ""
              )}>
                {user ? ROLE_LABELS[user.role] : ""}
              </span>
            </div>
            <button
              onClick={logout}
              title="Выйти"
              className="group p-1 rounded hover:bg-red-500/10 transition-colors shrink-0"
            >
              <LogOut className="h-3.5 w-3.5 text-white/30 group-hover:text-red-400 transition-colors" />
            </button>
          </div>
        )}
      </div>

      {/* ── Collapse / Expand button — bottom, gradient, embossed ── */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Развернуть меню" : "Свернуть меню"}
        className={cn(
          "relative flex items-center justify-center gap-2 w-full cursor-pointer select-none",
          "h-11 transition-all duration-200",
          "bg-[hsl(222_40%_6%)]",
          "hover:bg-[hsl(222_40%_8%)]",
          "active:scale-[0.98]",
          // neon glow border top + outer glow
          "border-t border-primary/30",
          "shadow-[0_-2px_12px_hsl(226_84%_67%/0.25),0_-1px_0_hsl(226_84%_67%/0.3)_inset]",
          "hover:shadow-[0_-2px_20px_hsl(226_84%_67%/0.45),0_-1px_0_hsl(226_84%_67%/0.5)_inset,0_0_30px_hsl(271_80%_68%/0.15)]",
          "text-primary font-bold text-[10px] tracking-[0.12em] uppercase",
          "overflow-hidden"
        )}
      >
        {/* Neon top-edge line */}
        <span className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent pointer-events-none" />

        {collapsed ? (
          <ChevronRight className="h-4 w-4 relative drop-shadow-[0_0_6px_hsl(var(--primary))]" />
        ) : (
          <>
            <ChevronLeft className="h-4 w-4 relative drop-shadow-[0_0_6px_hsl(var(--primary))]" />
            <span className="relative drop-shadow-[0_0_8px_hsl(var(--primary))]">Свернуть</span>
          </>
        )}
      </button>
    </div>
  );
}
