import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/constants";

const TONE_ACCENT: Record<BadgeTone, string> = {
  critical: "text-critical",
  warning: "text-warning-foreground",
  good: "text-good",
  info: "text-info",
  neutral: "text-foreground",
};

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: BadgeTone;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-xs flex flex-col gap-1",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className={cn("text-2xl font-semibold tabular", TONE_ACCENT[tone])}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
