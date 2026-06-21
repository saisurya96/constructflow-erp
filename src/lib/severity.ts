import type { Severity } from "@/db/schema";

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  warning: 2,
  good: 1,
  neutral: 0,
};

export function worst(...values: Severity[]): Severity {
  return values.reduce<Severity>(
    (acc, v) => (SEVERITY_RANK[v] > SEVERITY_RANK[acc] ? v : acc),
    "neutral",
  );
}

/** "Higher is better" metrics (coverage, progress, on-time rate). */
export function severityForPercent(
  value: number,
  { warn = 90, crit = 75 }: { warn?: number; crit?: number } = {},
): Severity {
  if (value >= warn) return "good";
  if (value >= crit) return "warning";
  return "critical";
}

export function coverageSeverity(covered: number, required: number): Severity {
  if (required <= 0) return "neutral";
  return severityForPercent((covered / required) * 100, { warn: 100, crit: 60 });
}

export function daysUntil(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  // A bare date-only string ("2026-06-21") is parsed by `new Date()` as UTC
  // midnight; in a negative-UTC-offset tenant that snaps to the *previous*
  // local day, so a deadline due today reads as overdue. Parse date-only
  // strings as LOCAL midnight to agree with the board (work-views pdate) and
  // My Work, which both already do `new Date(s + "T00:00:00")`.
  const d =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(date + "T00:00:00")
      : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Deadline severity given remaining days and completion progress. */
export function deadlineSeverity(
  dueDate: string | null | undefined,
  progress: number,
): Severity {
  const days = daysUntil(dueDate);
  if (days === null) return "neutral";
  if (progress >= 100) return "good";
  if (days < 0) return "critical";
  if (days <= 3) return "warning";
  return "good";
}

/** Project health from cost variance, schedule and open critical items. */
export function projectHealth(params: {
  progress: number;
  costVariancePct: number; // (forecast - budget) / budget * 100
  daysToDeadline: number | null;
  openCriticalActions: number;
}): Severity {
  const signals: Severity[] = [];
  if (params.openCriticalActions > 0) signals.push("critical");
  if (params.costVariancePct > 10) signals.push("critical");
  else if (params.costVariancePct > 3) signals.push("warning");
  if (params.daysToDeadline !== null && params.progress < 100) {
    if (params.daysToDeadline < 0) signals.push("critical");
    else if (params.daysToDeadline <= 7) signals.push("warning");
  }
  if (signals.length === 0) return "good";
  return worst(...signals);
}
