"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { releasePurchaseOrder } from "@/lib/effects";
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
});

export async function createPurchaseOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(poSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;

  // Parallel line arrays posted via formData.getAll().
  const items = formData.getAll("lineItem").map(String);
  const units = formData.getAll("lineUnit").map(String);
  const qtys = formData.getAll("lineQty").map(String);
  const prices = formData.getAll("linePrice").map(String);
  const wbsIds = formData.getAll("lineWbs").map(String);

  const lines: {
    itemName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    wbsId: string | null;
  }[] = [];
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
      .limit(1);
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
      .limit(1);
    if (!po) return fail("Order not found");
    if (["received", "closed", "cancelled"].includes(po.status)) {
      return fail("This order can no longer be cancelled");
    }

    await tx
      .update(t.purchaseOrders)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(t.purchaseOrders.id, poId));

    await audit(tx, ctx, {
      action: "po.cancel",
      entityType: "purchase_order",
      entityId: po.id,
      summary: `Cancelled ${po.number}`,
      risk: "warning",
      projectId: po.projectId,
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/${poId}`);
    return ok("Order cancelled");
  });
}
