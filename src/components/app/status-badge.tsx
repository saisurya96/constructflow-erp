import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/constants";
import { titleCase } from "@/lib/constants";

const TONE: Record<BadgeTone, string> = {
  critical: "bg-critical/10 text-critical ring-critical/25",
  warning: "bg-warning/20 text-warning-foreground ring-warning/40",
  good: "bg-good/12 text-good ring-good/25",
  info: "bg-info/12 text-info ring-info/25",
  neutral: "bg-muted text-muted-foreground ring-border",
};

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Convenience: render an enum status with a tone map and humanized label. */
export function StatusPill({
  status,
  tones,
  className,
}: {
  status: string;
  tones: Record<string, BadgeTone>;
  className?: string;
}) {
  return (
    <StatusBadge tone={tones[status] ?? "neutral"} className={className}>
      {titleCase(status)}
    </StatusBadge>
  );
}
