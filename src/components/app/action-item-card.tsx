import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/constants";

const BORDER: Record<BadgeTone, string> = {
  critical: "border-l-critical",
  warning: "border-l-warning",
  good: "border-l-good",
  info: "border-l-info",
  neutral: "border-l-border",
};

/**
 * Action-queue card. Every card answers: what is this, who owns it,
 * what happens if ignored, and what action is available.
 */
export function ActionItemCard({
  tone = "neutral",
  title,
  detail,
  impact,
  owner,
  href,
  actionLabel,
}: {
  tone?: BadgeTone;
  title: string;
  detail?: string;
  impact?: string;
  owner?: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <div
      className={cn(
        "group rounded-md border border-l-2 bg-card p-3.5 transition-colors hover:bg-muted/40",
        BORDER[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-0.5 text-xs text-muted-foreground">
            {owner && (
              <span>
                Owner: <span className="text-foreground">{owner}</span>
              </span>
            )}
            {impact && (
              <span>
                Impact: <span className="text-foreground">{impact}</span>
              </span>
            )}
          </div>
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent group-hover:text-brand"
          >
            {actionLabel ?? "Open"}
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
