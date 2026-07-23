import { useId, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type CreateReleaseButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: "default" | "sm";
};

/**
 * Shared CTA for every entry point into /releases/new.
 * Dimensions intentionally match the existing Button default/sm sizes so it
 * stays aligned with neighbouring controls while carrying the neon treatment.
 */
export function CreateReleaseButton({
  label,
  size = "default",
  className,
  ...props
}: CreateReleaseButtonProps) {
  const compact = size === "sm";
  return (
    <button
      type="button"
      className={cn(
        "group relative isolate inline-flex shrink-0 items-center justify-center overflow-hidden border border-violet-400/20 bg-[#030305] font-medium text-white",
        "transition-all duration-200 hover:border-violet-300/35 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "shadow-[0_0_14px_rgba(91,69,255,0.22)] hover:shadow-[0_0_20px_rgba(109,40,217,0.34)]",
        compact
          ? "h-8 gap-1.5 rounded-md px-3 text-xs"
          : "h-9 gap-2 rounded-md px-4 text-sm",
        className,
      )}
      aria-label={label}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_25%_130%,rgba(37,99,235,0.20),transparent_52%),radial-gradient(circle_at_80%_-35%,rgba(147,51,234,0.16),transparent_48%)]"
      />
      <NeonMicrophoneIcon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      <span className="whitespace-nowrap leading-none">{label}</span>
    </button>
  );
}

function NeonMicrophoneIcon({ className }: { className?: string }) {
  const gradientId = `release-mic-${useId().replace(/:/g, "")}`;
  return (
    <span className="relative shrink-0" aria-hidden="true">
      <span className="absolute inset-0 rounded-full bg-violet-500/55 blur-sm" />
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className={cn("relative overflow-visible drop-shadow-[0_0_3px_rgba(139,92,246,0.9)]", className)}
      >
        <defs>
          <linearGradient id={gradientId} x1="8" y1="6" x2="39" y2="43" gradientUnits="userSpaceOnUse">
            <stop stopColor="#168BFF" />
            <stop offset="0.48" stopColor="#665CFF" />
            <stop offset="1" stopColor="#D51CFF" />
          </linearGradient>
        </defs>
        <g stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="18" y="13" width="12" height="19" rx="6" />
          <path d="M13 25.5v1.5a11 11 0 0 0 22 0v-1.5" />
          <path d="M24 38v6M17.5 44h13" />
          <path d="M13.2 18.5a11.5 11.5 0 0 1 21.6 0" />
          <path d="M8.5 17A16.2 16.2 0 0 1 39.5 17" />
        </g>
      </svg>
    </span>
  );
}

