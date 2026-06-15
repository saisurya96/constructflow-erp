/**
 * ConstructFlow ERP — database schema (Drizzle / PostgreSQL).
 *
 * One product woven from Project Management + the material value chain. Every
 * tenant-scoped table carries `company_id`; Row-Level Security (see ./rls.sql)
 * enforces isolation at the database layer. Money is stored as numeric and read
 * as string to preserve precision — convert with `num()` from "@/lib/money".
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ────────────────────────────── enums ────────────────────────────── */

export const userRole = pgEnum("user_role", [
  "admin",
  "pm",
  "buyer",
  "storekeeper",
  "finance",
]);

export const severity = pgEnum("severity", [
  "critical",
  "warning",
  "good",
  "neutral",
]);

export const projectStatus = pgEnum("project_status", [
  "planning",
  "active",
  "on_hold",
  "completed",
  "archived",
]);

export const taskStatus = pgEnum("task_status", [
  "not_started",
  "in_progress",
  "blocked",
  "done",
]);

export const milestoneStatus = pgEnum("milestone_status", [
  "pending",
  "reached",
  "invoiced",
  "missed",
]);

export const requirementStatus = pgEnum("requirement_status", [
  "draft",
  "submitted",
  "sourcing",
  "ordered",
  "partially_received",
  "fulfilled",
  "cancelled",
]);

export const rfqStatus = pgEnum("rfq_status", [
  "draft",
  "issued",
  "quoting",
  "comparing",
  "awarded",
  "cancelled",
]);

export const quoteStatus = pgEnum("quote_status", [
  "pending",
  "received",
  "awarded",
  "rejected",
]);

export const procurementType = pgEnum("procurement_type", [
  "purchase_order",
  "subcontract",
]);

export const poStatus = pgEnum("po_status", [
  "draft",
  "pending_approval",
  "approved",
  "released",
  "partially_received",
  "received",
  "closed",
  "cancelled",
]);

export const grnStatus = pgEnum("grn_status", [
  "draft",
  "posted",
  "rejected",
  "reversed",
]);

export const grnLineCondition = pgEnum("grn_line_condition", [
  "good",
  "damaged",
  "partial",
  "rejected",
]);

export const movementType = pgEnum("movement_type", [
  "receipt",
  "issue",
  "return",
  "transfer_in",
  "transfer_out",
  "adjustment",
]);

export const allocationStatus = pgEnum("allocation_status", [
  "reserved",
  "issued",
  "cancelled",
]);

export const changeOrderStatus = pgEnum("change_order_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "applied",
]);

export const invoiceType = pgEnum("invoice_type", ["milestone", "progress"]);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "void",
]);

export const approvalType = pgEnum("approval_type", [
  "purchase_order",
  "subcontract",
  "change_order",
  "invoice",
]);

export const approvalStatus = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const costType = pgEnum("cost_type", [
  "budget",
  "commitment",
  "actual",
  "forecast",
]);

/* ─────────────────────── shared column builders ─────────────────────── */

const id = () => uuid("id").primaryKey().defaultRandom();
const companyId = () =>
  uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const qty = (name: string) => numeric(name, { precision: 16, scale: 3 });
const pct = (name: string) => numeric(name, { precision: 6, scale: 2 });
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ────────────────────────────── tenancy ────────────────────────────── */

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  currencyCode: text("currency_code").notNull().default("AED"),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default("5.00"),
  country: text("country").notNull().default("AE"),
  address: text("address"),
  poApprovalThreshold: money("po_approval_threshold").notNull().default("50000"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    companyId: companyId(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    title: text("title"),
    phone: text("phone"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    companyId: companyId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const invitations = pgTable("invitations", {
  id: id(),
  companyId: companyId(),
  email: text("email").notNull(),
  role: userRole("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/** Per-company human-readable document numbering (PO-0001, RFQ-0001, ...). */
export const numberSequences = pgTable(
  "number_sequences",
  {
    companyId: companyId(),
    entity: text("entity").notNull(),
    nextVal: integer("next_val").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.entity] })],
);

/* ────────────────────────────── vendors ────────────────────────────── */

export const vendors = pgTable(
  "vendors",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
    code: text("code"),
    category: text("category"),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("0"),
    onTimeRate: pct("on_time_rate").notNull().default("0"),
    defectRate: pct("defect_rate").notNull().default("0"),
    totalSpend: money("total_spend").notNull().default("0"),
    isSubcontractor: boolean("is_subcontractor").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("vendors_company_idx").on(t.companyId)],
);

/* ────────────────────────────── projects ───────────────────────────── */

export const projects = pgTable(
  "projects",
  {
    id: id(),
    companyId: companyId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    clientName: text("client_name"),
    location: text("location"),
    status: projectStatus("status").notNull().default("planning"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    budget: money("budget").notNull().default("0"),
    contractValue: money("contract_value").notNull().default("0"),
    progress: pct("progress").notNull().default("0"),
    health: severity("health").notNull().default("neutral"),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("projects_company_idx").on(t.companyId),
    uniqueIndex("projects_code_unique").on(t.companyId, t.code),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    id: id(),
    companyId: companyId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleOnProject: text("role_on_project"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("project_members_unique").on(t.projectId, t.userId)],
);

/** Work Breakdown Structure / cost codes (editable phase-based template). */
export const wbsCodes = pgTable(
  "wbs_codes",
  {
    id: id(),
    companyId: companyId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    budget: money("budget").notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("wbs_code_unique").on(t.projectId, t.code),
    index("wbs_project_idx").on(t.projectId),
  ],
);

/* ───────────────────────── schedule (tasks) ────────────────────────── */

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    companyId: companyId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    wbsId: uuid("wbs_id").references(() => wbsCodes.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    status: taskStatus("status").notNull().default("not_started"),
    progress: pct("progress").notNull().default("0"),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    isBlocked: boolean("is_blocked").notNull().default(false),
    weight: numeric("weight", { precision: 8, scale: 2 }).notNull().default("1"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tasks_project_idx").on(t.projectId)],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: id(),
    companyId: companyId(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnId: uuid("depends_on_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("task_dep_unique").on(t.taskId, t.dependsOnId)],
);

export const milestones = pgTable(
  "milestones",
  {
    id: id(),
    companyId: companyId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dueDate: date("due_date"),
    status: milestoneStatus("status").notNull().default("pending"),
    billingAmount: money("billing_amount").notNull().default("0"),
    billingPercent: pct("billing_percent"),
    reachedAt: date("reached_at"),
    invoiceId: uuid("invoice_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("milestones_project_idx").on(t.projectId)],
);

/* ───────────────────── material requirements ───────────────────────── */

export const projectRequirements = pgTable(
  "project_requirements",
  {
    id: id(),
    companyId: companyId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    wbsId: uuid("wbs_id").references(() => wbsCodes.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    description: text("description"),
    unit: text("unit").notNull(),
    quantity: qty("quantity").notNull(),
    neededBy: date("needed_by"),
    status: requirementStatus("status").notNull().default("draft"),
    estimatedUnitCost: money("estimated_unit_cost").notNull().default("0"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("requirements_project_idx").on(t.projectId),
    index("requirements_status_idx").on(t.status),
  ],
);

/* ───────────────────── procurement: RFQ + quotes ───────────────────── */

export const rfqs = pgTable(
  "rfqs",
  {
    id: id(),
    companyId: companyId(),
    number: text("number").notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: rfqStatus("status").notNull().default("draft"),
    dueDate: date("due_date"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    awardedQuoteId: uuid("awarded_quote_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("rfq_number_unique").on(t.companyId, t.number)],
);

export const rfqLines = pgTable("rfq_lines", {
  id: id(),
  companyId: companyId(),
  rfqId: uuid("rfq_id")
    .notNull()
    .references(() => rfqs.id, { onDelete: "cascade" }),
  requirementId: uuid("requirement_id").references(() => projectRequirements.id, {
    onDelete: "set null",
  }),
  itemName: text("item_name").notNull(),
  unit: text("unit").notNull(),
  quantity: qty("quantity").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const rfqVendors = pgTable(
  "rfq_vendors",
  {
    id: id(),
    companyId: companyId(),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("rfq_vendor_unique").on(t.rfqId, t.vendorId)],
);

export const vendorQuotes = pgTable("vendor_quotes", {
  id: id(),
  companyId: companyId(),
  rfqId: uuid("rfq_id")
    .notNull()
    .references(() => rfqs.id, { onDelete: "cascade" }),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "cascade" }),
  status: quoteStatus("status").notNull().default("pending"),
  leadTimeDays: integer("lead_time_days"),
  deliveryDate: date("delivery_date"),
  paymentTerms: text("payment_terms"),
  technicalCompliance: pct("technical_compliance").notNull().default("0"),
  totalAmount: money("total_amount").notNull().default("0"),
  notes: text("notes"),
  submittedAt: date("submitted_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const vendorQuoteLines = pgTable("vendor_quote_lines", {
  id: id(),
  companyId: companyId(),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => vendorQuotes.id, { onDelete: "cascade" }),
  rfqLineId: uuid("rfq_line_id")
    .notNull()
    .references(() => rfqLines.id, { onDelete: "cascade" }),
  unitPrice: money("unit_price").notNull().default("0"),
  lineTotal: money("line_total").notNull().default("0"),
  available: boolean("available").notNull().default(true),
  notes: text("notes"),
});

/* ─────────────── procurement: purchase orders / subcontracts ────────── */

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: id(),
    companyId: companyId(),
    number: text("number").notNull(),
    type: procurementType("type").notNull().default("purchase_order"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    rfqId: uuid("rfq_id").references(() => rfqs.id, { onDelete: "set null" }),
    quoteId: uuid("quote_id").references(() => vendorQuotes.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: poStatus("status").notNull().default("draft"),
    subtotal: money("subtotal").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    totalAmount: money("total_amount").notNull().default("0"),
    expectedDate: date("expected_date"),
    paymentTerms: text("payment_terms"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("po_number_unique").on(t.companyId, t.number),
    index("po_project_idx").on(t.projectId),
    index("po_vendor_idx").on(t.vendorId),
  ],
);

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  id: id(),
  companyId: companyId(),
  poId: uuid("po_id")
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: "cascade" }),
  requirementId: uuid("requirement_id").references(() => projectRequirements.id, {
    onDelete: "set null",
  }),
  wbsId: uuid("wbs_id").references(() => wbsCodes.id, { onDelete: "set null" }),
  itemName: text("item_name").notNull(),
  unit: text("unit").notNull(),
  quantity: qty("quantity").notNull(),
  unitPrice: money("unit_price").notNull().default("0"),
  lineTotal: money("line_total").notNull().default("0"),
  receivedQty: qty("received_qty").notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [
  check("po_line_qty_pos", sql`${t.quantity} > 0`),
  check("po_line_unit_price_nonneg", sql`${t.unitPrice} >= 0`),
  check(
    "po_line_received_range",
    sql`${t.receivedQty} >= 0 AND ${t.receivedQty} <= ${t.quantity}`,
  ),
]);

/* ────────────────────────── inventory / stores ─────────────────────── */

export const warehouses = pgTable("warehouses", {
  id: id(),
  companyId: companyId(),
  name: text("name").notNull(),
  code: text("code"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: id(),
    companyId: companyId(),
    number: text("number").notNull(),
    poId: uuid("po_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    warehouseId: uuid("warehouse_id").references(() => warehouses.id, {
      onDelete: "set null",
    }),
    deliveryNoteNumber: text("delivery_note_number"),
    receivedDate: date("received_date").notNull(),
    status: grnStatus("status").notNull().default("draft"),
    receivedBy: uuid("received_by").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("grn_number_unique").on(t.companyId, t.number)],
);

export const goodsReceiptLines = pgTable("goods_receipt_lines", {
  id: id(),
  companyId: companyId(),
  grnId: uuid("grn_id")
    .notNull()
    .references(() => goodsReceipts.id, { onDelete: "cascade" }),
  poLineId: uuid("po_line_id").references(() => purchaseOrderLines.id, {
    onDelete: "set null",
  }),
  itemName: text("item_name").notNull(),
  unit: text("unit").notNull(),
  orderedQty: qty("ordered_qty").notNull().default("0"),
  receivedQty: qty("received_qty").notNull().default("0"),
  acceptedQty: qty("accepted_qty").notNull().default("0"),
  rejectedQty: qty("rejected_qty").notNull().default("0"),
  condition: grnLineCondition("condition").notNull().default("good"),
  unitCost: money("unit_cost").notNull().default("0"),
  notes: text("notes"),
}, (t) => [
  check(
    "grn_line_qty_nonneg",
    sql`${t.receivedQty} >= 0 AND ${t.acceptedQty} >= 0 AND ${t.rejectedQty} >= 0`,
  ),
  check("grn_line_unit_cost_nonneg", sql`${t.unitCost} >= 0`),
]);

/** Current stock position per (warehouse, item). */
export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: id(),
    companyId: companyId(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    itemName: text("item_name").notNull(),
    unit: text("unit").notNull(),
    quantity: qty("quantity").notNull().default("0"),
    allocatedQty: qty("allocated_qty").notNull().default("0"),
    unitCost: money("unit_cost").notNull().default("0"),
    reorderPoint: qty("reorder_point").notNull().default("0"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("inventory_item_unique").on(t.warehouseId, t.itemName),
    check("inv_item_qty_nonneg", sql`${t.quantity} >= 0`),
    check("inv_item_alloc_nonneg", sql`${t.allocatedQty} >= 0`),
    check("inv_item_cost_nonneg", sql`${t.unitCost} >= 0`),
  ],
);

/** Immutable stock ledger — one row per physical movement. */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: id(),
    companyId: companyId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    type: movementType("type").notNull(),
    quantity: qty("quantity").notNull(), // signed: + inbound, - outbound
    unitCost: money("unit_cost").notNull().default("0"),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    notes: text("notes"),
    performedBy: uuid("performed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("movements_item_idx").on(t.itemId)],
);

/** Reservation of received stock to a project task. */
export const inventoryAllocations = pgTable(
  "inventory_allocations",
  {
    id: id(),
    companyId: companyId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    requirementId: uuid("requirement_id").references(() => projectRequirements.id, {
      onDelete: "set null",
    }),
    wbsId: uuid("wbs_id").references(() => wbsCodes.id, { onDelete: "set null" }),
    quantity: qty("quantity").notNull(),
    status: allocationStatus("status").notNull().default("reserved"),
    allocatedBy: uuid("allocated_by").references(() => users.id, { onDelete: "set null" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("allocations_project_idx").on(t.projectId),
    check("alloc_qty_pos", sql`${t.quantity} > 0`),
  ],
);

/* ─────────────────────────── change orders ─────────────────────────── */

export const changeOrders = pgTable(
  "change_orders",
  {
    id: id(),
    companyId: companyId(),
    number: text("number").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: changeOrderStatus("status").notNull().default("draft"),
    costImpact: money("cost_impact").notNull().default("0"),
    revenueImpact: money("revenue_impact").notNull().default("0"),
    scheduleImpactDays: integer("schedule_impact_days").notNull().default(0),
    reason: text("reason"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    applied: boolean("applied").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("co_number_unique").on(t.companyId, t.number)],
);

/* ──────────────────────── job cost ledger ──────────────────────────── */

export const costPostings = pgTable(
  "cost_postings",
  {
    id: id(),
    companyId: companyId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    wbsId: uuid("wbs_id").references(() => wbsCodes.id, { onDelete: "set null" }),
    type: costType("type").notNull(),
    amount: money("amount").notNull(),
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    description: text("description"),
    postedBy: uuid("posted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("cost_project_idx").on(t.projectId),
    index("cost_type_idx").on(t.type),
  ],
);

/* ──────────────────────────── billing ──────────────────────────────── */

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    companyId: companyId(),
    number: text("number").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: invoiceType("type").notNull(),
    milestoneId: uuid("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    status: invoiceStatus("status").notNull().default("draft"),
    subtotal: money("subtotal").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    totalAmount: money("total_amount").notNull().default("0"),
    progressPercent: pct("progress_percent"),
    amountPaid: money("amount_paid").notNull().default("0"),
    issueDate: date("issue_date"),
    dueDate: date("due_date"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("invoice_number_unique").on(t.companyId, t.number)],
);

export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  companyId: companyId(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  wbsId: uuid("wbs_id").references(() => wbsCodes.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  amount: money("amount").notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const payments = pgTable("payments", {
  id: id(),
  companyId: companyId(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  amount: money("amount").notNull(),
  paidDate: date("paid_date").notNull(),
  method: text("method"),
  reference: text("reference"),
  recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/* ──────────────────────────── approvals ────────────────────────────── */

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    companyId: companyId(),
    type: approvalType("type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    title: text("title").notNull(),
    amount: money("amount").notNull().default("0"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    status: approvalStatus("status").notNull().default("pending"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
  },
  (t) => [index("approvals_status_idx").on(t.status)],
);

/* ──────────────────────── attachments + audit ──────────────────────── */

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    companyId: companyId(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    storageKey: text("storage_key").notNull(),
    // Inline file bytes (base64). Local-first: keeps files transactional and
    // RLS-protected in Postgres rather than on a separate object store.
    data: text("data"),
    description: text("description"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_entity_idx").on(t.entityType, t.entityId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    companyId: companyId(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    summary: text("summary").notNull(),
    risk: severity("risk").notNull().default("neutral"),
    projectId: uuid("project_id"),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_company_idx").on(t.companyId, t.createdAt)],
);

/* ─────────────────── inferred row/insert types ─────────────────────── */

export type Company = typeof companies.$inferSelect;
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type WbsCode = typeof wbsCodes.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type ProjectRequirement = typeof projectRequirements.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Rfq = typeof rfqs.$inferSelect;
export type VendorQuote = typeof vendorQuotes.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type GoodsReceipt = typeof goodsReceipts.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryAllocation = typeof inventoryAllocations.$inferSelect;
export type ChangeOrder = typeof changeOrders.$inferSelect;
export type CostPosting = typeof costPostings.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
export type Severity = (typeof severity.enumValues)[number];
