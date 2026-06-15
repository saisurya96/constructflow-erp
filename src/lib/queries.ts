import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import {
  costPostings,
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
  forecast: number;
  variance: number; // forecast - budget
  variancePct: number;
};

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
  const forecast = actual + committed;
  const variance = forecast - budget;
  return {
    budget,
    committed,
    actual,
    forecast,
    variance,
    variancePct: budget > 0 ? (variance / budget) * 100 : 0,
  };
}

export type Coverage = {
  required: number;
  allocated: number;
  inbound: number;
  covered: number;
  shortage: number;
  coveredPct: number;
};

const INBOUND_STATUSES = ["approved", "released", "partially_received"] as const;

/** required vs allocated vs inbound vs shortage, keyed by requirement id. */
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
    const inb = inboundMap.get(r.id) ?? 0;
    const covered = allocated + inb;
    out.set(r.id, {
      required,
      allocated,
      inbound: inb,
      covered,
      shortage: Math.max(0, required - covered),
      coveredPct: required > 0 ? Math.min(100, (covered / required) * 100) : 100,
    });
  }
  return out;
}
