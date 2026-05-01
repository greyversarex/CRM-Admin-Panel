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
        "card-surface rounded-xl border border-border/60 p-4 flex flex-col gap-2.5",
        "relative overflow-hidden",
        className
      )}
    >
      {/* Label + icon row */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/85 leading-none">
          {label}
        </p>
        <span
          className={cn(
            "h-7 w-7 rounded-md flex items-center justify-center shrink-0 border",
            iconBg,
            iconBorder ?? "border-transparent"
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", iconColor)} />
        </span>
      </div>

      {/* Value */}
      <p className="text-[1.6rem] font-bold tracking-tight text-foreground leading-none truncate">
        {value}
      </p>

      {/* Trend */}
      {trend && (
        <div className="flex items-center gap-1 mt-0.5">
          {trend.up === true && (
            <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
          )}
          {trend.up === false && (
            <TrendingDown className="h-3 w-3 text-rose-500 shrink-0" />
          )}
          {trend.up === undefined && (
            <Minus className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
          )}
          <span
            className={cn(
              "text-[11.5px] font-semibold leading-none",
              trend.up === true
                ? "text-emerald-500"
                : trend.up === false
                ? "text-rose-500"
                : "text-muted-foreground/75"
            )}
          >
            {trend.value}
          </span>
          {trend.label && (
            <span className="text-[10.5px] text-muted-foreground/55 leading-none">
              {trend.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
