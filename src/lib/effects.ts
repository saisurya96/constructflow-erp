import "server-only";
import { and, eq, inArray, isNull, isNotNull, ne, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import type { AuthContext } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { formatMoney, money, num } from "@/lib/money";
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
      // A CO's schedule impact actually moves the project completion date
      // (date + integer days, in Postgres). No-op when there's no end date set
      // or the impact is zero. (Reversal would subtract the same; there is no
      // un-apply path today — see deferred CO-reversal.)
      ...(co.scheduleImpactDays
        ? { endDate: sql`${t.projects.endDate} + ${co.scheduleImpactDays}` }
        : {}),
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
    summary: `Applied ${co.number} (budget +${formatMoney(num(co.costImpact), ctx.currencyCode)})`,
    risk: "warning",
    projectId: co.projectId,
  });
}

/**
 * Re-derive a requirement's coverage status from its allocations, receipts and
 * still-live PO lines. Call it whenever any of those change — goods receipt,
 * GRN reversal, stock allocation, or a PO cancel/close — so the requirement is
 * never left stuck (e.g. at "ordered" after its only PO was cancelled).
 *
 * Coverage must not double-count: a reservation draws from the same physical
 * stock that `received` already counts, so on-hand coverage is max(allocated,
 * received). `inbound` (still-on-order PO lines) is genuinely additional and
 * decides whether a requirement with nothing received is "ordered" vs back in
 * the sourcing queue.
 */
export async function recomputeRequirementCoverage(
  tx: Tx,
  requirementId: string,
): Promise<void> {
  const [req] = await tx
    .select()
    .from(t.projectRequirements)
    .where(eq(t.projectRequirements.id, requirementId))
    .limit(1);
  if (!req) return;
  if (req.status === "cancelled") return;

  const [allocRow] = await tx
    .select({ q: sql<string>`coalesce(sum(${t.inventoryAllocations.quantity}),0)` })
    .from(t.inventoryAllocations)
    .where(
      and(
        eq(t.inventoryAllocations.requirementId, requirementId),
        sql`${t.inventoryAllocations.status} <> 'cancelled'`,
      ),
    );

  const [recvRow] = await tx
    .select({ q: sql<string>`coalesce(sum(${t.purchaseOrderLines.receivedQty}),0)` })
    .from(t.purchaseOrderLines)
    .where(eq(t.purchaseOrderLines.requirementId, requirementId));

  // Still-on-order coverage: linked PO lines whose order is still live.
  const [inboundRow] = await tx
    .select({
      q: sql<string>`coalesce(sum(${t.purchaseOrderLines.quantity} - ${t.purchaseOrderLines.receivedQty}),0)`,
    })
    .from(t.purchaseOrderLines)
    .innerJoin(t.purchaseOrders, eq(t.purchaseOrders.id, t.purchaseOrderLines.poId))
    .where(
      and(
        eq(t.purchaseOrderLines.requirementId, requirementId),
        inArray(t.purchaseOrders.status, ["approved", "released", "partially_received"]),
      ),
    );

  const required = num(req.quantity);
  const covered = Math.max(num(allocRow?.q), num(recvRow?.q));
  const inbound = num(inboundRow?.q);

  let status: t.ProjectRequirement["status"];
  if (covered >= required - 1e-9) status = "fulfilled";
  else if (covered > 0) status = "partially_received";
  else if (inbound > 0) status = "ordered"; // nothing received yet, but on order
  else if (["ordered", "partially_received", "fulfilled"].includes(req.status))
    // Coverage that previously existed is gone (its PO was cancelled/closed) —
    // drop back into sourcing rather than getting stuck mid-lifecycle.
    status = "sourcing";
  else status = req.status;

  await tx
    .update(t.projectRequirements)
    .set({ status, updatedAt: new Date() })
    .where(eq(t.projectRequirements.id, requirementId));

  // Coverage just changed → keep the linked task's "blocked by material
  // shortage" flag honest. Receiving the last of a need lifts the block; losing
  // cover (GRN reversed, PO cancelled) puts it back. Without this the inverse of
  // the block-on-raise transition is missing and the task/banner go stale.
  await reevaluateTaskMaterialBlock(tx, req.taskId);
}

/**
 * Re-derive a task's "blocked by material shortage" state from whether it still
 * has any OPEN requirement (one not yet fulfilled or cancelled). This is the
 * single inverse-pair for the material auto-block:
 *   • raise an unmet need            → task blocks
 *   • cover it (reserve / receive)   → task unblocks
 * Call it from every path that changes a requirement's coverage or task link
 * (raise, cancel, edit, goods-receipt + reversal, allocation, PO cancel/close).
 *
 * Guards:
 *   • never blocks — or downgrades — a `done` task (would corrupt progress and
 *     fire a false banner).
 *   • only lifts a task OFF the "blocked" status when material is what blocked
 *     it (its isBlocked flag is set). A task whose flag is already clear is left
 *     alone, so a manual, non-material block is never undone here.
 */
export async function reevaluateTaskMaterialBlock(
  tx: Tx,
  taskId: string | null | undefined,
): Promise<void> {
  if (!taskId) return;
  const open = await tx
    .select({ id: t.projectRequirements.id })
    .from(t.projectRequirements)
    .where(
      and(
        eq(t.projectRequirements.taskId, taskId),
        ne(t.projectRequirements.status, "cancelled"),
        ne(t.projectRequirements.status, "fulfilled"),
      ),
    );
  const [task] = await tx
    .select({ status: t.tasks.status, isBlocked: t.tasks.isBlocked })
    .from(t.tasks)
    .where(eq(t.tasks.id, taskId))
    .limit(1);
  if (!task) return;

  if (open.length > 0) {
    // Still an unmet need → flag the task, but never downgrade a done task.
    if (task.status !== "done")
      await tx
        .update(t.tasks)
        .set({ isBlocked: true, status: "blocked", updatedAt: new Date() })
        .where(eq(t.tasks.id, taskId));
  } else if (task.isBlocked) {
    // Need fully covered (or gone) and material was the blocker → clear the flag
    // and lift the task off "blocked" back into progress. Tasks that aren't
    // materially flagged (e.g. a manual block) are deliberately left untouched.
    await tx
      .update(t.tasks)
      .set({
        isBlocked: false,
        ...(task.status === "blocked" ? { status: "in_progress" as const } : {}),
        updatedAt: new Date(),
      })
      .where(eq(t.tasks.id, taskId));
  }
}
