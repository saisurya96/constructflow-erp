import type { UserRole } from "@/db/schema";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  pm: "Project Manager",
  buyer: "Procurement",
  storekeeper: "Stores",
  finance: "Cost & Finance",
};

export const ROLE_TAGLINES: Record<UserRole, string> = {
  admin: "Company, people & oversight",
  pm: "Plan, track & raise needs",
  buyer: "Source, compare & order",
  storekeeper: "Receive, stock & allocate",
  finance: "Cost, bill & approve",
};

/** Coarse-grained capabilities checked in server actions and page loaders. */
export type Capability =
  | "projects.view"
  | "projects.manage"
  | "schedule.manage"
  | "requirements.raise"
  | "requirements.source"
  | "procurement.view"
  | "procurement.manage"
  | "vendors.manage"
  | "inventory.manage"
  | "inventory.allocate"
  | "costing.view"
  | "billing.manage"
  | "changeorders.manage"
  | "approvals.decide"
  | "audit.view"
  | "admin.manage";

const CAPS: Record<Capability, UserRole[]> = {
  "projects.view": ["pm", "finance", "admin"],
  "projects.manage": ["pm", "admin"],
  "schedule.manage": ["pm", "admin"],
  "requirements.raise": ["pm", "admin"],
  "requirements.source": ["buyer", "admin"],
  // Read-only view of orders — buyers manage them, but finance/PM need to open
  // an order to review it (e.g. a finance approver authorizing the spend).
  "procurement.view": ["buyer", "finance", "pm", "admin"],
  "procurement.manage": ["buyer", "admin"],
  "vendors.manage": ["buyer", "admin"],
  "inventory.manage": ["storekeeper", "admin"],
  "inventory.allocate": ["storekeeper", "admin"],
  "costing.view": ["pm", "finance", "admin"],
  "billing.manage": ["finance", "admin"],
  "changeorders.manage": ["pm", "admin"],
  "approvals.decide": ["finance", "admin"],
  "audit.view": ["finance", "admin"],
  "admin.manage": ["admin"],
};

/** Admin is the tenant super-user; otherwise consult the capability matrix. */
export function can(role: UserRole, capability: Capability): boolean {
  if (role === "admin") return true;
  return CAPS[capability].includes(role);
}

/* ───────────────────────── navigation per role ───────────────────────── */

export type NavKey =
  | "dashboard"
  | "mywork"
  | "projects"
  | "requirements"
  | "rfqs"
  | "orders"
  | "vendors"
  | "deliveries"
  | "receipts"
  | "inventory"
  | "allocations"
  | "costing"
  | "billing"
  | "approvals"
  | "audit"
  | "admin";

export type NavItem = {
  key: NavKey;
  label: string;
  href: string;
  /** lucide icon name (resolved in the shell). */
  icon: string;
};

const NAV_DEFS: Record<NavKey, Omit<NavItem, "key">> = {
  dashboard: { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  mywork: { label: "My Work", href: "/my-work", icon: "ListTodo" },
  projects: { label: "Projects", href: "/projects", icon: "FolderKanban" },
  requirements: { label: "Requirements", href: "/requirements", icon: "ClipboardList" },
  rfqs: { label: "RFQs", href: "/rfqs", icon: "FileText" },
  orders: { label: "Purchase Orders", href: "/orders", icon: "ShoppingCart" },
  vendors: { label: "Vendors", href: "/vendors", icon: "Building2" },
  deliveries: { label: "Deliveries", href: "/deliveries", icon: "Truck" },
  receipts: { label: "Goods Receipts", href: "/receipts", icon: "PackageCheck" },
  inventory: { label: "Inventory", href: "/inventory", icon: "Boxes" },
  allocations: { label: "Allocations", href: "/allocations", icon: "Split" },
  costing: { label: "Job Costing", href: "/costing", icon: "Calculator" },
  billing: { label: "Billing", href: "/billing", icon: "Receipt" },
  approvals: { label: "Approvals", href: "/approvals", icon: "BadgeCheck" },
  audit: { label: "Audit Trail", href: "/audit", icon: "ScrollText" },
  admin: { label: "Administration", href: "/admin", icon: "Settings" },
};

const ROLE_NAV: Record<UserRole, NavKey[]> = {
  admin: [
    "dashboard",
    "mywork",
    "projects",
    "requirements",
    "rfqs",
    "orders",
    "vendors",
    "deliveries",
    "receipts",
    "inventory",
    "allocations",
    "costing",
    "billing",
    "approvals",
    "audit",
    "admin",
  ],
  pm: ["dashboard", "mywork", "projects", "requirements", "costing", "approvals"],
  buyer: ["dashboard", "mywork", "requirements", "rfqs", "orders", "vendors", "approvals"],
  storekeeper: ["dashboard", "mywork", "deliveries", "receipts", "inventory", "allocations"],
  finance: ["dashboard", "mywork", "projects", "costing", "billing", "approvals", "audit"],
};

export function navForRole(role: UserRole): NavItem[] {
  return ROLE_NAV[role].map((key) => ({ key, ...NAV_DEFS[key] }));
}

export function homeForRole(): string {
  return "/dashboard";
}
