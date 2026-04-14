import { cn } from "@/lib/utils";

type StatusType =
  | "draft" | "pending_review" | "approved" | "delivering" | "delivered"
  | "live" | "error" | "takedown_requested" | "removed"
  | "active" | "inactive" | "suspended"
  | "todo" | "in_progress" | "done" | "cancelled"
  | "pending" | "paid" | "rejected"
  | "registered"
  | "failed" | "acknowledged"
  | "sent" | "expiring" | "open" | "in_review" | "resolved" | "connected"
  | "accepted" | "declined";

interface StatusConfig {
  pill: string;
  dot: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  // Green — success / live
  live:         { pill: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  active:       { pill: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  delivered:    { pill: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  done:         { pill: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  paid:         { pill: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  approved:     { pill: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  registered:   { pill: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  acknowledged: { pill: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  sent:         { pill: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  resolved:     { pill: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  connected:    { pill: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  accepted:     { pill: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },

  // Amber — pending / warning
  pending:         { pill: "bg-amber-500/12 text-amber-400 border-amber-500/25", dot: "bg-amber-400" },
  pending_review:  { pill: "bg-amber-500/12 text-amber-400 border-amber-500/25", dot: "bg-amber-400" },
  todo:            { pill: "bg-amber-500/12 text-amber-400 border-amber-500/25", dot: "bg-amber-400" },
  expiring:        { pill: "bg-amber-500/12 text-amber-400 border-amber-500/25", dot: "bg-amber-400" },

  // Blue — in-flight
  delivering:  { pill: "bg-blue-500/12 text-blue-400 border-blue-500/25", dot: "bg-blue-400" },
  in_progress: { pill: "bg-blue-500/12 text-blue-400 border-blue-500/25", dot: "bg-blue-400" },
  in_review:   { pill: "bg-blue-500/12 text-blue-400 border-blue-500/25", dot: "bg-blue-400" },
  open:        { pill: "bg-blue-500/12 text-blue-400 border-blue-500/25", dot: "bg-blue-400" },

  // Red — error / removed
  error:              { pill: "bg-rose-500/12 text-rose-400 border-rose-500/25", dot: "bg-rose-400" },
  failed:             { pill: "bg-rose-500/12 text-rose-400 border-rose-500/25", dot: "bg-rose-400" },
  rejected:           { pill: "bg-rose-500/12 text-rose-400 border-rose-500/25", dot: "bg-rose-400" },
  suspended:          { pill: "bg-rose-500/12 text-rose-400 border-rose-500/25", dot: "bg-rose-400" },
  removed:            { pill: "bg-rose-500/12 text-rose-400 border-rose-500/25", dot: "bg-rose-400" },
  cancelled:          { pill: "bg-rose-500/12 text-rose-400 border-rose-500/25", dot: "bg-rose-400" },
  takedown_requested: { pill: "bg-rose-500/12 text-rose-400 border-rose-500/25", dot: "bg-rose-400" },
  declined:           { pill: "bg-rose-500/12 text-rose-400 border-rose-500/25", dot: "bg-rose-400" },

  // Muted — neutral / inactive
  draft:    { pill: "bg-slate-500/10 text-slate-400 border-slate-500/20", dot: "bg-slate-500" },
  inactive: { pill: "bg-slate-500/10 text-slate-400 border-slate-500/20", dot: "bg-slate-500" },
};

const FALLBACK: StatusConfig = {
  pill: "bg-muted/60 text-muted-foreground border-border/40",
  dot:  "bg-muted-foreground",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
  showDot?: boolean;
}

export function StatusBadge({ status, className, showDot = true }: StatusBadgeProps) {
  const key = status.toLowerCase() as StatusType;
  const config = STATUS_MAP[key] ?? FALLBACK;

  const label = status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[11px] font-semibold border tracking-wide",
        config.pill,
        className
      )}
    >
      {showDot && (
        <span
          className={cn("h-[5px] w-[5px] rounded-full shrink-0", config.dot)}
        />
      )}
      {label}
    </span>
  );
}
