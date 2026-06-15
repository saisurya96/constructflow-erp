import type { Severity } from "@/db/schema";

/** Units of measure common to construction material & fit-out trades. */
export const UNITS = [
  "pcs",
  "no.",
  "ea",
  "set",
  "pair",
  "sheet",
  "m",
  "lm",
  "m2",
  "sqft",
  "m3",
  "kg",
  "ton",
  "bag",
  "roll",
  "drum",
  "litre",
  "lot",
  "ls",
] as const;

type WbsTemplate = { code: string; name: string };

/** Ground-up / new-build phase template (RIBA-ish element groups). */
export const NEW_BUILD_WBS_TEMPLATE: WbsTemplate[] = [
  { code: "1.0", name: "Preliminaries & General" },
  { code: "2.0", name: "Substructure & Foundations" },
  { code: "3.0", name: "Superstructure" },
  { code: "4.0", name: "External Envelope" },
  { code: "5.0", name: "Internal Finishes" },
  { code: "6.0", name: "MEP Services" },
  { code: "7.0", name: "External Works" },
  { code: "8.0", name: "Testing, Commissioning & Handover" },
];

/** Interior fit-out template (no substructure/envelope/external works). */
export const FIT_OUT_WBS_TEMPLATE: WbsTemplate[] = [
  { code: "1.0", name: "Preliminaries & Site Setup" },
  { code: "2.0", name: "Demolition & Enabling Works" },
  { code: "3.0", name: "Partitions & Ceilings" },
  { code: "4.0", name: "Flooring & Wall Finishes" },
  { code: "5.0", name: "Joinery & Millwork" },
  { code: "6.0", name: "MEP Fit-out (Elec / HVAC / Plumbing)" },
  { code: "7.0", name: "FF&E & Specialist Fit-out" },
  { code: "8.0", name: "Snagging, Testing & Handover" },
];

/** Renovation / refurbishment template. */
export const RENOVATION_WBS_TEMPLATE: WbsTemplate[] = [
  { code: "1.0", name: "Preliminaries & Surveys" },
  { code: "2.0", name: "Strip-out & Demolition" },
  { code: "3.0", name: "Structural Alterations & Repairs" },
  { code: "4.0", name: "MEP Upgrades" },
  { code: "5.0", name: "Internal Finishes" },
  { code: "6.0", name: "External Repairs & Decoration" },
  { code: "7.0", name: "Snagging & Handover" },
];

/** Minimal single-line template for firms that prefer to build their own. */
export const GENERIC_WBS_TEMPLATE: WbsTemplate[] = [
  { code: "1.0", name: "Preliminaries & General" },
];

export const WBS_TEMPLATES = {
  new_build: { label: "New build (ground-up)", codes: NEW_BUILD_WBS_TEMPLATE },
  fit_out: { label: "Interior fit-out", codes: FIT_OUT_WBS_TEMPLATE },
  renovation: { label: "Renovation / refurbishment", codes: RENOVATION_WBS_TEMPLATE },
  generic: { label: "Minimal (build my own)", codes: GENERIC_WBS_TEMPLATE },
} as const;

export type WbsTemplateKey = keyof typeof WBS_TEMPLATES;

/** Back-compat alias — the original default used across older call sites. */
export const DEFAULT_WBS_TEMPLATE = NEW_BUILD_WBS_TEMPLATE;

/* ───────────── locale / onboarding defaults (no UAE hard-coding) ───────────── */

/** Countries offered at signup, each with its default currency + headline VAT/GST. */
export const COUNTRIES: {
  code: string;
  name: string;
  currency: string;
  vat: number;
}[] = [
  { code: "AE", name: "United Arab Emirates", currency: "AED", vat: 5 },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", vat: 15 },
  { code: "QA", name: "Qatar", currency: "QAR", vat: 0 },
  { code: "OM", name: "Oman", currency: "OMR", vat: 5 },
  { code: "KW", name: "Kuwait", currency: "KWD", vat: 0 },
  { code: "BH", name: "Bahrain", currency: "BHD", vat: 10 },
  { code: "IN", name: "India", currency: "INR", vat: 18 },
  { code: "GB", name: "United Kingdom", currency: "GBP", vat: 20 },
  { code: "US", name: "United States", currency: "USD", vat: 0 },
  { code: "CA", name: "Canada", currency: "CAD", vat: 5 },
  { code: "AU", name: "Australia", currency: "AUD", vat: 10 },
  { code: "SG", name: "Singapore", currency: "SGD", vat: 9 },
  { code: "ZA", name: "South Africa", currency: "ZAR", vat: 15 },
  { code: "EU", name: "Eurozone", currency: "EUR", vat: 20 },
];

/** Currency codes selectable independently of country. */
export const CURRENCY_OPTIONS = [
  "AED", "SAR", "QAR", "OMR", "KWD", "BHD", "INR",
  "GBP", "USD", "CAD", "AUD", "SGD", "ZAR", "EUR",
] as const;

export function localeForCountry(code: string) {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

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

export const TASK_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

/** Ordered status columns for the Kanban board. */
export const TASK_STATUS_ORDER = [
  "not_started",
  "in_progress",
  "blocked",
  "done",
] as const;

export const TASK_PRIORITY_TONE: Record<string, BadgeTone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "critical",
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const TASK_PRIORITY_ORDER = ["urgent", "high", "medium", "low"] as const;

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
