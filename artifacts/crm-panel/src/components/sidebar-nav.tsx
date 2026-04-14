import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import {
  LayoutDashboard,
  LineChart,
  Send,
  Disc3,
  Users,
  Building2,
  Video,
  BookOpen,
  ShieldCheck,
  Users2,
  Mail,
  Megaphone,
  DollarSign,
  PieChart,
  Wallet,
  UserCog,
  Zap,
  Settings,
  LogOut,
  Music2,
} from "lucide-react";

type NavItem = {
  nameKey: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: string;
};

type NavGroup = {
  titleKey: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    titleKey: "overview",
    items: [
      { nameKey: "dashboard", href: "/", icon: LayoutDashboard },
      { nameKey: "analytics", href: "/analytics", icon: LineChart },
    ],
  },
  {
    titleKey: "distribution_group",
    items: [
      { nameKey: "distribution", href: "/distribution", icon: Send, badge: "3", badgeColor: "bg-amber-500" },
    ],
  },
  {
    titleKey: "catalog",
    items: [
      { nameKey: "releases", href: "/releases", icon: Disc3 },
      { nameKey: "artists", href: "/artists", icon: Users },
      { nameKey: "labels", href: "/labels", icon: Building2 },
      { nameKey: "videos", href: "/videos", icon: Video },
    ],
  },
  {
    titleKey: "users_group",
    items: [
      { nameKey: "users", href: "/users", icon: UserCog },
    ],
  },
  {
    titleKey: "operations",
    items: [
      { nameKey: "publishing", href: "/publishing", icon: BookOpen },
      { nameKey: "rights", href: "/rights", icon: ShieldCheck },
      { nameKey: "crm", href: "/crm", icon: Users2 },
      { nameKey: "communications", href: "/communications", icon: Mail },
      { nameKey: "marketing", href: "/marketing", icon: Megaphone },
    ],
  },
  {
    titleKey: "financials",
    items: [
      { nameKey: "finance", href: "/finance", icon: DollarSign },
      { nameKey: "splits", href: "/splits", icon: PieChart },
      { nameKey: "payouts", href: "/payouts", icon: Wallet },
    ],
  },
  {
    titleKey: "system",
    items: [
      { nameKey: "automation", href: "/automation", icon: Zap },
      { nameKey: "settings", href: "/settings", icon: Settings },
    ],
  },
];

export function SidebarNav() {
  const [location] = useLocation();
  const { t } = useLang();
  const nav = t.nav as Record<string, string>;

  return (
    <div className="flex h-full w-[230px] flex-col shrink-0 border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))]">
      <div className="px-5 pt-6 pb-5 border-b border-[hsl(var(--sidebar-border))]">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-[hsl(271_80%_68%)] flex items-center justify-center shadow-lg shadow-primary/25 shrink-0">
            <Music2 className="h-4.5 w-4.5 text-white" />
            <span className="absolute inset-0 rounded-xl ring-1 ring-white/10" />
          </div>
          <div>
            <h1 className="text-[13px] font-bold text-foreground tracking-tight leading-none mb-0.5">
              TAJIK MUSIC
            </h1>
            <span className="text-[9.5px] font-semibold text-primary/70 uppercase tracking-[0.15em]">
              Distribution
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {navGroups.map((group) => (
          <div key={group.titleKey}>
            <p className="mb-1.5 px-2.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
              {nav[group.titleKey] ?? group.titleKey}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));

                return (
                  <Link key={item.href} href={item.href}>
                    <span
                      className={cn(
                        "group relative flex items-center rounded-lg px-2.5 py-2 text-[13px] font-medium cursor-pointer transition-all duration-150",
                        isActive
                          ? "nav-active-bar bg-gradient-to-r from-primary/15 to-primary/5 text-primary"
                          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "mr-2.5 h-[15px] w-[15px] flex-shrink-0 transition-colors",
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground/60 group-hover:text-foreground/70"
                        )}
                      />
                      <span className="flex-1 truncate">{nav[item.nameKey] ?? item.nameKey}</span>
                      {item.badge && (
                        <span
                          className={cn(
                            "ml-auto flex h-4.5 min-w-[18px] items-center justify-center rounded-full px-1.5 text-[9px] font-bold text-white shadow-sm",
                            item.badgeColor ?? "bg-primary"
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-[hsl(var(--sidebar-border))]">
        <div className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-all duration-150 group">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold text-primary">AU</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-foreground truncate leading-tight">Admin User</p>
            <p className="text-[10px] text-muted-foreground/70 truncate">admin@tajikmusic.com</p>
          </div>
          <LogOut className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
        </div>
      </div>
    </div>
  );
}
