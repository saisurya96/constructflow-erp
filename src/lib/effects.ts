import "server-only";
import { and, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import type { AuthContext } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { money, num } from "@/lib/money";
import * as t from "@/db/schema";

/**
 * Canonical side-effects shared across procurement / approvals so the cost
 * model stays consistent everywhere.
 *
 * COST MODEL
 *  - PO/subcontract released → post a `commitment` for its subtotal.
 *  - GRN posted (inventory module) → post `actual` for received value and a
 *    negative `commitment` to relieve it; cost is recognized on receipt.
 *  - Change order applied → post a `budget` adjustment (+costImpact) and grow
 *    project budget/contract value.
 */

/** Release a PO/subcontract: status → released, post commitment, advance reqs. */
export async function releasePurchaseOrder(
  tx: Tx,
  ctx: AuthContext,
  poId: string,
): Promise<void> {
  const [po] = await tx
    .select()
    .from(t.purchaseOrders)
    .where(eq(t.purchaseOrders.id, poId))
    .limit(1)
    .for("update"); // lock so a PO can't be released twice concurrently
  if (!po) return;
  // Never (re)release a terminal order. "cancelled" is critical: an approver
  // acting on a stale approval for a since-cancelled PO must be a no-op, not a
  // resurrection that re-posts commitment.
  if (["released", "partially_received", "received", "closed", "cancelled"].includes(po.status))
    return;

  const lines = await tx
    .select({
      wbsId: t.purchaseOrderLines.wbsId,
      lineTotal: t.purchaseOrderLines.lineTotal,
      requirementId: t.purchaseOrderLines.requirementId,
    })
    .from(t.purchaseOrderLines)
    .where(eq(t.purchaseOrderLines.poId, poId));

  await tx
    .update(t.purchaseOrders)
    .set({
      status: "released",
      approvedBy: ctx.userId,
      approvedAt: new Date(),
      releasedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(t.purchaseOrders.id, poId));

  if (po.projectId) {
    // Commit per cost code so a multi-WBS order books commitment to each line's
    // budget (the sum of line totals equals the PO subtotal).
    const byWbs = new Map<string | null, number>();
    for (const l of lines) {
      const key = l.wbsId ?? null;
      byWbs.set(key, (byWbs.get(key) ?? 0) + num(l.lineTotal));
    }
    const postings: (typeof t.costPostings.$inferInsert)[] = [];
    for (const [wbsId, amount] of byWbs) {
      if (Math.abs(amount) < 0.005) continue;
      postings.push({
        companyId: ctx.companyId,
        projectId: po.projectId,
        wbsId,
        type: "commitment",
        amount: money(amount),
        sourceType: po.type,
        sourceId: po.id,
        description: `${po.number} committed`,
        postedBy: ctx.userId,
      });
    }
    if (postings.length) await tx.insert(t.costPostings).values(postings);
  }

  const reqIds = lines.map((l) => l.requirementId).filter((x): x is string => !!x);
  if (reqIds.length) {
    await tx
      .update(t.projectRequirements)
      .set({ status: "ordered", updatedAt: new Date() })
      .where(
        and(
          inArray(t.projectRequirements.id, reqIds),
          inArray(t.projectRequirements.status, ["submitted", "sourcing"]),
        ),
      );
  }

  await audit(tx, ctx, {
    action: "po.release",
    entityType: "purchase_order",
    entityId: po.id,
    summary: `Released ${po.number}`,
    risk: "warning",
    projectId: po.projectId,
  });
}

/**
 * Restore an awarded RFQ to "comparing" and put its quotes back to their
 * pre-award state (received if a quote was submitted, otherwise pending) so a
 * different vendor can be awarded. Shared by the reopen action and PO cancel.
 */
export async function reopenRfqLines(tx: Tx, rfqId: string): Promise<void> {
  await tx
    .update(t.vendorQuotes)
    .set({ status: "received", updatedAt: new Date() })
    .where(and(eq(t.vendorQuotes.rfqId, rfqId), isNotNull(t.vendorQuotes.submittedAt)));
  await tx
    .update(t.vendorQuotes)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(eq(t.vendorQuotes.rfqId, rfqId), isNull(t.vendorQuotes.submittedAt)));
  await tx
    .update(t.rfqs)
    .set({ status: "comparing", awardedQuoteId: null, updatedAt: new Date() })
    .where(eq(t.rfqs.id, rfqId));
}

/** Apply an approved change order: grow budget/contract + post budget adjustment. */
export async function applyChangeOrder(
  tx: Tx,
  ctx: AuthContext,
  coId: string,
): Promise<void> {
  const [co] = await tx
    .select()
    .from(t.changeOrders)
    .where(eq(t.changeOrders.id, coId))
    .limit(1);
  if (!co || co.applied) return;

  await tx
    .update(t.changeOrders)
    .set({
      status: "approved",
      applied: true,
      approvedBy: ctx.userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(t.changeOrders.id, coId));

  await tx
    .update(t.projects)
    .set({
      budget: sql`${t.projects.budget} + ${co.costImpact}`,
      contractValue: sql`${t.projects.contractValue} + ${co.revenueImpact}`,
      updatedAt: new Date(),
    })
    .where(eq(t.projects.id, co.projectId));

  if (Number(co.costImpact) !== 0) {
    await tx.insert(t.costPostings).values({
      companyId: ctx.companyId,
      projectId: co.projectId,
      type: "budget",
      amount: co.costImpact,
      sourceType: "change_order",
      sourceId: co.id,
      description: `${co.number} budget adjustment`,
      postedBy: ctx.userId,
    });
  }

  await audit(tx, ctx, {
    action: "changeorder.apply",
    entityType: "change_order",
    entityId: co.id,
    summary: `Applied ${co.number} (budget +${co.costImpact})`,
    risk: "warning",
    projectId: co.projectId,
  });
}
