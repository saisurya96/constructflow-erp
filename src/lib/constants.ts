import type { Severity } from "@/db/schema";

/** Units of measure common to construction material. */
export const UNITS = [
  "pcs",
  "ea",
  "m",
  "m2",
  "m3",
  "kg",
  "ton",
  "bag",
  "roll",
  "drum",
  "litre",
  "set",
  "lot",
  "ls",
] as const;

/** Default phase-based WBS / cost-code template for a small construction firm. */
export const DEFAULT_WBS_TEMPLATE: { code: string; name: string }[] = [
  { code: "1.0", name: "Preliminaries & General" },
  { code: "2.0", name: "Substructure & Foundations" },
  { code: "3.0", name: "Superstructure" },
  { code: "4.0", name: "External Envelope" },
  { code: "5.0", name: "Internal Finishes" },
  { code: "6.0", name: "MEP Services" },
  { code: "7.0", name: "External Works" },
  { code: "8.0", name: "Testing, Commissioning & Handover" },
];

export const VENDOR_CATEGORIES = [
  "Steel & Rebar",
  "Concrete & Aggregates",
  "Blockwork & Masonry",
  "Electrical",
  "Plumbing & MEP",
  "Finishes",
  "Joinery",
  "Equipment Hire",
  "Subcontractor",
  "General Supplies",
] as const;

/* ───────── status → badge variant maps (text-first, color secondary) ───────── */

export type BadgeTone = "critical" | "warning" | "good" | "neutral" | "info";

export const SEVERITY_TONE: Record<Severity, BadgeTone> = {
  critical: "critical",
  warning: "warning",
  good: "good",
  neutral: "neutral",
};

export function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const PROJECT_STATUS_TONE: Record<string, BadgeTone> = {
  planning: "info",
  active: "good",
  on_hold: "warning",
  completed: "neutral",
  archived: "neutral",
};

export const TASK_STATUS_TONE: Record<string, BadgeTone> = {
  not_started: "neutral",
  in_progress: "info",
  blocked: "critical",
  done: "good",
};

export const REQUIREMENT_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  submitted: "info",
  sourcing: "warning",
  ordered: "info",
  partially_received: "warning",
  fulfilled: "good",
  cancelled: "neutral",
};

export const PO_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  pending_approval: "warning",
  approved: "info",
  released: "info",
  partially_received: "warning",
  received: "good",
  closed: "neutral",
  cancelled: "neutral",
};

export const RFQ_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  issued: "info",
  quoting: "info",
  comparing: "warning",
  awarded: "good",
  cancelled: "neutral",
};

export const INVOICE_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  sent: "info",
  partially_paid: "warning",
  paid: "good",
  void: "neutral",
};

export const APPROVAL_STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  approved: "good",
  rejected: "critical",
};

export const CHANGE_ORDER_STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  submitted: "warning",
  approved: "good",
  rejected: "critical",
  applied: "info",
};
