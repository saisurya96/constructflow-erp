import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/constants";

const TONE_ACCENT: Record<BadgeTone, string> = {
  critical: "text-critical",
  warning: "text-warning-foreground",
  good: "text-good",
  info: "text-foreground",
  neutral: "text-foreground",
};

const TONE_MARK: Record<BadgeTone, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  good: "bg-good",
  info: "bg-muted-foreground/40",
  neutral: "bg-muted-foreground/40",
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
        "group relative flex flex-col gap-3 rounded-lg border bg-card p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow flex items-center gap-1.5 text-muted-foreground">
          {tone !== "neutral" && tone !== "info" && (
            <span className={cn("size-1.5 rounded-[1px]", TONE_MARK[tone])} />
          )}
          {label}
        </span>
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
      </div>
      <div
        className={cn(
          "font-display text-[1.85rem] font-semibold leading-none tracking-tight tabular",
          TONE_ACCENT[tone],
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
