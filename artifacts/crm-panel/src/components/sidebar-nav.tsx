import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Music,
  Disc3,
  Users,
  Building2,
  Users2,
  DollarSign,
  PieChart,
  Wallet,
  BookOpen,
  LineChart,
  Send,
  UserCog,
  Settings,
  LogOut,
} from "lucide-react";
import { Button } from "./ui/button";

const navGroups = [
  {
    title: "Overview",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Analytics", href: "/analytics", icon: LineChart },
    ],
  },
  {
    title: "Catalog",
    items: [
      { name: "Catalog", href: "/catalog", icon: Music },
      { name: "Releases", href: "/releases", icon: Disc3 },
      { name: "Artists", href: "/artists", icon: Users },
      { name: "Labels", href: "/labels", icon: Building2 },
    ],
  },
  {
    title: "Operations",
    items: [
      { name: "Delivery", href: "/delivery", icon: Send },
      { name: "Publishing", href: "/publishing", icon: BookOpen },
      { name: "CRM", href: "/crm", icon: Users2 },
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
      { name: "Users", href: "/users", icon: UserCog },
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function SidebarNav() {
  const [location] = useLocation();

  return (
    <div className="flex h-full w-64 flex-col bg-card border-r border-border">
      <div className="p-6">
        <h1 className="text-xl font-bold text-primary tracking-tight">
          TAJIK MUSIC
          <span className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mt-1">
            Distribution
          </span>
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-4 space-y-6">
        {navGroups.map((group) => (
          <div key={group.title}>
            <h2 className="mb-2 px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {group.title}
            </h2>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));

                return (
                  <Link key={item.href} href={item.href}>
                    <span
                      className={cn(
                        "group flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors",
                        isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "mr-3 h-4 w-4 flex-shrink-0",
                          isActive ? "text-primary" : "text-muted-foreground group-hover:text-accent-foreground"
                        )}
                      />
                      {item.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-border">
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </div>
    </div>
  );
}
