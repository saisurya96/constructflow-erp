import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/constants";

const BAR_TONE: Record<BadgeTone, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  good: "bg-good",
  info: "bg-info",
  neutral: "bg-foreground",
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
      <div className="h-1.5 flex-1 overflow-hidden rounded-[2px] bg-muted">
        <div
          className={cn("h-full rounded-[2px] transition-all", BAR_TONE[tone])}
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
 * Coverage bar showing allocated (solid green) + received (lighter green, in
 * stock) + inbound (blue, on order) against the requirement. Visualizes the
 * material-loop "required vs allocated vs received vs inbound vs shortage".
 */
export function CoverageBar({
  required,
  allocated,
  received = 0,
  inbound,
  className,
}: {
  required: number;
  allocated: number;
  received?: number;
  inbound: number;
  className?: string;
}) {
  // A reservation draws from the same physical stock `received` counts, so don't
  // stack them additively (that reads 100% on a requirement that's actually short).
  // Show reserved, then only the received portion not already reserved, then inbound.
  const onHand = Math.max(0, received - allocated);
  const base = required > 0 ? required : Math.max(allocated + onHand + inbound, 1);
  const allocPct = Math.min(100, (allocated / base) * 100);
  const receivedPct = Math.min(100 - allocPct, (onHand / base) * 100);
  const inboundPct = Math.min(100 - allocPct - receivedPct, (inbound / base) * 100);
  return (
    <div className={cn("flex h-1.5 w-full overflow-hidden rounded-[2px] bg-muted", className)}>
      <div className="h-full bg-good" style={{ width: `${allocPct}%` }} />
      <div className="h-full bg-good/55" style={{ width: `${receivedPct}%` }} />
      <div className="h-full bg-info/70" style={{ width: `${inboundPct}%` }} />
    </div>
  );
}
