"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { releasePurchaseOrder, reopenRfqLines } from "@/lib/effects";
import * as t from "@/db/schema";
import {
  parseForm,
  ok,
  fail,
  zOptionalDate,
  type ActionState,
} from "@/lib/forms";
import { money, quantity, num } from "@/lib/money";

/* ───────────────────────── create PO / subcontract ─────────────────────── */

const poSchema = z.object({
  type: z.enum(["purchase_order", "subcontract"]),
  vendorId: z.string().uuid("Select a vendor"),
  projectId: z.string().uuid().optional(),
  title: z.string().min(2, "Title is required"),
  expectedDate: zOptionalDate,
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
});

type PoLine = {
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  wbsId: string | null;
};

/** Parse the multi-line editor's parallel arrays into validated PO lines. */
function parsePoLines(formData: FormData): PoLine[] {
  const items = formData.getAll("lineItem").map(String);
  const units = formData.getAll("lineUnit").map(String);
  const qtys = formData.getAll("lineQty").map(String);
  const prices = formData.getAll("linePrice").map(String);
  const wbsIds = formData.getAll("lineWbs").map(String);
  const lines: PoLine[] = [];
  for (let i = 0; i < items.length; i++) {
    const itemName = (items[i] ?? "").trim();
    const qtyVal = num(qtys[i]);
    if (!itemName || qtyVal <= 0) continue;
    const priceVal = num(prices[i]);
    const wbsId = (wbsIds[i] ?? "").trim();
    lines.push({
      itemName,
      unit: (units[i] ?? "pcs").trim() || "pcs",
      quantity: qtyVal,
      unitPrice: priceVal,
      lineTotal: qtyVal * priceVal,
      wbsId: wbsId.length ? wbsId : null,
    });
  }
  return lines;
}

export async function createPurchaseOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(poSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;

  const lines = parsePoLines(formData);
  if (lines.length === 0) return fail("Add at least one line item with a quantity");

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");

    const [company] = await tx
      .select({ vatRate: t.companies.vatRate })
      .from(t.companies)
      .where(eq(t.companies.id, ctx.companyId))
      .limit(1);

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const vatRate = num(company?.vatRate);
    const taxAmount = subtotal * (vatRate / 100);
    const totalAmount = subtotal + taxAmount;

    const isSub = d.type === "subcontract";
    const number = isSub
      ? await nextNumber(tx, ctx.companyId, "SUB", "SUB")
      : await nextNumber(tx, ctx.companyId, "PO", "PO");

    const [po] = await tx
      .insert(t.purchaseOrders)
      .values({
        companyId: ctx.companyId,
        number,
        type: d.type,
        projectId: d.projectId ?? null,
        vendorId: d.vendorId,
        title: d.title,
        status: "draft",
        subtotal: money(subtotal),
        taxAmount: money(taxAmount),
        totalAmount: money(totalAmount),
        expectedDate: d.expectedDate ?? null,
        paymentTerms: d.paymentTerms ?? null,
        notes: d.notes ?? null,
        createdBy: ctx.userId,
      })
      .returning();

    await tx.insert(t.purchaseOrderLines).values(
      lines.map((l, i) => ({
        companyId: ctx.companyId,
        poId: po.id,
        wbsId: l.wbsId,
        itemName: l.itemName,
        unit: l.unit,
        quantity: quantity(l.quantity),
        unitPrice: money(l.unitPrice),
        lineTotal: money(l.lineTotal),
        sortOrder: i,
      })),
    );

    await audit(tx, ctx, {
      action: "po.create",
      entityType: "purchase_order",
      entityId: po.id,
      summary: `Created ${isSub ? "subcontract" : "PO"} ${number}: ${d.title} (${money(totalAmount)})`,
      projectId: po.projectId,
    });

    revalidatePath("/orders");
    return ok(`${isSub ? "Subcontract" : "Purchase order"} created`, `/orders/${po.id}`);
  });
}

/* ─────────────────────────────── submit ────────────────────────────────── */

export async function submitPurchaseOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const poId = String(formData.get("poId") ?? "");
  if (!poId) return fail("Missing order");

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");

    const [po] = await tx
      .select()
      .from(t.purchaseOrders)
      .where(eq(t.purchaseOrders.id, poId))
      .limit(1)
      .for("update"); // lock the order row against concurrent submit/cancel/receive
    if (!po) return fail("Order not found");
    if (po.status !== "draft") return fail("Only draft orders can be submitted");

    const [company] = await tx
      .select({ threshold: t.companies.poApprovalThreshold })
      .from(t.companies)
      .where(eq(t.companies.id, ctx.companyId))
      .limit(1);
    const threshold = num(company?.threshold);

    if (num(po.totalAmount) >= threshold) {
      await tx
        .update(t.purchaseOrders)
        .set({ status: "pending_approval", updatedAt: new Date() })
        .where(eq(t.purchaseOrders.id, poId));

      await tx.insert(t.approvals).values({
        companyId: ctx.companyId,
        type: po.type === "subcontract" ? "subcontract" : "purchase_order",
        entityType: "purchase_order",
        entityId: po.id,
        title: `${po.number} — ${po.title}`,
        amount: po.totalAmount,
        projectId: po.projectId,
        requestedBy: ctx.userId,
      });

      await audit(tx, ctx, {
        action: "po.submit",
        entityType: "purchase_order",
        entityId: po.id,
        summary: `Submitted ${po.number} for approval (${money(num(po.totalAmount))})`,
        risk: "warning",
        projectId: po.projectId,
      });

      revalidatePath("/orders");
      revalidatePath(`/orders/${poId}`);
      revalidatePath("/approvals");
      return ok("Submitted for approval");
    }

    // Below threshold → release immediately (posts commitment, advances reqs).
    await releasePurchaseOrder(tx, ctx, poId);

    await audit(tx, ctx, {
      action: "po.submit",
      entityType: "purchase_order",
      entityId: po.id,
      summary: `Auto-released ${po.number} (below approval threshold)`,
      projectId: po.projectId,
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/${poId}`);
    revalidatePath("/approvals");
    return ok("Order released");
  });
}

/* ─────────────────────────────── cancel ────────────────────────────────── */

export async function cancelPurchaseOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const poId = String(formData.get("poId") ?? "");
  if (!poId) return fail("Missing order");

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");

    const [po] = await tx
      .select()
      .from(t.purchaseOrders)
      .where(eq(t.purchaseOrders.id, poId))
      .limit(1)
      .for("update"); // lock the order row against concurrent submit/cancel/receive
    if (!po) return fail("Order not found");
    if (["received", "closed", "cancelled"].includes(po.status)) {
      return fail("This order can no longer be cancelled");
    }

    // If this order had a commitment posted to a job (released / partially
    // received), reverse the OUTSTANDING commitment so the forecast doesn't stay
    // inflated forever. GRNs already relieved the received portion via negative
    // commitment postings, so the net remaining per cost code is exactly what's
    // still open — zero it out, leaving any received actuals untouched.
    let releasedCommitment = 0;
    if (po.projectId && ["released", "partially_received"].includes(po.status)) {
      // The OUTSTANDING (un-received) commitment is what's still on the job from
      // this order: Σ (ordered − received) × unitPrice. Reversing exactly this —
      // rather than the gross release — leaves the GRN-relieved (received) portion
      // and its actual cost untouched, netting the job's commitment back to zero.
      const lines = await tx
        .select({
          quantity: t.purchaseOrderLines.quantity,
          receivedQty: t.purchaseOrderLines.receivedQty,
          unitPrice: t.purchaseOrderLines.unitPrice,
          wbsId: t.purchaseOrderLines.wbsId,
        })
        .from(t.purchaseOrderLines)
        .where(eq(t.purchaseOrderLines.poId, po.id));

      // Attribute the released commitment per cost code, mirroring how release
      // and GRN relief book against each line's WBS.
      const outstandingByWbs = new Map<string | null, number>();
      for (const l of lines) {
        const open =
          Math.max(0, num(l.quantity) - num(l.receivedQty)) * num(l.unitPrice);
        if (open <= 0) continue;
        const key = l.wbsId ?? null;
        outstandingByWbs.set(key, (outstandingByWbs.get(key) ?? 0) + open);
      }

      const postings: (typeof t.costPostings.$inferInsert)[] = [];
      for (const [wbsId, amount] of outstandingByWbs) {
        if (amount <= 0.005) continue;
        releasedCommitment += amount;
        postings.push({
          companyId: ctx.companyId,
          projectId: po.projectId,
          wbsId,
          type: "commitment",
          amount: money(-amount),
          sourceType: po.type,
          sourceId: po.id,
          description: `${po.number} cancelled — commitment released`,
          postedBy: ctx.userId,
        });
      }
      if (postings.length) await tx.insert(t.costPostings).values(postings);
    }

    // If the order was awaiting sign-off, withdraw the open approval so an
    // approver can't later "approve" a cancelled PO and resurrect it.
    let withdrewApproval = false;
    if (po.status === "pending_approval") {
      const rejected = await tx
        .update(t.approvals)
        .set({
          status: "rejected",
          decisionNote: "Order cancelled before a decision was made",
          decidedBy: ctx.userId,
          decidedAt: new Date(),
        })
        .where(
          and(
            eq(t.approvals.entityId, po.id),
            eq(t.approvals.entityType, "purchase_order"),
            eq(t.approvals.status, "pending"),
          ),
        )
        .returning();
      withdrewApproval = rejected.length > 0;
    }

    await tx
      .update(t.purchaseOrders)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(t.purchaseOrders.id, poId));

    // If this PO came from an awarded RFQ, reopen that RFQ so the buyer can
    // re-source / award a different vendor instead of being stuck.
    if (po.rfqId) {
      const [rfq] = await tx
        .select({ status: t.rfqs.status, awardedQuoteId: t.rfqs.awardedQuoteId })
        .from(t.rfqs)
        .where(eq(t.rfqs.id, po.rfqId))
        .limit(1);
      if (rfq && rfq.status === "awarded") await reopenRfqLines(tx, po.rfqId);
    }

    await audit(tx, ctx, {
      action: "po.cancel",
      entityType: "purchase_order",
      entityId: po.id,
      summary:
        releasedCommitment > 0
          ? `Cancelled ${po.number} — released ${money(releasedCommitment)} committed cost`
          : `Cancelled ${po.number}`,
      risk: "warning",
      projectId: po.projectId,
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/${poId}`);
    revalidatePath("/costing");
    if (withdrewApproval) revalidatePath("/approvals");
    if (po.rfqId) revalidatePath(`/rfqs/${po.rfqId}`);
    return ok(
      releasedCommitment > 0
        ? `Order cancelled — ${money(releasedCommitment)} of committed cost released back to the budget`
        : "Order cancelled",
    );
  });
}

/* ─────────────────────────── edit draft / close ────────────────────────── */

export async function updatePurchaseOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const poId = String(formData.get("poId") ?? "");
  const parsed = parseForm(poSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  const lines = parsePoLines(formData);
  if (lines.length === 0) return fail("Add at least one line item with a quantity");

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");
    const [po] = await tx
      .select()
      .from(t.purchaseOrders)
      .where(eq(t.purchaseOrders.id, poId))
      .limit(1)
      .for("update");
    if (!po) return fail("Order not found");
    if (po.status !== "draft") return fail("Only draft orders can be edited");

    const [company] = await tx
      .select({ vatRate: t.companies.vatRate })
      .from(t.companies)
      .where(eq(t.companies.id, ctx.companyId))
      .limit(1);
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const vatRate = num(company?.vatRate);
    const taxAmount = subtotal * (vatRate / 100);
    const totalAmount = subtotal + taxAmount;

    await tx
      .update(t.purchaseOrders)
      .set({
        vendorId: d.vendorId,
        projectId: d.projectId ?? null,
        title: d.title,
        subtotal: money(subtotal),
        taxAmount: money(taxAmount),
        totalAmount: money(totalAmount),
        expectedDate: d.expectedDate ?? null,
        paymentTerms: d.paymentTerms ?? null,
        notes: d.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(t.purchaseOrders.id, poId));

    // Replace lines wholesale (draft has no receipts/commitments yet).
    await tx.delete(t.purchaseOrderLines).where(eq(t.purchaseOrderLines.poId, poId));
    await tx.insert(t.purchaseOrderLines).values(
      lines.map((l, i) => ({
        companyId: ctx.companyId,
        poId,
        wbsId: l.wbsId,
        itemName: l.itemName,
        unit: l.unit,
        quantity: quantity(l.quantity),
        unitPrice: money(l.unitPrice),
        lineTotal: money(l.lineTotal),
        sortOrder: i,
      })),
    );

    await audit(tx, ctx, {
      action: "po.update",
      entityType: "purchase_order",
      entityId: poId,
      summary: `Edited draft ${po.number} (${money(totalAmount)})`,
      projectId: d.projectId ?? null,
    });
    revalidatePath("/orders");
    revalidatePath(`/orders/${poId}`);
    return ok("Order updated");
  });
}

/**
 * Close out a (partially) received order: stop counting it as open and release
 * any remaining outstanding commitment, like cancel does for the un-received
 * balance — but keeping the received actuals and the order's history intact.
 */
export async function closePurchaseOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const poId = String(formData.get("poId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");
    const [po] = await tx
      .select()
      .from(t.purchaseOrders)
      .where(eq(t.purchaseOrders.id, poId))
      .limit(1)
      .for("update");
    if (!po) return fail("Order not found");
    if (!["released", "partially_received", "received"].includes(po.status))
      return fail("Only a released or received order can be closed");

    let releasedCommitment = 0;
    if (po.projectId && po.status !== "received") {
      const lines = await tx
        .select({
          quantity: t.purchaseOrderLines.quantity,
          receivedQty: t.purchaseOrderLines.receivedQty,
          unitPrice: t.purchaseOrderLines.unitPrice,
          wbsId: t.purchaseOrderLines.wbsId,
        })
        .from(t.purchaseOrderLines)
        .where(eq(t.purchaseOrderLines.poId, po.id));
      const outstandingByWbs = new Map<string | null, number>();
      for (const l of lines) {
        const open = Math.max(0, num(l.quantity) - num(l.receivedQty)) * num(l.unitPrice);
        if (open <= 0) continue;
        outstandingByWbs.set(l.wbsId ?? null, (outstandingByWbs.get(l.wbsId ?? null) ?? 0) + open);
      }
      const postings: (typeof t.costPostings.$inferInsert)[] = [];
      for (const [wbsId, amount] of outstandingByWbs) {
        if (amount <= 0.005) continue;
        releasedCommitment += amount;
        postings.push({
          companyId: ctx.companyId,
          projectId: po.projectId,
          wbsId,
          type: "commitment",
          amount: money(-amount),
          sourceType: po.type,
          sourceId: po.id,
          description: `${po.number} closed — outstanding commitment released`,
          postedBy: ctx.userId,
        });
      }
      if (postings.length) await tx.insert(t.costPostings).values(postings);
    }

    await tx
      .update(t.purchaseOrders)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(t.purchaseOrders.id, poId));
    await audit(tx, ctx, {
      action: "po.close",
      entityType: "purchase_order",
      entityId: po.id,
      summary: `Closed ${po.number}${releasedCommitment > 0 ? ` — released ${money(releasedCommitment)} committed cost` : ""}`,
      risk: "neutral",
      projectId: po.projectId,
    });
    revalidatePath("/orders");
    revalidatePath(`/orders/${poId}`);
    revalidatePath("/costing");
    return ok("Order closed");
  });
}
