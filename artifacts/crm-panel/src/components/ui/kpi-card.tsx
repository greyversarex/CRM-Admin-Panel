import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiTrend {
  value: string;
  up?: boolean;
  label?: string;
}

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  iconBorder?: string;
  trend?: KpiTrend;
  className?: string;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  iconBorder,
  trend,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "card-surface rounded-xl border border-border/60 p-5 flex flex-col gap-3",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 leading-none pt-0.5">
          {label}
        </p>
        <span
          className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border",
            iconBg,
            iconBorder ?? "border-transparent"
          )}
        >
          <Icon className={cn("h-[18px] w-[18px]", iconColor)} />
        </span>
      </div>

      <p className="text-[2rem] font-bold tracking-tight text-foreground leading-none">
        {value}
      </p>

      {trend && (
        <div className="flex items-center gap-1.5">
          {trend.up === true && (
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          )}
          {trend.up === false && (
            <TrendingDown className="h-3.5 w-3.5 text-rose-500 shrink-0" />
          )}
          {trend.up === undefined && (
            <Minus className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          )}
          <span
            className={cn(
              "text-[12px] font-semibold",
              trend.up === true
                ? "text-emerald-500"
                : trend.up === false
                ? "text-rose-500"
                : "text-muted-foreground"
            )}
          >
            {trend.value}
          </span>
          {trend.label && (
            <span className="text-[11px] text-muted-foreground/50">
              {trend.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
