import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
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
  ChevronDown,
} from "lucide-react";
import { Button } from "./ui/button";
import { useState } from "react";

type NavItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Analytics", href: "/analytics", icon: LineChart },
    ],
  },
  {
    title: "Distribution",
    items: [
      { name: "Distribution", href: "/distribution", icon: Send, badge: "3", badgeColor: "bg-amber-500" },
    ],
  },
  {
    title: "Catalog",
    items: [
      { name: "Releases", href: "/releases", icon: Disc3 },
      { name: "Artists", href: "/artists", icon: Users },
      { name: "Labels", href: "/labels", icon: Building2 },
      { name: "Videos", href: "/videos", icon: Video },
    ],
  },
  {
    title: "Users",
    items: [
      { name: "Users", href: "/users", icon: UserCog },
    ],
  },
  {
    title: "Operations",
    items: [
      { name: "Publishing", href: "/publishing", icon: BookOpen },
      { name: "Rights Management", href: "/rights", icon: ShieldCheck },
      { name: "CRM", href: "/crm", icon: Users2 },
      { name: "Communications", href: "/communications", icon: Mail },
      { name: "Marketing", href: "/marketing", icon: Megaphone },
    ],
  },
  {
    title: "Financials",
    items: [
      { name: "Finance", href: "/finance", icon: DollarSign },
      { name: "Splits", href: "/splits", icon: PieChart },
      { name: "Payouts", href: "/payouts", icon: Wallet },
    ],
  },
  {
    title: "System",
    items: [
      { name: "Automation", href: "/automation", icon: Zap },
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function SidebarNav() {
  const [location] = useLocation();

  return (
    <div className="flex h-full w-60 flex-col bg-card border-r border-border shrink-0">
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Music2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground tracking-tight leading-none">
              TAJIK MUSIC
            </h1>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
              Distribution
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
        {navGroups.map((group) => (
          <div key={group.title}>
            <h2 className="mb-1 px-2 text-[10px] font-semibold tracking-widest text-muted-foreground/60 uppercase">
              {group.title}
            </h2>
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
                        "group flex items-center rounded-md px-2.5 py-2 text-sm font-medium cursor-pointer transition-all duration-150",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "mr-2.5 h-4 w-4 flex-shrink-0 transition-colors",
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground/70 group-hover:text-foreground"
                        )}
                      />
                      <span className="flex-1 truncate">{item.name}</span>
                      {item.badge && (
                        <span
                          className={cn(
                            "ml-auto flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
                            item.badgeColor ?? "bg-primary"
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                      {isActive && (
                        <span className="ml-auto w-1 h-4 rounded-full bg-primary opacity-0 group-data-[active=true]:opacity-100" />
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors group">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">AU</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">Admin User</p>
            <p className="text-[10px] text-muted-foreground truncate">admin@tajikmusic.com</p>
          </div>
          <LogOut className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
        </div>
      </div>
    </div>
  );
}
