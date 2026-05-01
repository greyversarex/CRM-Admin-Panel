import { Link, useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { canAccess, ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";
import { useManagerPermissions, type ManagerPermissionKey } from "@/lib/manager-permissions";
import { useState, useEffect } from "react";
import type { Role } from "@/lib/auth";
import {
  LayoutDashboard,
  BarChart3,
  Radio,
  Disc3,
  Mic2,
  Building2,
  Clapperboard,
  BookMarked,
  Users2,
  Banknote,
  PieChart,
  Wallet,
  Coins,
  UserCog,
  Settings2,
  LogOut,
  Music2,
  CircleUser,
  LifeBuoy,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  MessageSquare,
  Workflow,
  Library,
  Megaphone,
  Link2,
  ImagePlay,
  Truck,
  CalendarDays,
  Hash,
  ArrowRightLeft,
  XCircle,
} from "lucide-react";

type NavItem = {
  nameKey: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: string;
  iconColor?: string;
  /** Per-role override of the displayed translation key. */
  nameKeyByRole?: Partial<Record<Role, string>>;
};

type NavGroup = {
  titleKey: string;
  /** Если задан — для роли manager группа (целиком) скрывается, когда permission disabled. */
  managerKey?: ManagerPermissionKey;
  items: NavItem[];
};

// ───────────────────────── Конфигурация по ролям ─────────────────────────────

const adminNavGroups: NavGroup[] = [
  {
    titleKey: "overview",
    items: [
      { nameKey: "dashboard", href: "/", icon: LayoutDashboard, iconColor: "text-blue-400" },
    ],
  },
  {
    titleKey: "catalog_group",
    managerKey: "catalog",
    items: [
      { nameKey: "catalog_hub", href: "/catalog", icon: Library, iconColor: "text-emerald-400" },
    ],
  },
  {
    titleKey: "distribution_group",
    managerKey: "distribution",
    items: [
      { nameKey: "distribution", href: "/distribution", icon: Radio, iconColor: "text-amber-400" },
    ],
  },
  {
    titleKey: "finance_group",
    managerKey: "finance",
    items: [
      { nameKey: "finance", href: "/finance", icon: Banknote, iconColor: "text-green-400" },
    ],
  },
  {
    titleKey: "analytics_group",
    managerKey: "analytics",
    items: [
      { nameKey: "analytics", href: "/analytics", icon: BarChart3, iconColor: "text-blue-400" },
    ],
  },
  {
    titleKey: "crm_group",
    managerKey: "crm",
    items: [
      { nameKey: "crm", href: "/crm", icon: BarChart3, iconColor: "text-cyan-400" },
    ],
  },
  {
    titleKey: "users_group",
    managerKey: "users_kyc",
    items: [
      { nameKey: "users",   href: "/users",         icon: UserCog,     iconColor: "text-violet-400" },
      { nameKey: "signups", href: "/admin/signups", icon: Users2,      iconColor: "text-violet-400" },
      { nameKey: "kyc",     href: "/admin/kyc",     icon: ShieldCheck, iconColor: "text-violet-400" },
    ],
  },
  {
    titleKey: "rights_group",
    managerKey: "rights",
    items: [
      { nameKey: "rights",     href: "/rights",     icon: ShieldCheck, iconColor: "text-violet-400" },
      { nameKey: "publishing", href: "/publishing", icon: BookMarked,  iconColor: "text-violet-400" },
    ],
  },
  {
    titleKey: "support_comms_group",
    managerKey: "support_comms",
    items: [
      { nameKey: "support",        href: "/support",        icon: LifeBuoy,      iconColor: "text-yellow-400" },
      { nameKey: "communications", href: "/communications", icon: MessageSquare, iconColor: "text-rose-400" },
    ],
  },
  {
    titleKey: "automation_audit_group",
    managerKey: "automation_audit",
    items: [
      { nameKey: "automation", href: "/automation",   icon: Workflow,    iconColor: "text-cyan-400" },
      { nameKey: "audit",      href: "/admin/audit",  icon: ShieldCheck, iconColor: "text-blue-400" },
    ],
  },
  {
    titleKey: "system",
    items: [
      { nameKey: "settings", href: "/settings", icon: Settings2, iconColor: "text-slate-400" },
    ],
  },
  {
    titleKey: "account_group",
    items: [
      { nameKey: "profile", href: "/profile", icon: CircleUser, iconColor: "text-pink-400" },
    ],
  },
];

const labelNavGroups: NavGroup[] = [
  {
    titleKey: "overview",
    items: [
      { nameKey: "dashboard", href: "/", icon: LayoutDashboard, iconColor: "text-blue-400" },
    ],
  },
  {
    titleKey: "my_catalog",
    items: [
      { nameKey: "releases",      href: "/releases",           icon: Disc3,           iconColor: "text-emerald-400" },
      { nameKey: "artists",       href: "/artists",            icon: Mic2,            iconColor: "text-emerald-400" },
      { nameKey: "transfer",      href: "/releases/transfer",  icon: ArrowRightLeft,  iconColor: "text-emerald-400" },
      { nameKey: "release_cal",   href: "/releases/calendar",  icon: CalendarDays,    iconColor: "text-emerald-400" },
      { nameKey: "isrc_codes",    href: "/catalog/codes",      icon: Hash,            iconColor: "text-slate-400" },
    ],
  },
  {
    titleKey: "distribution_status_group",
    items: [
      { nameKey: "delivery",  href: "/delivery",         icon: Truck,     iconColor: "text-amber-400" },
      { nameKey: "takedown",  href: "/releases/takedown", icon: XCircle,  iconColor: "text-red-400" },
    ],
  },
  {
    titleKey: "publishing_group",
    items: [
      { nameKey: "publishing", href: "/publishing", icon: BookMarked, iconColor: "text-violet-400" },
      { nameKey: "rights",     href: "/rights",     icon: ShieldCheck, iconColor: "text-violet-400" },
    ],
  },
  {
    titleKey: "analytics_group",
    items: [
      { nameKey: "analytics", href: "/analytics", icon: BarChart3, iconColor: "text-blue-400" },
    ],
  },
  {
    titleKey: "marketing_group",
    items: [
      { nameKey: "presave",      href: "/marketing/presave", icon: Megaphone,  iconColor: "text-pink-400" },
      { nameKey: "smart_links",  href: "/marketing/links",   icon: Link2,      iconColor: "text-pink-400" },
      { nameKey: "promo_assets", href: "/marketing/assets",  icon: ImagePlay,  iconColor: "text-pink-400" },
    ],
  },
  {
    titleKey: "earnings_group",
    items: [
      { nameKey: "royalties", href: "/royalties", icon: Coins,    iconColor: "text-green-400", nameKeyByRole: { label: "earnings" } },
      { nameKey: "splits",    href: "/splits",    icon: PieChart, iconColor: "text-green-400" },
      { nameKey: "payouts",   href: "/payouts",   icon: Wallet,   iconColor: "text-green-400" },
    ],
  },
  {
    titleKey: "support_group",
    items: [
      { nameKey: "support", href: "/support", icon: LifeBuoy, iconColor: "text-yellow-400" },
    ],
  },
  {
    titleKey: "account_group",
    items: [
      { nameKey: "settings", href: "/settings", icon: Settings2,  iconColor: "text-slate-400" },
      { nameKey: "profile",  href: "/profile",  icon: CircleUser, iconColor: "text-pink-400" },
    ],
  },
];

const artistNavGroups: NavGroup[] = [
  {
    titleKey: "overview",
    items: [
      { nameKey: "dashboard", href: "/", icon: LayoutDashboard, iconColor: "text-blue-400" },
    ],
  },
  {
    titleKey: "my_catalog",
    items: [
      { nameKey: "my_releases", href: "/releases",            icon: Disc3,    iconColor: "text-emerald-400" },
      { nameKey: "takedown",    href: "/releases/takedown",   icon: XCircle,  iconColor: "text-red-400" },
      { nameKey: "delivery",    href: "/delivery",            icon: Truck,    iconColor: "text-amber-400" },
    ],
  },
  {
    titleKey: "marketing_group",
    items: [
      { nameKey: "presave",      href: "/marketing/presave", icon: Megaphone, iconColor: "text-pink-400" },
      { nameKey: "smart_links",  href: "/marketing/links",   icon: Link2,     iconColor: "text-pink-400" },
      { nameKey: "promo_assets", href: "/marketing/assets",  icon: ImagePlay, iconColor: "text-pink-400" },
    ],
  },
  {
    titleKey: "analytics_group",
    items: [
      { nameKey: "analytics", href: "/analytics", icon: BarChart3, iconColor: "text-blue-400" },
    ],
  },
  {
    titleKey: "earnings_group",
    items: [
      { nameKey: "royalties", href: "/royalties", icon: Coins,    iconColor: "text-green-400", nameKeyByRole: { artist: "earnings" } },
      { nameKey: "splits",    href: "/splits",    icon: PieChart, iconColor: "text-green-400" },
      { nameKey: "payouts",   href: "/payouts",   icon: Wallet,   iconColor: "text-green-400" },
    ],
  },
  {
    titleKey: "support_group",
    items: [
      { nameKey: "support", href: "/support", icon: LifeBuoy, iconColor: "text-yellow-400" },
    ],
  },
  {
    titleKey: "account_group",
    items: [
      { nameKey: "settings", href: "/settings", icon: Settings2,  iconColor: "text-slate-400" },
      { nameKey: "profile",  href: "/profile",  icon: CircleUser, iconColor: "text-pink-400" },
    ],
  },
];

function pickGroupsForRole(role: Role | undefined): NavGroup[] {
  switch (role) {
    case "admin":
    case "manager":
      return adminNavGroups;
    case "label":
      return labelNavGroups;
    case "artist":
      return artistNavGroups;
    default:
      return [];
  }
}

export function SidebarNav() {
  const [location] = useLocation();
  const search = useSearch();
  const { t } = useLang();
  const nav = t.nav as Record<string, string>;
  const { user, logout } = useAuth();
  const { perms } = useManagerPermissions(user?.role);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("sidebar-collapsed", String(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  const navGroups = pickGroupsForRole(user?.role);

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
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-[hsl(271_80%_68%)] flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
            <Music2 className="h-[18px] w-[18px] text-white" />
            <span className="absolute inset-0 rounded-xl ring-1 ring-white/10" />
          </div>
        ) : (
          <img
            src="/tajikmusic-logo.png"
            alt="Tajik Music"
            className="h-10 w-auto object-contain select-none"
            draggable={false}
          />
        )}
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-3 space-y-0.5" style={{ padding: collapsed ? "12px 8px" : "12px 10px" }}>
        {navGroups.map((group) => {
          // 1. Manager: проверяем permission всей группы.
          if (user?.role === "manager" && group.managerKey && perms[group.managerKey] === false) {
            return null;
          }
          // 2. Фильтруем items по canAccess (с manager_permissions).
          const visibleItems = user
            ? group.items.filter((item) => canAccess(user.role, item.href, perms))
            : [];
          if (visibleItems.length === 0) return null;
          return (
          <div key={group.titleKey}>
            {collapsed && <div className="h-px bg-white/[0.07] mb-2 mx-1" />}

            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                // Поддержка ссылок вида "/catalog?tab=releases": активность учитывает
                // и pathname, и query-часть. Без query — считаем активным любой child path,
                // НО только если на текущей странице нет таба (иначе хаб подсвечивался бы
                // одновременно с конкретным табом).
                const [itemPath, itemQuery = ""] = item.href.split("?");
                const currentSearch = (search ?? "").replace(/^\?/, "");
                let isActive: boolean;
                if (itemQuery) {
                  isActive = location === itemPath && currentSearch === itemQuery;
                } else if (itemPath === "/") {
                  isActive = location === "/";
                } else if (location === itemPath) {
                  isActive = !currentSearch;
                } else {
                  isActive = location.startsWith(itemPath + "/");
                }
                const labelKey =
                  (user && item.nameKeyByRole?.[user.role]) ?? item.nameKey;
                const labelText = nav[labelKey] ?? labelKey;

                const iconEl = (
                  <span
                    className={cn(
                      "nav-icon-wrap flex items-center justify-center rounded-lg shrink-0",
                      collapsed ? "h-[36px] w-[36px]" : "h-[28px] w-[28px] mr-2.5",
                      isActive ? "nav-icon-active" : "nav-icon-idle"
                    )}
                  >
                    <Icon
                      className={cn(
                        "transition-all duration-220",
                        collapsed ? "h-[18px] w-[18px]" : "h-[15px] w-[15px]",
                        isActive
                          ? cn(item.iconColor ?? "text-primary", "opacity-100 drop-shadow-[0_0_8px_currentColor]")
                          : item.iconColor
                            ? cn(item.iconColor, "opacity-55 group-hover:opacity-90")
                            : "text-white/40 group-hover:text-white/75"
                      )}
                      strokeWidth={1.9}
                    />
                  </span>
                );

                return (
                  <Link key={item.href} href={item.href}>
                    <span
                      title={collapsed ? labelText : undefined}
                      className={cn(
                        "nav-item group relative flex items-center rounded-xl cursor-pointer",
                        collapsed ? "px-0 py-0 justify-center h-[44px]" : "px-2.5 py-[7px]",
                        isActive ? "nav-item-active" : "nav-item-inactive"
                      )}
                    >
                      {iconEl}

                      {!collapsed && (
                        <>
                          <span
                            className={cn(
                              "flex-1 truncate text-[13px] transition-colors duration-200",
                              isActive
                                ? "text-white font-semibold"
                                : "text-white/65 font-medium group-hover:text-white/95"
                            )}
                          >
                            {labelText}
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

      {/* Collapse / Expand */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Развернуть меню" : "Свернуть меню"}
        className={cn(
          "relative flex items-center justify-center gap-2 w-full cursor-pointer select-none",
          "h-11 transition-all duration-200",
          "bg-[hsl(222_40%_6%)]",
          "hover:bg-[hsl(222_40%_8%)]",
          "active:scale-[0.98]",
          "border-t border-primary/30",
          "shadow-[0_-2px_12px_hsl(226_84%_67%/0.25),0_-1px_0_hsl(226_84%_67%/0.3)_inset]",
          "hover:shadow-[0_-2px_20px_hsl(226_84%_67%/0.45),0_-1px_0_hsl(226_84%_67%/0.5)_inset,0_0_30px_hsl(271_80%_68%/0.15)]",
          "text-primary font-bold text-[10px] tracking-[0.12em] uppercase",
          "overflow-hidden"
        )}
      >
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
