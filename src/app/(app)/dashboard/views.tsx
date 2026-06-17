import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import * as t from "@/db/schema";
import { formatMoney, num } from "@/lib/money";
import { estimateAtCompletion } from "@/lib/queries";
import { todayISO } from "@/lib/dates";
import { daysUntil } from "@/lib/severity";
import type { BadgeTone } from "@/lib/constants";

/* ───────────────────────── shared shapes ───────────────────────── */

export type Kpi = {
  label: string;
  value: string | number;
  sub?: string;
  tone?: BadgeTone;
};

export type QueueItem = {
  tone: BadgeTone;
  title: string;
  detail?: string;
  impact?: string;
  owner?: string;
  href?: string;
  actionLabel?: string;
  /** sort key — higher floats to the top of the action queue. */
  rank: number;
};

export type DashboardView = {
  kpis: Kpi[];
  queue: QueueItem[];
  queueTitle: string;
  queueDescription: string;
};

const SOON_WINDOW_DAYS = 14;

function dueLabel(days: number | null): string {
  if (days === null) return "no due date";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "due today";
  return `due in ${days}d`;
}

/* ─────────────────────────── PM / Admin ─────────────────────────── */

export async function pmDashboard(
  tx: Tx,
  currency: string,
  canApprove: boolean,
): Promise<DashboardView> {
  const soon = new Date();
  soon.setDate(soon.getDate() + SOON_WINDOW_DAYS);
  const soonISO = soon.toISOString().slice(0, 10);

  const [projectRows, blockedTasks, openReqs, milestonesDue, cosPending, pendingApprovals] =
    await Promise.all([
      tx
        .select({ status: t.projects.status })
        .from(t.projects)
        .where(ne(t.projects.status, "archived")),
      tx
        .select({
          id: t.tasks.id,
          name: t.tasks.name,
          dueDate: t.tasks.dueDate,
          projectId: t.tasks.projectId,
          projectName: t.projects.name,
          assignee: t.users.fullName,
        })
        .from(t.tasks)
        .innerJoin(t.projects, eq(t.projects.id, t.tasks.projectId))
        .leftJoin(t.users, eq(t.users.id, t.tasks.assigneeId))
        .where(
          and(
            or(eq(t.tasks.status, "blocked"), eq(t.tasks.isBlocked, true)),
            ne(t.tasks.status, "done"),
          ),
        )
        .orderBy(asc(t.tasks.dueDate)),
      tx
        .select({
          id: t.projectRequirements.id,
          itemName: t.projectRequirements.itemName,
          status: t.projectRequirements.status,
          neededBy: t.projectRequirements.neededBy,
          projectId: t.projectRequirements.projectId,
          projectName: t.projects.name,
        })
        .from(t.projectRequirements)
        .innerJoin(t.projects, eq(t.projects.id, t.projectRequirements.projectId))
        .where(
          inArray(t.projectRequirements.status, [
            "submitted",
            "sourcing",
            "ordered",
            "partially_received",
          ]),
        )
        .orderBy(asc(t.projectRequirements.neededBy)),
      tx
        .select({
          id: t.milestones.id,
          name: t.milestones.name,
          dueDate: t.milestones.dueDate,
          projectId: t.milestones.projectId,
          projectName: t.projects.name,
        })
        .from(t.milestones)
        .innerJoin(t.projects, eq(t.projects.id, t.milestones.projectId))
        .where(
          and(
            eq(t.milestones.status, "pending"),
            lte(t.milestones.dueDate, soonISO),
          ),
        )
        .orderBy(asc(t.milestones.dueDate)),
      tx
        .select({
          id: t.changeOrders.id,
          number: t.changeOrders.number,
          title: t.changeOrders.title,
          status: t.changeOrders.status,
          costImpact: t.changeOrders.costImpact,
          projectId: t.changeOrders.projectId,
          projectName: t.projects.name,
        })
        .from(t.changeOrders)
        .innerJoin(t.projects, eq(t.projects.id, t.changeOrders.projectId))
        .where(eq(t.changeOrders.status, "submitted"))
        .orderBy(desc(t.changeOrders.costImpact)),
      // Every kind of pending approval (PO, subcontract, change order, invoice)
      // an approver needs to act on — not just change orders.
      tx
        .select({
          id: t.approvals.id,
          type: t.approvals.type,
          title: t.approvals.title,
          amount: t.approvals.amount,
          projectId: t.approvals.projectId,
        })
        .from(t.approvals)
        .where(eq(t.approvals.status, "pending"))
        .orderBy(desc(t.approvals.amount)),
    ]);

  const activeCount = projectRows.filter((p) => p.status === "active").length;
  const overdueMilestones = milestonesDue.filter(
    (m) => (daysUntil(m.dueDate) ?? 99) < 0,
  ).length;
  const approvalsValue = pendingApprovals.reduce((s, a) => s + num(a.amount), 0);

  const kpis: Kpi[] = [
    {
      label: "Active projects",
      value: activeCount,
      sub: `${projectRows.length} total`,
      tone: activeCount > 0 ? "info" : "neutral",
    },
    {
      label: "Blocked tasks",
      value: blockedTasks.length,
      sub: blockedTasks.length ? "awaiting unblock" : "none blocked",
      tone: blockedTasks.length ? "critical" : "good",
    },
    {
      label: "Open requirements",
      value: openReqs.length,
      sub: "in the material pipeline",
      tone: openReqs.length ? "info" : "neutral",
    },
    {
      label: "Milestones due soon",
      value: milestonesDue.length,
      sub: overdueMilestones
        ? `${overdueMilestones} overdue`
        : `next ${SOON_WINDOW_DAYS} days`,
      tone: overdueMilestones ? "critical" : milestonesDue.length ? "warning" : "good",
    },
    canApprove
      ? {
          label: "Pending approvals",
          value: pendingApprovals.length,
          sub: pendingApprovals.length
            ? `${formatCompact(approvalsValue, currency)} total value`
            : "none pending",
          tone: pendingApprovals.length ? "warning" : "good",
        }
      : {
          label: "Changes awaiting approval",
          value: cosPending.length,
          sub: cosPending.length ? "submitted change orders" : "none pending",
          tone: cosPending.length ? "warning" : "good",
        },
  ];

  const queue: QueueItem[] = [];

  for (const task of blockedTasks) {
    const days = daysUntil(task.dueDate);
    queue.push({
      tone: "critical",
      title: `Blocked: ${task.name}`,
      detail: `${task.projectName} · ${dueLabel(days)}`,
      impact: "Schedule slip",
      owner: task.assignee ?? "Unassigned",
      href: `/projects/${task.projectId}`,
      actionLabel: "Resolve",
      rank: 300 + ((days ?? 0) < 0 ? 50 : 0) - (days ?? 0),
    });
  }

  for (const req of openReqs) {
    const days = daysUntil(req.neededBy);
    const overdue = days !== null && days < 0;
    queue.push({
      tone: overdue ? "critical" : "warning",
      title: `Requirement: ${req.itemName}`,
      detail: `${req.projectName} · ${dueLabel(days)}`,
      impact: overdue ? "Material late" : "Material at risk",
      href: `/projects/${req.projectId}`,
      actionLabel: "Review",
      rank: 200 + (overdue ? 40 : 0) - (days ?? 0),
    });
  }

  if (canApprove) {
    // Approver (owner/admin) — surface every pending approval to decide on,
    // the very thing the approval threshold exists to control.
    for (const app of pendingApprovals) {
      queue.push({
        tone: "warning",
        title: `Approve: ${app.title}`,
        detail: `${labelFor(app.type)} · ${formatCompact(num(app.amount), currency)}`,
        impact: "Blocking downstream",
        href: "/approvals",
        actionLabel: "Decide",
        rank: 280 + num(app.amount) / 100000,
      });
    }
  } else {
    // PM raises change orders but can't decide them — let them track status.
    for (const co of cosPending) {
      queue.push({
        tone: "warning",
        title: `Change order ${co.number}: ${co.title}`,
        detail: `${co.projectName} · cost impact ${formatCompact(num(co.costImpact), currency)}`,
        impact: "Awaiting approval",
        href: `/projects/${co.projectId}`,
        actionLabel: "Track",
        rank: 100 + num(co.costImpact) / 100000,
      });
    }
  }

  return {
    kpis,
    queue: sortQueue(queue),
    queueTitle: "Action queue",
    queueDescription:
      "Blocked work, material shortages and changes that need a decision.",
  };
}

/* ─────────────────────────────── Buyer ──────────────────────────── */

export async function buyerDashboard(tx: Tx, currency: string): Promise<DashboardView> {
  const today = todayISO();

  const [toSource, rfqsActive, posPending, deliveriesOverdue] = await Promise.all([
    tx
      .select({
        id: t.projectRequirements.id,
        itemName: t.projectRequirements.itemName,
        unit: t.projectRequirements.unit,
        quantity: t.projectRequirements.quantity,
        neededBy: t.projectRequirements.neededBy,
        projectName: t.projects.name,
      })
      .from(t.projectRequirements)
      .innerJoin(t.projects, eq(t.projects.id, t.projectRequirements.projectId))
      .where(eq(t.projectRequirements.status, "submitted"))
      .orderBy(asc(t.projectRequirements.neededBy)),
    tx
      .select({
        id: t.rfqs.id,
        number: t.rfqs.number,
        title: t.rfqs.title,
        status: t.rfqs.status,
        dueDate: t.rfqs.dueDate,
      })
      .from(t.rfqs)
      .where(inArray(t.rfqs.status, ["issued", "quoting", "comparing"]))
      .orderBy(asc(t.rfqs.dueDate)),
    tx
      .select({
        id: t.purchaseOrders.id,
        number: t.purchaseOrders.number,
        title: t.purchaseOrders.title,
        total: t.purchaseOrders.totalAmount,
        vendor: t.vendors.name,
      })
      .from(t.purchaseOrders)
      .innerJoin(t.vendors, eq(t.vendors.id, t.purchaseOrders.vendorId))
      .where(eq(t.purchaseOrders.status, "pending_approval"))
      .orderBy(desc(t.purchaseOrders.totalAmount)),
    tx
      .select({
        id: t.purchaseOrders.id,
        number: t.purchaseOrders.number,
        title: t.purchaseOrders.title,
        expectedDate: t.purchaseOrders.expectedDate,
        vendor: t.vendors.name,
      })
      .from(t.purchaseOrders)
      .innerJoin(t.vendors, eq(t.vendors.id, t.purchaseOrders.vendorId))
      .where(
        and(
          inArray(t.purchaseOrders.status, ["released", "partially_received"]),
          lte(t.purchaseOrders.expectedDate, today),
        ),
      )
      .orderBy(asc(t.purchaseOrders.expectedDate)),
  ]);

  // The query is inclusive of today (lte expectedDate); only those strictly
  // before today are actually overdue — the rest are due today.
  const trulyOverdue = deliveriesOverdue.filter((po) => (daysUntil(po.expectedDate) ?? 0) < 0);

  const kpis: Kpi[] = [
    {
      label: "Awaiting sourcing",
      value: toSource.length,
      sub: toSource.length ? "submitted requisitions" : "queue clear",
      tone: toSource.length ? "warning" : "good",
    },
    {
      label: "RFQs in progress",
      value: rfqsActive.length,
      sub: "issued · quoting · comparing",
      tone: rfqsActive.length ? "info" : "neutral",
    },
    {
      label: "POs pending approval",
      value: posPending.length,
      sub: posPending.length ? "awaiting sign-off" : "none pending",
      tone: posPending.length ? "warning" : "good",
    },
    {
      label: "Deliveries due",
      value: deliveriesOverdue.length,
      sub: deliveriesOverdue.length
        ? trulyOverdue.length
          ? `${trulyOverdue.length} overdue`
          : "due today"
        : "all on track",
      tone: trulyOverdue.length ? "critical" : deliveriesOverdue.length ? "warning" : "good",
    },
  ];

  const queue: QueueItem[] = [];

  for (const req of toSource) {
    const days = daysUntil(req.neededBy);
    const overdue = days !== null && days < 0;
    queue.push({
      tone: overdue ? "critical" : "warning",
      title: `Source: ${req.itemName}`,
      detail: `${req.projectName} · ${num(req.quantity)} ${req.unit} · ${dueLabel(days)}`,
      impact: overdue ? "Need-by passed" : "Start sourcing",
      href: "/requirements",
      actionLabel: "Source",
      rank: 200 + (overdue ? 50 : 0) - (days ?? 0),
    });
  }

  for (const po of deliveriesOverdue) {
    const days = daysUntil(po.expectedDate);
    const overdue = days !== null && days < 0;
    queue.push({
      tone: overdue ? "critical" : "warning",
      title: `Chase ${po.number}: ${po.title}`,
      detail: `${po.vendor} · ${dueLabel(days)}`,
      impact: overdue ? "Delivery overdue" : "Due today",
      owner: po.vendor,
      href: "/orders",
      actionLabel: "Chase",
      rank: (overdue ? 250 : 200) - (days ?? 0),
    });
  }

  for (const po of posPending) {
    queue.push({
      tone: "info",
      title: `Awaiting approval: ${po.number}`,
      detail: `${po.vendor} · ${formatCompact(num(po.total), currency)}`,
      impact: "Cannot release",
      href: "/orders",
      actionLabel: "View",
      rank: 100 + num(po.total) / 100000,
    });
  }

  return {
    kpis,
    queue: sortQueue(queue),
    queueTitle: "Procurement queue",
    queueDescription: "Requisitions to source and orders to chase.",
  };
}

/* ──────────────────────────── Storekeeper ───────────────────────── */

export async function storekeeperDashboard(tx: Tx): Promise<DashboardView> {
  const today = todayISO();

  const [deliveriesDue, lowStock, openAllocations, recentGrns] = await Promise.all([
    tx
      .select({
        id: t.purchaseOrders.id,
        number: t.purchaseOrders.number,
        title: t.purchaseOrders.title,
        expectedDate: t.purchaseOrders.expectedDate,
        vendor: t.vendors.name,
      })
      .from(t.purchaseOrders)
      .innerJoin(t.vendors, eq(t.vendors.id, t.purchaseOrders.vendorId))
      .where(
        and(
          inArray(t.purchaseOrders.status, ["released", "partially_received"]),
          lte(t.purchaseOrders.expectedDate, today),
        ),
      )
      .orderBy(asc(t.purchaseOrders.expectedDate)),
    tx
      .select({
        id: t.inventoryItems.id,
        itemName: t.inventoryItems.itemName,
        unit: t.inventoryItems.unit,
        quantity: t.inventoryItems.quantity,
        allocatedQty: t.inventoryItems.allocatedQty,
        reorderPoint: t.inventoryItems.reorderPoint,
        warehouse: t.warehouses.name,
      })
      .from(t.inventoryItems)
      .innerJoin(t.warehouses, eq(t.warehouses.id, t.inventoryItems.warehouseId))
      .where(
        and(
          sql`${t.inventoryItems.reorderPoint} > 0`,
          sql`(${t.inventoryItems.quantity} - ${t.inventoryItems.allocatedQty}) <= ${t.inventoryItems.reorderPoint}`,
        ),
      )
      .orderBy(asc(t.inventoryItems.itemName)),
    tx
      .select({
        id: t.inventoryAllocations.id,
        quantity: t.inventoryAllocations.quantity,
        itemName: t.inventoryItems.itemName,
        unit: t.inventoryItems.unit,
        projectName: t.projects.name,
        taskName: t.tasks.name,
      })
      .from(t.inventoryAllocations)
      .innerJoin(t.inventoryItems, eq(t.inventoryItems.id, t.inventoryAllocations.itemId))
      .innerJoin(t.projects, eq(t.projects.id, t.inventoryAllocations.projectId))
      .leftJoin(t.tasks, eq(t.tasks.id, t.inventoryAllocations.taskId))
      .where(eq(t.inventoryAllocations.status, "reserved"))
      .orderBy(desc(t.inventoryAllocations.createdAt)),
    tx
      .select({ id: t.goodsReceipts.id })
      .from(t.goodsReceipts)
      .where(
        and(
          eq(t.goodsReceipts.status, "posted"),
          gte(t.goodsReceipts.receivedDate, addDaysISO(-7)),
        ),
      ),
  ]);

  const overdueDeliveries = deliveriesDue.filter(
    (d) => (daysUntil(d.expectedDate) ?? 0) < 0,
  ).length;

  const kpis: Kpi[] = [
    {
      label: "Deliveries to receive",
      value: deliveriesDue.length,
      sub: overdueDeliveries
        ? `${overdueDeliveries} overdue`
        : "due today or earlier",
      tone: overdueDeliveries ? "critical" : deliveriesDue.length ? "warning" : "good",
    },
    {
      label: "Low-stock items",
      value: lowStock.length,
      sub: lowStock.length ? "at or below reorder point" : "stock healthy",
      tone: lowStock.length ? "warning" : "good",
    },
    {
      label: "Open allocations",
      value: openAllocations.length,
      sub: openAllocations.length ? "reserved, not issued" : "nothing reserved",
      tone: openAllocations.length ? "info" : "neutral",
    },
    {
      label: "GRNs this week",
      value: recentGrns.length,
      sub: "posted in last 7 days",
      tone: "neutral",
    },
  ];

  const queue: QueueItem[] = [];

  for (const po of deliveriesDue) {
    const days = daysUntil(po.expectedDate);
    const overdue = days !== null && days < 0;
    queue.push({
      tone: overdue ? "critical" : "warning",
      title: `Receive ${po.number}: ${po.title}`,
      detail: `${po.vendor} · ${dueLabel(days)}`,
      impact: overdue ? "Delivery overdue" : "Expected today",
      owner: po.vendor,
      href: "/deliveries",
      actionLabel: "Receive",
      rank: 300 + (overdue ? 50 : 0) - (days ?? 0),
    });
  }

  for (const item of lowStock) {
    const available = num(item.quantity) - num(item.allocatedQty);
    queue.push({
      tone: "warning",
      title: `Low stock: ${item.itemName}`,
      detail: `${item.warehouse} · ${available} ${item.unit} available (reorder at ${num(item.reorderPoint)})`,
      impact: "May block issues",
      href: "/inventory",
      actionLabel: "View",
      rank: 200 - available,
    });
  }

  for (const alloc of openAllocations) {
    queue.push({
      tone: "info",
      title: `Issue: ${alloc.itemName}`,
      detail: `${alloc.projectName}${alloc.taskName ? ` · ${alloc.taskName}` : ""} · ${num(alloc.quantity)} ${alloc.unit} reserved`,
      impact: "Reserved stock",
      href: "/allocations",
      actionLabel: "Issue",
      rank: 100,
    });
  }

  return {
    kpis,
    queue: sortQueue(queue),
    queueTitle: "Stores queue",
    queueDescription:
      "Deliveries to receive, low stock to flag and allocations to issue.",
  };
}

/* ─────────────────────────────── Finance ────────────────────────── */

export async function financeDashboard(tx: Tx, currency: string): Promise<DashboardView> {
  const [pendingApprovals, outstandingInvoices, projectAgg, costAgg] =
    await Promise.all([
      tx
        .select({
          id: t.approvals.id,
          type: t.approvals.type,
          title: t.approvals.title,
          amount: t.approvals.amount,
          createdAt: t.approvals.createdAt,
        })
        .from(t.approvals)
        .where(eq(t.approvals.status, "pending"))
        .orderBy(desc(t.approvals.amount)),
      tx
        .select({
          id: t.invoices.id,
          number: t.invoices.number,
          title: t.invoices.title,
          status: t.invoices.status,
          totalAmount: t.invoices.totalAmount,
          amountPaid: t.invoices.amountPaid,
          dueDate: t.invoices.dueDate,
          projectName: t.projects.name,
        })
        .from(t.invoices)
        .innerJoin(t.projects, eq(t.projects.id, t.invoices.projectId))
        .where(inArray(t.invoices.status, ["sent", "partially_paid"]))
        .orderBy(asc(t.invoices.dueDate)),
      tx
        .select({
          id: t.projects.id,
          name: t.projects.name,
          baseBudget: sql<string>`coalesce(sum(${t.wbsCodes.budget}), 0)`,
        })
        .from(t.projects)
        .leftJoin(t.wbsCodes, eq(t.wbsCodes.projectId, t.projects.id))
        .where(ne(t.projects.status, "archived"))
        .groupBy(t.projects.id, t.projects.name),
      tx
        .select({
          projectId: t.costPostings.projectId,
          type: t.costPostings.type,
          total: sql<string>`coalesce(sum(${t.costPostings.amount}), 0)`,
        })
        .from(t.costPostings)
        .groupBy(t.costPostings.projectId, t.costPostings.type),
    ]);

  // Roll up cost ledger per project, using the same estimate-at-completion as
  // getProjectCost so the finance dashboard never diverges from /costing.
  const costByPid = new Map<
    string,
    { budgetAdj: number; commitment: number; actual: number }
  >();
  for (const c of costAgg) {
    const cur = costByPid.get(c.projectId) ?? {
      budgetAdj: 0,
      commitment: 0,
      actual: 0,
    };
    if (c.type === "budget") cur.budgetAdj += num(c.total);
    if (c.type === "commitment") cur.commitment += num(c.total);
    if (c.type === "actual") cur.actual += num(c.total);
    costByPid.set(c.projectId, cur);
  }

  const overBudget = projectAgg
    .map((p) => {
      const cost = costByPid.get(p.id) ?? {
        budgetAdj: 0,
        commitment: 0,
        actual: 0,
      };
      const budget = num(p.baseBudget) + cost.budgetAdj;
      const forecast = estimateAtCompletion(budget, cost.actual + cost.commitment);
      return { ...p, budget, forecast, variance: forecast - budget };
    })
    .filter((p) => p.budget > 0 && p.forecast > p.budget)
    .sort((a, b) => b.variance - a.variance);

  const approvalsValue = pendingApprovals.reduce((s, a) => s + num(a.amount), 0);
  const outstandingValue = outstandingInvoices.reduce(
    (s, i) => s + (num(i.totalAmount) - num(i.amountPaid)),
    0,
  );
  const overdueInvoices = outstandingInvoices.filter(
    (i) => i.dueDate && (daysUntil(i.dueDate) ?? 0) < 0,
  );

  const kpis: Kpi[] = [
    {
      label: "Pending approvals",
      value: pendingApprovals.length,
      sub: `${formatCompact(approvalsValue, currency)} total value`,
      tone: pendingApprovals.length ? "warning" : "good",
    },
    {
      label: "Outstanding invoices",
      value: formatCompact(outstandingValue, currency),
      sub: `${outstandingInvoices.length} unpaid`,
      tone: outstandingValue > 0 ? "info" : "good",
    },
    {
      label: "Overdue invoices",
      value: overdueInvoices.length,
      sub: overdueInvoices.length ? "past due date" : "none overdue",
      tone: overdueInvoices.length ? "critical" : "good",
    },
    {
      label: "Projects over budget",
      value: overBudget.length,
      sub: overBudget.length ? "forecast exceeds budget" : "all within budget",
      tone: overBudget.length ? "critical" : "good",
    },
  ];

  const queue: QueueItem[] = [];

  for (const app of pendingApprovals) {
    queue.push({
      tone: "warning",
      title: `Approve: ${app.title}`,
      detail: `${labelFor(app.type)} · ${formatCompact(num(app.amount), currency)}`,
      impact: "Blocking downstream",
      href: "/approvals",
      actionLabel: "Decide",
      rank: 300 + num(app.amount) / 100000,
    });
  }

  for (const inv of overdueInvoices) {
    const days = daysUntil(inv.dueDate);
    const outstanding = num(inv.totalAmount) - num(inv.amountPaid);
    queue.push({
      tone: "critical",
      title: `Collect ${inv.number}: ${inv.title}`,
      detail: `${inv.projectName} · ${formatCompact(outstanding, currency)} · ${dueLabel(days)}`,
      impact: "Cash at risk",
      href: "/billing",
      actionLabel: "Chase",
      rank: 250 - (days ?? 0),
    });
  }

  for (const p of overBudget) {
    queue.push({
      tone: "critical",
      title: `Over budget: ${p.name}`,
      detail: `Forecast ${formatCompact(p.forecast, currency)} vs budget ${formatCompact(p.budget, currency)}`,
      impact: `+${formatCompact(p.variance, currency)} variance`,
      href: "/costing",
      actionLabel: "Review",
      rank: 150 + p.variance / 100000,
    });
  }

  return {
    kpis,
    queue: sortQueue(queue),
    queueTitle: "Finance queue",
    queueDescription: "Approvals, collections and budgets that need attention.",
  };
}

/* ───────────────────────────── helpers ─────────────────────────── */

function sortQueue(queue: QueueItem[]): QueueItem[] {
  return queue.sort((a, b) => b.rank - a.rank).slice(0, 12);
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Compact, tenant-currency labels for dense dashboard chips (e.g. "$1.2M"). */
function formatCompact(v: number, currency: string): string {
  return formatMoney(v, currency, { compact: true });
}

const APPROVAL_TYPE_LABEL: Record<string, string> = {
  purchase_order: "Purchase order",
  subcontract: "Subcontract",
  change_order: "Change order",
  invoice: "Invoice",
};

function labelFor(type: string): string {
  return APPROVAL_TYPE_LABEL[type] ?? type;
}
