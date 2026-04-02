import { cn } from "@/lib/utils";

type StatusType = 
  | "draft" | "pending_review" | "approved" | "delivering" | "delivered" | "live" | "error" | "takedown_requested" | "removed" // Releases
  | "active" | "inactive" | "suspended" // General
  | "todo" | "in_progress" | "done" | "cancelled" // Tasks
  | "pending" | "paid" | "rejected" // Payouts
  | "registered" // Publishing
  | "failed" | "acknowledged"; // Delivery

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase() as StatusType;
  
  let colorClass = "bg-gray-500/10 text-gray-500 border-gray-500/20";
  
  switch (normalizedStatus) {
    case "live":
    case "active":
    case "delivered":
    case "done":
    case "paid":
    case "approved":
    case "registered":
    case "acknowledged":
      colorClass = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      break;
    case "pending":
    case "pending_review":
    case "todo":
      colorClass = "bg-amber-500/10 text-amber-500 border-amber-500/20";
      break;
    case "error":
    case "failed":
    case "rejected":
    case "suspended":
    case "removed":
    case "cancelled":
    case "takedown_requested":
      colorClass = "bg-rose-500/10 text-rose-500 border-rose-500/20";
      break;
    case "delivering":
    case "in_progress":
      colorClass = "bg-blue-500/10 text-blue-500 border-blue-500/20";
      break;
    case "draft":
    case "inactive":
      colorClass = "bg-slate-500/10 text-slate-400 border-slate-500/20";
      break;
  }

  const label = status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border", colorClass, className)}>
      {label}
    </span>
  );
}
