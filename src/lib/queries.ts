import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import {
  costPostings,
  goodsReceipts,
  goodsReceiptLines,
  inventoryAllocations,
  projectRequirements,
  purchaseOrderLines,
  purchaseOrders,
  wbsCodes,
} from "@/db/schema";
import { num } from "@/lib/money";

export type ProjectCost = {
  budget: number;
  committed: number;
  actual: number;
  incurred: number; // actual + open commitment ("cost to date + on order")
  forecast: number;
  variance: number; // forecast - budget
  variancePct: number;
};

/**
 * Forecast / estimate-at-completion, anchored to budget.
 *
 * A naïve `forecast = actual + committed` makes an early-stage job (large
 * budget, little spent yet) read as massively *under* budget, which is
 * misleading. The conservative, honest rule used here: you expect to spend at
 * least the budget, and you only forecast an overrun once actuals + open
 * commitments exceed it. With no budget set, the incurred cost is the forecast.
 */
export function estimateAtCompletion(budget: number, incurred: number): number {
  return budget > 0 ? Math.max(budget, incurred) : incurred;
}

/** Roll up budget (WBS) + committed/actual (cost ledger) for a project. */
export async function getProjectCost(
  tx: Tx,
  projectId: string,
): Promise<ProjectCost> {
  const [budgetRow] = await tx
    .select({ b: sql<string>`coalesce(sum(${wbsCodes.budget}), 0)` })
    .from(wbsCodes)
    .where(eq(wbsCodes.projectId, projectId));

  const rows = await tx
    .select({
      type: costPostings.type,
      total: sql<string>`coalesce(sum(${costPostings.amount}), 0)`,
    })
    .from(costPostings)
    .where(eq(costPostings.projectId, projectId))
    .groupBy(costPostings.type);

  const byType = Object.fromEntries(rows.map((r) => [r.type, num(r.total)]));
  // budget = sum of WBS budgets + any budget adjustments posted to the ledger (e.g. approved change orders)
  const budget = num(budgetRow?.b) + (byType.budget ?? 0);
  const committed = byType.commitment ?? 0;
  const actual = byType.actual ?? 0;
  const incurred = actual + committed;
  const forecast = estimateAtCompletion(budget, incurred);
  const variance = forecast - budget;
  return {
    budget,
    committed,
    actual,
    incurred,
    forecast,
    variance,
    variancePct: budget > 0 ? (variance / budget) * 100 : 0,
  };
}

export type VendorStats = {
  spend: number;
  orders: number;
  onTimeRate: number | null;
  defectRate: number | null;
  receipts: number;
};

/**
 * Live vendor performance, derived from real purchase orders and goods receipts
 * (never from a stale stored column):
 *  - spend   = Σ non-cancelled PO totals
 *  - onTime  = % of posted GRNs delivered on/before the PO's expected date
 *  - defect  = rejected ÷ (accepted + rejected) across posted GRN lines
 */
export async function getVendorStats(tx: Tx): Promise<Map<string, VendorStats>> {
  // Spend = committed business only, to match the project cost ledger (a
  // commitment is posted when a PO is *released*, not while it's a draft /
  // pending-approval / approved). Counting those pre-release statuses would
  // make a vendor's "Total spend" exceed what the costing module calls
  // committed for the same orders.
  const spends = await tx
    .select({
      vendorId: purchaseOrders.vendorId,
      spend: sql<string>`coalesce(sum(${purchaseOrders.totalAmount}), 0)`,
      orders: sql<number>`count(*)`,
    })
    .from(purchaseOrders)
    .where(
      inArray(purchaseOrders.status, [
        "released",
        "partially_received",
        "received",
        "closed",
      ]),
    )
    .groupBy(purchaseOrders.vendorId);

  // `receipts` counts ALL posted GRNs for the vendor; the on-time *rate* is
  // measured only over those whose PO carried an expected date (you can't be
  // on/late vs a date that doesn't exist). Filtering the whole query by
  // expectedDate would silently undercount the receipts sub-label.
  const onTime = await tx
    .select({
      vendorId: purchaseOrders.vendorId,
      total: sql<number>`count(*)`,
      withDate: sql<number>`count(*) filter (where ${purchaseOrders.expectedDate} is not null)`,
      onTime: sql<number>`count(*) filter (where ${goodsReceipts.receivedDate} <= ${purchaseOrders.expectedDate})`,
    })
    .from(goodsReceipts)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.poId))
    .where(eq(goodsReceipts.status, "posted"))
    .groupBy(purchaseOrders.vendorId);

  const defects = await tx
    .select({
      vendorId: purchaseOrders.vendorId,
      accepted: sql<string>`coalesce(sum(${goodsReceiptLines.acceptedQty}), 0)`,
      rejected: sql<string>`coalesce(sum(${goodsReceiptLines.rejectedQty}), 0)`,
    })
    .from(goodsReceiptLines)
    .innerJoin(goodsReceipts, eq(goodsReceipts.id, goodsReceiptLines.grnId))
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.poId))
    .where(eq(goodsReceipts.status, "posted"))
    .groupBy(purchaseOrders.vendorId);

  const out = new Map<string, VendorStats>();
  const ensure = (id: string | null): VendorStats | null => {
    if (!id) return null;
    let s = out.get(id);
    if (!s) {
      s = { spend: 0, orders: 0, onTimeRate: null, defectRate: null, receipts: 0 };
      out.set(id, s);
    }
    return s;
  };
  for (const r of spends) {
    const s = ensure(r.vendorId);
    if (s) {
      s.spend = num(r.spend);
      s.orders = Number(r.orders);
    }
  }
  for (const r of onTime) {
    const s = ensure(r.vendorId);
    if (s) {
      s.receipts = Number(r.total);
      s.onTimeRate =
        Number(r.withDate) > 0 ? (Number(r.onTime) / Number(r.withDate)) * 100 : null;
    }
  }
  for (const r of defects) {
    const s = ensure(r.vendorId);
    if (s) {
      const acc = num(r.accepted);
      const rej = num(r.rejected);
      s.defectRate = acc + rej > 0 ? (rej / (acc + rej)) * 100 : null;
    }
  }
  return out;
}

export type Coverage = {
  required: number;
  allocated: number;
  received: number;
  inbound: number;
  covered: number;
  shortage: number;
  coveredPct: number;
};

const INBOUND_STATUSES = ["approved", "released", "partially_received"] as const;

/**
 * required vs allocated vs received vs inbound vs shortage, keyed by requirement id.
 *
 * "received" is material already delivered into stock against this requirement's
 * POs (Σ receivedQty) — it must count toward coverage, otherwise received goods
 * read as a false shortage. "inbound" is what is still on order (ordered −
 * received) on a live PO. This mirrors the fulfilment formula used when the
 * requirement status is recomputed (allocated + received), so the coverage bar
 * and the status pill never contradict each other.
 */
export async function getRequirementCoverage(
  tx: Tx,
  projectId: string,
): Promise<Map<string, Coverage>> {
  const reqs = await tx
    .select({ id: projectRequirements.id, quantity: projectRequirements.quantity })
    .from(projectRequirements)
    .where(eq(projectRequirements.projectId, projectId));

  const allocs = await tx
    .select({
      reqId: inventoryAllocations.requirementId,
      q: sql<string>`coalesce(sum(${inventoryAllocations.quantity}), 0)`,
    })
    .from(inventoryAllocations)
    .where(
      and(
        eq(inventoryAllocations.projectId, projectId),
        ne(inventoryAllocations.status, "cancelled"),
      ),
    )
    .groupBy(inventoryAllocations.requirementId);
  const allocMap = new Map(allocs.map((a) => [a.reqId, num(a.q)]));

  // Received: total receivedQty across every PO line for the project's
  // requirements (all PO statuses) — material physically delivered.
  const received = await tx
    .select({
      reqId: purchaseOrderLines.requirementId,
      q: sql<string>`coalesce(sum(${purchaseOrderLines.receivedQty}), 0)`,
    })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.poId))
    .where(eq(purchaseOrders.projectId, projectId))
    .groupBy(purchaseOrderLines.requirementId);
  const receivedMap = new Map(received.map((r) => [r.reqId, num(r.q)]));

  // Inbound: still on order (ordered − received) on a live PO.
  const inbound = await tx
    .select({
      reqId: purchaseOrderLines.requirementId,
      q: sql<string>`coalesce(sum(${purchaseOrderLines.quantity} - ${purchaseOrderLines.receivedQty}), 0)`,
    })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.poId))
    .where(
      and(
        eq(purchaseOrders.projectId, projectId),
        inArray(purchaseOrders.status, [...INBOUND_STATUSES]),
      ),
    )
    .groupBy(purchaseOrderLines.requirementId);
  const inboundMap = new Map(inbound.map((i) => [i.reqId, num(i.q)]));

  const out = new Map<string, Coverage>();
  for (const r of reqs) {
    const required = num(r.quantity);
    const allocated = allocMap.get(r.id) ?? 0;
    const rec = receivedMap.get(r.id) ?? 0;
    const inb = inboundMap.get(r.id) ?? 0;
    // Don't double-count: a reservation draws from the same physical stock that
    // `received` represents, so on-hand coverage is max(allocated, received).
    // `inbound` (still on order) is genuinely additional. Matches the status pill.
    const covered = Math.max(allocated, rec) + inb;
    out.set(r.id, {
      required,
      allocated,
      received: rec,
      inbound: inb,
      covered,
      shortage: Math.max(0, required - covered),
      coveredPct: required > 0 ? Math.min(100, (covered / required) * 100) : 100,
    });
  }
  return out;
}
