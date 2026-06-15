"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import type { Tx } from "@/db/client";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import * as t from "@/db/schema";
import {
  parseForm,
  ok,
  fail,
  zMoney,
  zRequiredDate,
  type ActionState,
} from "@/lib/forms";
import { money, quantity, num } from "@/lib/money";

/* ──────────────────────────── warehouses ───────────────────────────── */

const warehouseSchema = z.object({
  name: z.string().min(2, "Name is required"),
  code: z.string().optional(),
  projectId: z.string().uuid().optional(),
  address: z.string().optional(),
});

export async function createWarehouse(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(warehouseSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "inventory.manage")) return fail("You don't have permission");
    const [wh] = await tx
      .insert(t.warehouses)
      .values({
        companyId: ctx.companyId,
        name: d.name,
        code: d.code ?? null,
        projectId: d.projectId ?? null,
        address: d.address ?? null,
      })
      .returning();
    await audit(tx, ctx, {
      action: "warehouse.create",
      entityType: "warehouse",
      entityId: wh.id,
      summary: `Created warehouse ${wh.name}`,
    });
    revalidatePath("/inventory");
    return ok("Warehouse created");
  });
}

const warehouseUpdateSchema = warehouseSchema.extend({ warehouseId: z.string().uuid() });

export async function updateWarehouse(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(warehouseUpdateSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "inventory.manage")) return fail("You don't have permission");
    const [wh] = await tx
      .update(t.warehouses)
      .set({ name: d.name, code: d.code ?? null, projectId: d.projectId ?? null, address: d.address ?? null })
      .where(eq(t.warehouses.id, d.warehouseId))
      .returning();
    if (!wh) return fail("Warehouse not found");
    await audit(tx, ctx, {
      action: "warehouse.update",
      entityType: "warehouse",
      entityId: wh.id,
      summary: `Updated warehouse ${wh.name}`,
    });
    revalidatePath("/inventory");
    return ok("Warehouse updated");
  });
}

export async function setWarehouseActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "inventory.manage")) return fail("You don't have permission");
    const [wh] = await tx
      .update(t.warehouses)
      .set({ isActive: active })
      .where(eq(t.warehouses.id, warehouseId))
      .returning();
    if (!wh) return fail("Warehouse not found");
    await audit(tx, ctx, {
      action: "warehouse.active",
      entityType: "warehouse",
      entityId: wh.id,
      summary: `${active ? "Reactivated" : "Deactivated"} warehouse ${wh.name}`,
    });
    revalidatePath("/inventory");
    return ok(active ? "Warehouse reactivated" : "Warehouse deactivated");
  });
}

const reorderSchema = z.object({
  itemId: z.string().uuid(),
  reorderPoint: z.coerce.number().min(0),
});

/** Set the low-stock reorder point for an inventory item (drives alerting). */
export async function setReorderPoint(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(reorderSchema, formData);
  if (!parsed.success) return fail("Enter a valid reorder point", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "inventory.manage")) return fail("You don't have permission");
    const [item] = await tx
      .update(t.inventoryItems)
      .set({ reorderPoint: quantity(d.reorderPoint), updatedAt: new Date() })
      .where(eq(t.inventoryItems.id, d.itemId))
      .returning();
    if (!item) return fail("Item not found");
    await audit(tx, ctx, {
      action: "stock.reorder",
      entityType: "inventory_item",
      entityId: item.id,
      summary: `Set reorder point for ${item.itemName} to ${d.reorderPoint} ${item.unit}`,
    });
    revalidatePath("/inventory");
    return ok("Reorder point updated");
  });
}

/* ──────────────────────── stock adjustment ─────────────────────────── */

const adjustSchema = z.object({
  warehouseId: z.string().uuid(),
  itemName: z.string().min(1, "Item is required"),
  unit: z.string().min(1, "Unit is required"),
  quantity: z.coerce.number().refine((n) => n !== 0, "Quantity cannot be zero"),
  unitCost: zMoney,
  reason: z.string().optional(),
});

/** Upsert an inventory item by signed quantity; ledger an `adjustment` movement. */
export async function adjustStock(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(adjustSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "inventory.manage")) return fail("You don't have permission");

    const [existing] = await tx
      .select()
      .from(t.inventoryItems)
      .where(
        and(
          eq(t.inventoryItems.warehouseId, d.warehouseId),
          eq(t.inventoryItems.itemName, d.itemName),
        ),
      )
      .limit(1)
      .for("update"); // lock against concurrent allocate/receive on this item

    let itemId: string;
    if (existing) {
      const newQty = num(existing.quantity) + d.quantity;
      if (newQty < 0) return fail("Adjustment would take stock below zero");
      // Never let an adjustment drop on-hand below what's already reserved —
      // that would strand allocations and show a negative "available".
      if (newQty < num(existing.allocatedQty))
        return fail(
          `Adjustment would drop stock below the ${num(existing.allocatedQty)} ${d.unit} already reserved`,
        );
      // Only re-weight the unit cost on an inbound adjustment with a stated cost.
      let newUnitCost = num(existing.unitCost);
      if (d.quantity > 0 && d.unitCost > 0) {
        const prevQty = num(existing.quantity);
        const prevVal = prevQty * num(existing.unitCost);
        const addVal = d.quantity * d.unitCost;
        newUnitCost = newQty > 0 ? (prevVal + addVal) / newQty : d.unitCost;
      }
      await tx
        .update(t.inventoryItems)
        .set({
          quantity: quantity(newQty),
          unitCost: money(newUnitCost),
          unit: d.unit,
          updatedAt: new Date(),
        })
        .where(eq(t.inventoryItems.id, existing.id));
      itemId = existing.id;
    } else {
      if (d.quantity < 0) return fail("Cannot reduce stock for a new item");
      const [created] = await tx
        .insert(t.inventoryItems)
        .values({
          companyId: ctx.companyId,
          warehouseId: d.warehouseId,
          itemName: d.itemName,
          unit: d.unit,
          quantity: quantity(d.quantity),
          unitCost: money(d.unitCost),
        })
        .returning();
      itemId = created.id;
    }

    await tx.insert(t.inventoryMovements).values({
      companyId: ctx.companyId,
      itemId,
      type: "adjustment",
      quantity: quantity(d.quantity),
      unitCost: money(d.unitCost),
      referenceType: "adjustment",
      notes: d.reason ?? null,
      performedBy: ctx.userId,
    });

    await audit(tx, ctx, {
      action: "stock.adjust",
      entityType: "inventory_item",
      entityId: itemId,
      summary: `Adjusted ${d.itemName} by ${d.quantity > 0 ? "+" : ""}${d.quantity} ${d.unit}`,
      risk: "warning",
      metadata: { reason: d.reason ?? null },
    });

    revalidatePath("/inventory");
    return ok("Stock adjusted");
  });
}

/* ───────────────────────── goods receipt (GRN) ─────────────────────── */

/**
 * Post a goods receipt against a released PO.
 *  - receivedValue = Σ(acceptedQty × unitCost)
 *  - cost_postings: +actual and −commitment for the PO's project
 *  - inventory_items: qty += acceptedQty, weighted-average unitCost
 *  - inventory_movements: +receipt per accepted line
 *  - purchase_order_lines.received_qty += acceptedQty
 *  - PO status: received (all lines full) else partially_received
 *  - linked requirements recompute → fulfilled / partially_received
 */
export async function postGoodsReceipt(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const poId = String(formData.get("poId") ?? "");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const deliveryNoteNumber = String(formData.get("deliveryNoteNumber") ?? "").trim();
  const receivedDateRaw = String(formData.get("receivedDate") ?? "");
  const lineIds = formData.getAll("lineId").map(String);
  const acceptedQtys = formData.getAll("acceptedQty").map((v) => num(String(v)));
  const rejectedQtys = formData.getAll("rejectedQty").map((v) => num(String(v)));

  const dateCheck = zRequiredDate.safeParse(receivedDateRaw);
  if (!poId) return fail("Select a purchase order");
  if (!warehouseId) return fail("Select a warehouse");
  if (!dateCheck.success) return fail("A valid received date is required");
  if (lineIds.length === 0) return fail("No lines to receive");

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "inventory.manage")) return fail("You don't have permission");

    const [po] = await tx
      .select()
      .from(t.purchaseOrders)
      .where(eq(t.purchaseOrders.id, poId))
      .limit(1)
      .for("update"); // serialize receipts against the same order
    if (!po) return fail("Purchase order not found");
    if (!["released", "partially_received"].includes(po.status))
      return fail("Only released orders can be received");

    const poLines = await tx
      .select()
      .from(t.purchaseOrderLines)
      .where(eq(t.purchaseOrderLines.poId, poId));
    const poLineById = new Map(poLines.map((l) => [l.id, l]));

    // Build the set of received lines, validating against remaining quantity.
    // A line may be partly accepted and partly rejected (damaged on arrival).
    type Accept = {
      poLine: t.PurchaseOrderLine;
      accepted: number;
      rejected: number;
      remaining: number;
    };
    const accepts: Accept[] = [];
    for (let i = 0; i < lineIds.length; i++) {
      const poLine = poLineById.get(lineIds[i]);
      if (!poLine) continue;
      const remaining = num(poLine.quantity) - num(poLine.receivedQty);
      let accepted = acceptedQtys[i] ?? 0;
      if (accepted < 0) accepted = 0;
      if (accepted > remaining) accepted = remaining; // clamp to outstanding
      const rejected = Math.max(0, rejectedQtys[i] ?? 0);
      if (accepted <= 0 && rejected <= 0) continue;
      accepts.push({ poLine, accepted, rejected, remaining });
    }
    if (accepts.length === 0)
      return fail("Enter an accepted or rejected quantity on at least one line");

    const number = await nextNumber(tx, ctx.companyId, "GRN", "GRN");

    // GRN header.
    const [grn] = await tx
      .insert(t.goodsReceipts)
      .values({
        companyId: ctx.companyId,
        number,
        poId: po.id,
        vendorId: po.vendorId,
        projectId: po.projectId,
        warehouseId,
        deliveryNoteNumber: deliveryNoteNumber || null,
        receivedDate: receivedDateRaw,
        status: "posted",
        receivedBy: ctx.userId,
      })
      .returning();

    let receivedValue = 0;
    // Received value per cost code, so multi-WBS orders attribute actual cost
    // (and the matching commitment relief) to the right line's budget.
    const valueByWbs = new Map<string | null, number>();
    const fulfilledReqIds = new Set<string>();
    const touchedReqIds = new Set<string>();

    for (const { poLine, accepted, rejected } of accepts) {
      const unitCost = num(poLine.unitPrice);
      const condition = rejected > 0 ? (accepted > 0 ? "partial" : "rejected") : "good";

      // GRN line — always recorded, even for a fully-rejected delivery.
      await tx.insert(t.goodsReceiptLines).values({
        companyId: ctx.companyId,
        grnId: grn.id,
        poLineId: poLine.id,
        itemName: poLine.itemName,
        unit: poLine.unit,
        orderedQty: poLine.quantity,
        receivedQty: quantity(accepted + rejected),
        acceptedQty: quantity(accepted),
        rejectedQty: quantity(rejected),
        condition,
        unitCost: money(unitCost),
      });

      // Rejected-only line: record it, but book no stock or cost.
      if (accepted <= 0) continue;

      const lineValue = accepted * unitCost;
      receivedValue += lineValue;
      const wbsKey = poLine.wbsId ?? null;
      valueByWbs.set(wbsKey, (valueByWbs.get(wbsKey) ?? 0) + lineValue);

      // Upsert inventory item with weighted-average unit cost.
      const [item] = await tx
        .select()
        .from(t.inventoryItems)
        .where(
          and(
            eq(t.inventoryItems.warehouseId, warehouseId),
            eq(t.inventoryItems.itemName, poLine.itemName),
          ),
        )
        .limit(1)
        .for("update"); // lock for the weighted-average cost update

      let itemId: string;
      if (item) {
        const prevQty = num(item.quantity);
        const newQty = prevQty + accepted;
        const prevVal = prevQty * num(item.unitCost);
        const addVal = accepted * unitCost;
        const avgCost = newQty > 0 ? (prevVal + addVal) / newQty : unitCost;
        await tx
          .update(t.inventoryItems)
          .set({
            quantity: quantity(newQty),
            unitCost: money(avgCost),
            unit: poLine.unit,
            updatedAt: new Date(),
          })
          .where(eq(t.inventoryItems.id, item.id));
        itemId = item.id;
      } else {
        const [created] = await tx
          .insert(t.inventoryItems)
          .values({
            companyId: ctx.companyId,
            warehouseId,
            itemName: poLine.itemName,
            unit: poLine.unit,
            quantity: quantity(accepted),
            unitCost: money(unitCost),
          })
          .returning();
        itemId = created.id;
      }

      // Stock ledger: inbound receipt.
      await tx.insert(t.inventoryMovements).values({
        companyId: ctx.companyId,
        itemId,
        type: "receipt",
        quantity: quantity(accepted),
        unitCost: money(unitCost),
        referenceType: "goods_receipt",
        referenceId: grn.id,
        projectId: po.projectId,
        notes: `${number} · ${po.number}`,
        performedBy: ctx.userId,
      });

      // PO line received_qty += accepted.
      await tx
        .update(t.purchaseOrderLines)
        .set({ receivedQty: quantity(num(poLine.receivedQty) + accepted) })
        .where(eq(t.purchaseOrderLines.id, poLine.id));

      if (poLine.requirementId) touchedReqIds.add(poLine.requirementId);
    }

    // Cost ledger: recognise actual on receipt and relieve the commitment,
    // attributing each to the receiving line's cost code.
    if (po.projectId && receivedValue > 0) {
      const postings: (typeof t.costPostings.$inferInsert)[] = [];
      for (const [wbsId, value] of valueByWbs) {
        if (value <= 0) continue;
        postings.push(
          {
            companyId: ctx.companyId,
            projectId: po.projectId,
            wbsId,
            type: "actual",
            amount: money(value),
            sourceType: "goods_receipt",
            sourceId: grn.id,
            description: `${number} received against ${po.number}`,
            postedBy: ctx.userId,
          },
          {
            companyId: ctx.companyId,
            projectId: po.projectId,
            wbsId,
            type: "commitment",
            amount: money(-value),
            sourceType: "goods_receipt",
            sourceId: grn.id,
            description: `${number} relieves commitment on ${po.number}`,
            postedBy: ctx.userId,
          },
        );
      }
      if (postings.length) await tx.insert(t.costPostings).values(postings);
    }

    // Recompute PO status across all its lines.
    const updatedLines = await tx
      .select({
        quantity: t.purchaseOrderLines.quantity,
        receivedQty: t.purchaseOrderLines.receivedQty,
      })
      .from(t.purchaseOrderLines)
      .where(eq(t.purchaseOrderLines.poId, poId));
    const allReceived = updatedLines.every(
      (l) => num(l.receivedQty) >= num(l.quantity) - 1e-9,
    );
    await tx
      .update(t.purchaseOrders)
      .set({
        status: allReceived ? "received" : "partially_received",
        updatedAt: new Date(),
      })
      .where(eq(t.purchaseOrders.id, poId));

    // Recompute coverage for each linked requirement.
    if (touchedReqIds.size > 0) {
      const reqIds = [...touchedReqIds];
      const reqs = await tx
        .select()
        .from(t.projectRequirements)
        .where(inArray(t.projectRequirements.id, reqIds));

      // Allocated (non-cancelled) per requirement.
      const allocRows = await tx
        .select({
          reqId: t.inventoryAllocations.requirementId,
          q: sql<string>`coalesce(sum(${t.inventoryAllocations.quantity}),0)`,
        })
        .from(t.inventoryAllocations)
        .where(
          and(
            inArray(t.inventoryAllocations.requirementId, reqIds),
            sql`${t.inventoryAllocations.status} <> 'cancelled'`,
          ),
        )
        .groupBy(t.inventoryAllocations.requirementId);
      const allocMap = new Map(allocRows.map((a) => [a.reqId, num(a.q)]));

      // Received-against-requirement = Σ received_qty on PO lines linked to req.
      const recvRows = await tx
        .select({
          reqId: t.purchaseOrderLines.requirementId,
          q: sql<string>`coalesce(sum(${t.purchaseOrderLines.receivedQty}),0)`,
        })
        .from(t.purchaseOrderLines)
        .where(inArray(t.purchaseOrderLines.requirementId, reqIds))
        .groupBy(t.purchaseOrderLines.requirementId);
      const recvMap = new Map(recvRows.map((r) => [r.reqId, num(r.q)]));

      for (const req of reqs) {
        const required = num(req.quantity);
        const received = recvMap.get(req.id) ?? 0;
        const allocated = allocMap.get(req.id) ?? 0;
        const covered = received + allocated;
        const status: t.ProjectRequirement["status"] =
          covered >= required - 1e-9 ? "fulfilled" : "partially_received";
        await tx
          .update(t.projectRequirements)
          .set({ status, updatedAt: new Date() })
          .where(eq(t.projectRequirements.id, req.id));
        if (status === "fulfilled") fulfilledReqIds.add(req.id);
      }
    }

    await audit(tx, ctx, {
      action: "grn.post",
      entityType: "goods_receipt",
      entityId: grn.id,
      summary: `Posted ${number} against ${po.number} (${money(receivedValue)} received)`,
      risk: "warning",
      projectId: po.projectId,
      metadata: {
        poNumber: po.number,
        lines: accepts.length,
        receivedValue: money(receivedValue),
        fulfilled: [...fulfilledReqIds],
      },
    });

    revalidatePath("/receipts");
    revalidatePath("/deliveries");
    revalidatePath("/inventory");
    revalidatePath("/allocations");
    if (po.projectId) revalidatePath(`/projects/${po.projectId}`);
    return ok(`Goods receipt ${number} posted`, "/receipts");
  });
}

/**
 * Reverse a posted goods receipt: back out the actual cost, re-instate the
 * commitment, pull the received stock back out, restore the PO's received
 * quantities and recompute requirement coverage. Only allowed while the
 * received goods are still on hand (nothing consumed since).
 */
export async function reverseGoodsReceipt(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const grnId = String(formData.get("grnId") ?? "");
  if (!grnId) return fail("Missing goods receipt");

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "inventory.manage")) return fail("You don't have permission");

    const [grn] = await tx
      .select()
      .from(t.goodsReceipts)
      .where(eq(t.goodsReceipts.id, grnId))
      .limit(1)
      .for("update");
    if (!grn) return fail("Goods receipt not found");
    if (grn.status !== "posted")
      return fail("Only posted goods receipts can be reversed");
    if (!grn.warehouseId)
      return fail("This receipt has no warehouse on record — cannot reverse");

    const grnLines = await tx
      .select()
      .from(t.goodsReceiptLines)
      .where(eq(t.goodsReceiptLines.grnId, grnId));
    if (grnLines.length === 0) return fail("This receipt has no lines");

    // Lock the parent order (if still present) so status recompute is consistent.
    if (grn.poId) {
      await tx
        .select({ id: t.purchaseOrders.id })
        .from(t.purchaseOrders)
        .where(eq(t.purchaseOrders.id, grn.poId))
        .limit(1)
        .for("update");
    }

    const poLineIds = grnLines
      .map((l) => l.poLineId)
      .filter((x): x is string => !!x);
    const poLines = poLineIds.length
      ? await tx
          .select()
          .from(t.purchaseOrderLines)
          .where(inArray(t.purchaseOrderLines.id, poLineIds))
      : [];
    const poLineById = new Map(poLines.map((l) => [l.id, l]));

    const valueByWbs = new Map<string | null, number>();
    const touchedReqIds = new Set<string>();
    let reversedValue = 0;

    for (const gl of grnLines) {
      const acceptedQty = num(gl.acceptedQty);
      if (acceptedQty <= 0) continue;
      const unitCost = num(gl.unitCost);
      const lineValue = acceptedQty * unitCost;

      const [item] = await tx
        .select()
        .from(t.inventoryItems)
        .where(
          and(
            eq(t.inventoryItems.warehouseId, grn.warehouseId),
            eq(t.inventoryItems.itemName, gl.itemName),
          ),
        )
        .limit(1)
        .for("update");
      if (!item)
        return fail(`Stock for "${gl.itemName}" not found — cannot reverse`);

      const curQty = num(item.quantity);
      const availableQty = curQty - num(item.allocatedQty);
      if (availableQty + 1e-9 < acceptedQty)
        return fail(
          `Can't reverse "${gl.itemName}": only ${availableQty} ${item.unit} unallocated of the ${acceptedQty} received — the rest is reserved or already used`,
        );

      // Back the received units (at their landed cost) out of the weighted average.
      const newQty = curQty - acceptedQty;
      const newValue = curQty * num(item.unitCost) - lineValue;
      const newCost = newQty > 1e-9 ? Math.max(0, newValue) / newQty : 0;
      await tx
        .update(t.inventoryItems)
        .set({ quantity: quantity(newQty), unitCost: money(newCost), updatedAt: new Date() })
        .where(eq(t.inventoryItems.id, item.id));

      // Reversing stock movement (signed negative).
      await tx.insert(t.inventoryMovements).values({
        companyId: ctx.companyId,
        itemId: item.id,
        type: "adjustment",
        quantity: quantity(-acceptedQty),
        unitCost: money(unitCost),
        referenceType: "goods_receipt",
        referenceId: grn.id,
        projectId: grn.projectId,
        notes: `${grn.number} reversed`,
        performedBy: ctx.userId,
      });

      // Restore the PO line's received quantity and re-open the commitment.
      if (gl.poLineId) {
        const pl = poLineById.get(gl.poLineId);
        const restored = Math.max(0, num(pl?.receivedQty ?? "0") - acceptedQty);
        await tx
          .update(t.purchaseOrderLines)
          .set({ receivedQty: quantity(restored) })
          .where(eq(t.purchaseOrderLines.id, gl.poLineId));
        const key = pl?.wbsId ?? null;
        valueByWbs.set(key, (valueByWbs.get(key) ?? 0) + lineValue);
        if (pl?.requirementId) touchedReqIds.add(pl.requirementId);
      } else {
        valueByWbs.set(null, (valueByWbs.get(null) ?? 0) + lineValue);
      }
      reversedValue += lineValue;
    }

    // Cost ledger: remove the actual and re-instate the commitment, per cost code.
    if (grn.projectId && reversedValue > 0) {
      const postings: (typeof t.costPostings.$inferInsert)[] = [];
      for (const [wbsId, value] of valueByWbs) {
        if (value <= 0) continue;
        postings.push(
          {
            companyId: ctx.companyId,
            projectId: grn.projectId,
            wbsId,
            type: "actual",
            amount: money(-value),
            sourceType: "goods_receipt",
            sourceId: grn.id,
            description: `${grn.number} reversed — actual backed out`,
            postedBy: ctx.userId,
          },
          {
            companyId: ctx.companyId,
            projectId: grn.projectId,
            wbsId,
            type: "commitment",
            amount: money(value),
            sourceType: "goods_receipt",
            sourceId: grn.id,
            description: `${grn.number} reversed — commitment reinstated`,
            postedBy: ctx.userId,
          },
        );
      }
      if (postings.length) await tx.insert(t.costPostings).values(postings);
    }

    // Recompute the order status from its restored received quantities.
    if (grn.poId) {
      const lines = await tx
        .select({
          quantity: t.purchaseOrderLines.quantity,
          receivedQty: t.purchaseOrderLines.receivedQty,
        })
        .from(t.purchaseOrderLines)
        .where(eq(t.purchaseOrderLines.poId, grn.poId));
      const anyReceived = lines.some((l) => num(l.receivedQty) > 1e-9);
      const allReceived = lines.every(
        (l) => num(l.receivedQty) >= num(l.quantity) - 1e-9,
      );
      await tx
        .update(t.purchaseOrders)
        .set({
          status: allReceived ? "received" : anyReceived ? "partially_received" : "released",
          updatedAt: new Date(),
        })
        .where(eq(t.purchaseOrders.id, grn.poId));
    }

    for (const reqId of touchedReqIds) {
      await recomputeRequirementCoverage(tx, reqId);
    }

    await tx
      .update(t.goodsReceipts)
      .set({ status: "reversed", updatedAt: new Date() })
      .where(eq(t.goodsReceipts.id, grn.id));

    await audit(tx, ctx, {
      action: "grn.reverse",
      entityType: "goods_receipt",
      entityId: grn.id,
      summary: `Reversed ${grn.number} (${money(reversedValue)} backed out)`,
      risk: "critical",
      projectId: grn.projectId,
    });

    revalidatePath("/receipts");
    revalidatePath("/deliveries");
    revalidatePath("/inventory");
    revalidatePath("/allocations");
    revalidatePath("/orders");
    if (grn.projectId) {
      revalidatePath(`/projects/${grn.projectId}`);
      revalidatePath("/costing");
    }
    return ok(`Goods receipt ${grn.number} reversed`);
  });
}

/* ─────────────────────────── allocations ───────────────────────────── */

const reserveSchema = z.object({
  itemId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  requirementId: z.string().uuid().optional(),
  wbsId: z.string().uuid().optional(),
  quantity: z.coerce.number().positive("Quantity must be positive"),
});

/** Reserve available stock to a project/task/requirement. */
export async function reserveAllocation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(reserveSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "inventory.allocate")) return fail("You don't have permission");

    const [item] = await tx
      .select()
      .from(t.inventoryItems)
      .where(eq(t.inventoryItems.id, d.itemId))
      .limit(1)
      .for("update"); // lock the row so concurrent reservations can't oversubscribe
    if (!item) return fail("Inventory item not found");

    const available = num(item.quantity) - num(item.allocatedQty);
    if (d.quantity > available + 1e-9)
      return fail(`Only ${available} ${item.unit} available to reserve`);

    await tx
      .update(t.inventoryItems)
      .set({
        allocatedQty: quantity(num(item.allocatedQty) + d.quantity),
        updatedAt: new Date(),
      })
      .where(eq(t.inventoryItems.id, item.id));

    const [alloc] = await tx
      .insert(t.inventoryAllocations)
      .values({
        companyId: ctx.companyId,
        itemId: d.itemId,
        projectId: d.projectId,
        taskId: d.taskId ?? null,
        requirementId: d.requirementId ?? null,
        wbsId: d.wbsId ?? null,
        quantity: quantity(d.quantity),
        status: "reserved",
        allocatedBy: ctx.userId,
      })
      .returning();

    // Unblock the task once its material is reserved.
    if (d.taskId) {
      const [task] = await tx
        .select({ status: t.tasks.status })
        .from(t.tasks)
        .where(eq(t.tasks.id, d.taskId))
        .limit(1);
      if (task) {
        await tx
          .update(t.tasks)
          .set({
            isBlocked: false,
            ...(task.status === "blocked" ? { status: "in_progress" as const } : {}),
            updatedAt: new Date(),
          })
          .where(eq(t.tasks.id, d.taskId));
      }
    }

    // Mark a covered requirement as fulfilled.
    if (d.requirementId) {
      await recomputeRequirementCoverage(tx, d.requirementId);
    }

    await audit(tx, ctx, {
      action: "allocation.reserve",
      entityType: "inventory_allocation",
      entityId: alloc.id,
      summary: `Reserved ${d.quantity} ${item.unit} of ${item.itemName}`,
      risk: "good",
      projectId: d.projectId,
    });

    revalidatePath("/allocations");
    revalidatePath("/inventory");
    revalidatePath(`/projects/${d.projectId}`);
    return ok("Stock reserved");
  });
}

/** Issue a reserved allocation: deplete stock, ledger an issue movement. */
export async function issueAllocation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const allocationId = String(formData.get("allocationId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "inventory.allocate")) return fail("You don't have permission");

    const [alloc] = await tx
      .select()
      .from(t.inventoryAllocations)
      .where(eq(t.inventoryAllocations.id, allocationId))
      .limit(1);
    if (!alloc) return fail("Allocation not found");
    if (alloc.status !== "reserved") return fail("Only reserved stock can be issued");

    const [item] = await tx
      .select()
      .from(t.inventoryItems)
      .where(eq(t.inventoryItems.id, alloc.itemId))
      .limit(1);
    if (!item) return fail("Inventory item not found");

    const q = num(alloc.quantity);
    await tx
      .update(t.inventoryItems)
      .set({
        quantity: quantity(Math.max(0, num(item.quantity) - q)),
        allocatedQty: quantity(Math.max(0, num(item.allocatedQty) - q)),
        updatedAt: new Date(),
      })
      .where(eq(t.inventoryItems.id, item.id));

    await tx.insert(t.inventoryMovements).values({
      companyId: ctx.companyId,
      itemId: item.id,
      type: "issue",
      quantity: quantity(-q),
      unitCost: item.unitCost,
      referenceType: "inventory_allocation",
      referenceId: alloc.id,
      projectId: alloc.projectId,
      taskId: alloc.taskId,
      notes: `Issued to project`,
      performedBy: ctx.userId,
    });

    await tx
      .update(t.inventoryAllocations)
      .set({ status: "issued", issuedAt: new Date(), updatedAt: new Date() })
      .where(eq(t.inventoryAllocations.id, alloc.id));

    await audit(tx, ctx, {
      action: "allocation.issue",
      entityType: "inventory_allocation",
      entityId: alloc.id,
      summary: `Issued ${q} ${item.unit} of ${item.itemName}`,
      risk: "warning",
      projectId: alloc.projectId,
    });

    revalidatePath("/allocations");
    revalidatePath("/inventory");
    revalidatePath(`/projects/${alloc.projectId}`);
    return ok("Stock issued");
  });
}

/** Cancel a reserved allocation: release the reserved quantity. */
export async function cancelAllocation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const allocationId = String(formData.get("allocationId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "inventory.allocate")) return fail("You don't have permission");

    const [alloc] = await tx
      .select()
      .from(t.inventoryAllocations)
      .where(eq(t.inventoryAllocations.id, allocationId))
      .limit(1);
    if (!alloc) return fail("Allocation not found");
    if (alloc.status !== "reserved") return fail("Only reserved stock can be cancelled");

    const [item] = await tx
      .select()
      .from(t.inventoryItems)
      .where(eq(t.inventoryItems.id, alloc.itemId))
      .limit(1);

    if (item) {
      await tx
        .update(t.inventoryItems)
        .set({
          allocatedQty: quantity(Math.max(0, num(item.allocatedQty) - num(alloc.quantity))),
          updatedAt: new Date(),
        })
        .where(eq(t.inventoryItems.id, item.id));
    }

    await tx
      .update(t.inventoryAllocations)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(t.inventoryAllocations.id, alloc.id));

    if (alloc.requirementId) {
      await recomputeRequirementCoverage(tx, alloc.requirementId);
    }

    await audit(tx, ctx, {
      action: "allocation.cancel",
      entityType: "inventory_allocation",
      entityId: alloc.id,
      summary: `Cancelled reservation of ${num(alloc.quantity)} ${item?.unit ?? ""}`.trim(),
      risk: "warning",
      projectId: alloc.projectId,
    });

    revalidatePath("/allocations");
    revalidatePath("/inventory");
    revalidatePath(`/projects/${alloc.projectId}`);
    return ok("Reservation cancelled");
  });
}

/* ──────────────────────────── helpers ──────────────────────────────── */

/** Re-derive a requirement's status from received + allocated coverage. */
async function recomputeRequirementCoverage(
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
    .select({
      q: sql<string>`coalesce(sum(${t.inventoryAllocations.quantity}),0)`,
    })
    .from(t.inventoryAllocations)
    .where(
      and(
        eq(t.inventoryAllocations.requirementId, requirementId),
        sql`${t.inventoryAllocations.status} <> 'cancelled'`,
      ),
    );

  const [recvRow] = await tx
    .select({
      q: sql<string>`coalesce(sum(${t.purchaseOrderLines.receivedQty}),0)`,
    })
    .from(t.purchaseOrderLines)
    .where(eq(t.purchaseOrderLines.requirementId, requirementId));

  const required = num(req.quantity);
  const covered = num(allocRow?.q) + num(recvRow?.q);
  let status: t.ProjectRequirement["status"];
  if (covered >= required - 1e-9) status = "fulfilled";
  else if (covered > 0) status = "partially_received";
  else status = req.status === "fulfilled" || req.status === "partially_received"
    ? "ordered"
    : req.status;

  await tx
    .update(t.projectRequirements)
    .set({ status, updatedAt: new Date() })
    .where(eq(t.projectRequirements.id, requirementId));
}
