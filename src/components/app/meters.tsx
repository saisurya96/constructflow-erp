import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/constants";

const BAR_TONE: Record<BadgeTone, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  good: "bg-good",
  info: "bg-info",
  neutral: "bg-primary",
};

/** Simple labeled progress meter. */
export function ProgressMeter({
  value,
  tone = "info",
  className,
  showLabel = true,
}: {
  value: number;
  tone?: BadgeTone;
  className?: string;
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", BAR_TONE[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-9 shrink-0 text-right text-xs tabular text-muted-foreground">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}

/**
 * Coverage bar showing allocated (good) + inbound (info) against requirement.
 * Visualizes the material-loop "required vs allocated vs inbound vs shortage".
 */
export function CoverageBar({
  required,
  allocated,
  inbound,
  className,
}: {
  required: number;
  allocated: number;
  inbound: number;
  className?: string;
}) {
  const base = required > 0 ? required : Math.max(allocated + inbound, 1);
  const allocPct = Math.min(100, (allocated / base) * 100);
  const inboundPct = Math.min(100 - allocPct, (inbound / base) * 100);
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full bg-good" style={{ width: `${allocPct}%` }} />
      <div className="h-full bg-info/70" style={{ width: `${inboundPct}%` }} />
    </div>
  );
}
