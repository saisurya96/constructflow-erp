"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { reopenRfqLines } from "@/lib/effects";
import { nextNumber } from "@/lib/numbering";
import * as t from "@/db/schema";
import {
  parseForm,
  ok,
  fail,
  zOptionalDate,
  type ActionState,
} from "@/lib/forms";
import { money, quantity, num } from "@/lib/money";
import { todayISO } from "@/lib/dates";

/* ─────────────────────────────── create RFQ ─────────────────────────────── */

const createRfqSchema = z.object({
  title: z.string().min(2, "Title is required"),
  projectId: z.string().uuid("Select a project"),
  dueDate: zOptionalDate,
  notes: z.string().optional(),
  requirementId: z.string().uuid().optional(),
});

export async function createRfq(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(createRfqSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;

  const vendorIds = formData
    .getAll("vendorIds")
    .map((v) => String(v))
    .filter(Boolean);
  if (vendorIds.length === 0)
    return fail("Invite at least one vendor", { vendorIds: "Select one or more vendors" });

  // Parallel line arrays from the multi-line editor.
  const items = formData.getAll("lineItem").map(String);
  const qtys = formData.getAll("lineQty").map(String);
  const units = formData.getAll("lineUnit").map(String);
  const lines: { itemName: string; unit: string; quantity: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const itemName = (items[i] ?? "").trim();
    const qty = num(qtys[i]);
    if (!itemName || qty <= 0) continue;
    lines.push({ itemName, unit: (units[i] ?? "pcs").trim() || "pcs", quantity: qty });
  }
  if (lines.length === 0)
    return fail("Add at least one line item with a quantity", {
      lines: "List at least one item to quote",
    });

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");

    // Only honor a requirement link that actually belongs to this RFQ's project
    // and is still sourceable — RLS scopes the tenant, not the project, so a
    // sibling-project requirement id from the form must not be linked or mutated.
    let linkedReqId: string | null = null;
    if (d.requirementId) {
      const [req] = await tx
        .select({ id: t.projectRequirements.id, status: t.projectRequirements.status })
        .from(t.projectRequirements)
        .where(
          and(
            eq(t.projectRequirements.id, d.requirementId),
            eq(t.projectRequirements.projectId, d.projectId),
          ),
        )
        .limit(1);
      if (req && ["draft", "submitted", "sourcing"].includes(req.status)) linkedReqId = req.id;
    }

    const number = await nextNumber(tx, ctx.companyId, "RFQ", "RFQ");
    const [rfq] = await tx
      .insert(t.rfqs)
      .values({
        companyId: ctx.companyId,
        number,
        projectId: d.projectId,
        title: d.title,
        // Born as a draft so the buyer can proof line items and invited vendors
        // before issuing — the detail page's "Issue RFQ" button sends it out.
        status: "draft",
        dueDate: d.dueDate ?? null,
        notes: d.notes ?? null,
        createdBy: ctx.userId,
      })
      .returning();

    await tx.insert(t.rfqLines).values(
      lines.map((l, i) => ({
        companyId: ctx.companyId,
        rfqId: rfq.id,
        // Only the first line carries the linked requirement (if sourced from one).
        requirementId: i === 0 ? linkedReqId : null,
        itemName: l.itemName,
        unit: l.unit,
        quantity: quantity(l.quantity),
        sortOrder: i,
      })),
    );

    await tx.insert(t.rfqVendors).values(
      vendorIds.map((vendorId) => ({
        companyId: ctx.companyId,
        rfqId: rfq.id,
        vendorId,
      })),
    );

    await tx.insert(t.vendorQuotes).values(
      vendorIds.map((vendorId) => ({
        companyId: ctx.companyId,
        rfqId: rfq.id,
        vendorId,
        status: "pending" as const,
      })),
    );

    if (linkedReqId) {
      await tx
        .update(t.projectRequirements)
        .set({ status: "sourcing", updatedAt: new Date() })
        .where(eq(t.projectRequirements.id, linkedReqId));
    }

    await audit(tx, ctx, {
      action: "rfq.create",
      entityType: "rfq",
      entityId: rfq.id,
      summary: `Drafted ${number}: ${d.title} (${vendorIds.length} vendor${vendorIds.length > 1 ? "s" : ""} invited)`,
      risk: "neutral",
      projectId: d.projectId,
    });

    revalidatePath("/rfqs");
    revalidatePath("/requirements");
    return ok("RFQ drafted — review, then issue to vendors", `/rfqs/${rfq.id}`);
  });
}

/* ─────────────────────────────── enter quote ────────────────────────────── */

const enterQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  leadTimeDays: z.coerce.number().int().min(0).optional(),
  deliveryDate: zOptionalDate,
  technicalCompliance: z.coerce.number().min(0).max(100).default(0),
  paymentTerms: z.string().optional(),
});

export async function enterQuote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(enterQuoteSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;

  // Per-line unit prices from the quote editor.
  const lineIds = formData.getAll("lineId").map(String);
  const prices = formData.getAll("linePrice").map(String);
  const priceByLine = new Map<string, number>();
  for (let i = 0; i < lineIds.length; i++) {
    const id = lineIds[i];
    if (id) priceByLine.set(id, Math.max(0, num(prices[i])));
  }

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");

    const [quote] = await tx
      .select()
      .from(t.vendorQuotes)
      .where(eq(t.vendorQuotes.id, d.quoteId))
      .limit(1);
    if (!quote) return fail("Quote not found");

    const [rfq] = await tx
      .select({ id: t.rfqs.id, number: t.rfqs.number, projectId: t.rfqs.projectId })
      .from(t.rfqs)
      .where(eq(t.rfqs.id, quote.rfqId))
      .limit(1);

    const rfqLines = await tx
      .select({ id: t.rfqLines.id, quantity: t.rfqLines.quantity })
      .from(t.rfqLines)
      .where(eq(t.rfqLines.rfqId, quote.rfqId))
      .orderBy(t.rfqLines.sortOrder);

    // Pre-compute per-line totals and validate BEFORE any write (so the guard
    // rolls back cleanly): a quote must price at least one line above zero.
    const calc = rfqLines.map((line) => {
      const unitPrice = priceByLine.get(line.id) ?? 0;
      const qty = num(line.quantity);
      return { line, unitPrice, lineTotal: unitPrice * qty, available: unitPrice > 0 };
    });
    const total = calc.reduce((s, c) => s + (c.available ? c.lineTotal : 0), 0);
    if (total <= 0)
      return fail("Enter a unit price above zero for at least one line");

    // Upsert a quote line per RFQ line; header total = Σ line totals.
    const existingLines = await tx
      .select({ id: t.vendorQuoteLines.id, rfqLineId: t.vendorQuoteLines.rfqLineId })
      .from(t.vendorQuoteLines)
      .where(eq(t.vendorQuoteLines.quoteId, d.quoteId));
    const existingByLine = new Map(existingLines.map((e) => [e.rfqLineId, e.id]));

    for (const { line, unitPrice, lineTotal, available } of calc) {
      const existingId = existingByLine.get(line.id);
      if (existingId) {
        await tx
          .update(t.vendorQuoteLines)
          .set({ unitPrice: money(unitPrice), lineTotal: money(lineTotal), available })
          .where(eq(t.vendorQuoteLines.id, existingId));
      } else {
        await tx.insert(t.vendorQuoteLines).values({
          companyId: ctx.companyId,
          quoteId: d.quoteId,
          rfqLineId: line.id,
          unitPrice: money(unitPrice),
          lineTotal: money(lineTotal),
          available,
        });
      }
    }

    await tx
      .update(t.vendorQuotes)
      .set({
        status: "received",
        totalAmount: money(total),
        leadTimeDays: d.leadTimeDays ?? null,
        deliveryDate: d.deliveryDate ?? null,
        technicalCompliance: money(d.technicalCompliance),
        paymentTerms: d.paymentTerms ?? null,
        submittedAt: todayISO(),
        updatedAt: new Date(),
      })
      .where(eq(t.vendorQuotes.id, d.quoteId));

    // Once quotes start arriving, move the RFQ into comparing if still issued.
    await tx
      .update(t.rfqs)
      .set({ status: "comparing", updatedAt: new Date() })
      .where(and(eq(t.rfqs.id, quote.rfqId), eq(t.rfqs.status, "issued")));

    await audit(tx, ctx, {
      action: "quote.enter",
      entityType: "vendor_quote",
      entityId: d.quoteId,
      summary: `Recorded quote ${money(total)} on ${rfq?.number ?? "RFQ"}`,
      risk: "neutral",
      projectId: rfq?.projectId ?? null,
    });

    revalidatePath(`/rfqs/${quote.rfqId}`);
    revalidatePath("/rfqs");
    return ok("Quote recorded");
  });
}

/* ─────────────────────────────── award quote ────────────────────────────── */

const awardSchema = z.object({ quoteId: z.string().uuid() });

export async function awardQuote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(awardSchema, formData);
  if (!parsed.success) return fail("Invalid request", parsed.fieldErrors);
  const { quoteId } = parsed.data;

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");

    const [quote] = await tx
      .select()
      .from(t.vendorQuotes)
      .where(eq(t.vendorQuotes.id, quoteId))
      .limit(1);
    if (!quote) return fail("Quote not found");
    if (quote.status !== "received")
      return fail("Only received quotes can be awarded");

    const [rfq] = await tx
      .select()
      .from(t.rfqs)
      .where(eq(t.rfqs.id, quote.rfqId))
      .limit(1)
      .for("update");
    if (!rfq) return fail("RFQ not found");
    if (rfq.status === "awarded") return fail("This RFQ is already awarded");
    if (rfq.status === "cancelled") return fail("This RFQ has been cancelled");

    // Load lines + the winning quote's prices and VALIDATE before any write:
    // a quote must price every line above zero, otherwise the PO would carry
    // zero-priced lines the firm never agreed to.
    const lines = await tx
      .select()
      .from(t.rfqLines)
      .where(eq(t.rfqLines.rfqId, rfq.id))
      .orderBy(t.rfqLines.sortOrder);

    const quoteLines = await tx
      .select()
      .from(t.vendorQuoteLines)
      .where(eq(t.vendorQuoteLines.quoteId, quoteId));
    const quoteLineByRfqLine = new Map(quoteLines.map((q) => [q.rfqLineId, q]));

    if (num(quote.totalAmount) <= 0)
      return fail("This quote has a zero total and can't be awarded");
    const pricedCount = lines.filter((l) => {
      const ql = quoteLineByRfqLine.get(l.id);
      return ql && ql.available && num(ql.unitPrice) > 0;
    }).length;
    if (pricedCount < lines.length)
      return fail(
        `This quote only prices ${pricedCount} of ${lines.length} lines — edit the quote or remove the unquoted lines before awarding.`,
      );

    // Award this quote, reject the siblings.
    await tx
      .update(t.vendorQuotes)
      .set({ status: "awarded", updatedAt: new Date() })
      .where(eq(t.vendorQuotes.id, quoteId));
    await tx
      .update(t.vendorQuotes)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(t.vendorQuotes.rfqId, rfq.id), ne(t.vendorQuotes.id, quoteId)));
    await tx
      .update(t.rfqs)
      .set({ status: "awarded", awardedQuoteId: quoteId, updatedAt: new Date() })
      .where(eq(t.rfqs.id, rfq.id));

    // Pull WBS from the linked requirements so cost lands on the right code.
    const reqIds = lines.map((l) => l.requirementId).filter((x): x is string => !!x);
    const reqWbs = new Map<string, string | null>();
    if (reqIds.length) {
      const reqs = await tx
        .select({ id: t.projectRequirements.id, wbsId: t.projectRequirements.wbsId })
        .from(t.projectRequirements)
        .where(eq(t.projectRequirements.projectId, rfq.projectId ?? ""));
      for (const r of reqs) reqWbs.set(r.id, r.wbsId);
    }

    const [company] = await tx
      .select({ vatRate: t.companies.vatRate })
      .from(t.companies)
      .where(eq(t.companies.id, ctx.companyId))
      .limit(1);
    const vatRate = num(company?.vatRate);

    const subtotal = num(quote.totalAmount);
    const tax = subtotal * (vatRate / 100);
    const total = subtotal + tax;

    const poNumber = await nextNumber(tx, ctx.companyId, "PO", "PO");
    const [po] = await tx
      .insert(t.purchaseOrders)
      .values({
        companyId: ctx.companyId,
        number: poNumber,
        type: "purchase_order",
        projectId: rfq.projectId ?? null,
        vendorId: quote.vendorId,
        rfqId: rfq.id,
        quoteId: quote.id,
        title: rfq.title,
        status: "draft",
        subtotal: money(subtotal),
        taxAmount: money(tax),
        totalAmount: money(total),
        expectedDate: quote.deliveryDate ?? null,
        paymentTerms: quote.paymentTerms ?? null,
        createdBy: ctx.userId,
      })
      .returning();

    await tx.insert(t.purchaseOrderLines).values(
      lines.map((l, i) => {
        const ql = quoteLineByRfqLine.get(l.id);
        const unitPrice = ql ? num(ql.unitPrice) : 0;
        const qty = num(l.quantity);
        return {
          companyId: ctx.companyId,
          poId: po.id,
          requirementId: l.requirementId ?? null,
          wbsId: l.requirementId ? (reqWbs.get(l.requirementId) ?? null) : null,
          itemName: l.itemName,
          unit: l.unit,
          quantity: quantity(qty),
          unitPrice: money(unitPrice),
          lineTotal: money(unitPrice * qty),
          sortOrder: i,
        };
      }),
    );

    await audit(tx, ctx, {
      action: "rfq.award",
      entityType: "rfq",
      entityId: rfq.id,
      summary: `Awarded ${rfq.number} → ${poNumber} (${money(total)})`,
      risk: "warning",
      projectId: rfq.projectId,
    });

    revalidatePath(`/rfqs/${rfq.id}`);
    revalidatePath("/rfqs");
    revalidatePath("/orders");
    return ok("Awarded — draft purchase order created", `/orders/${po.id}`);
  });
}

/* ─────────────────────────────── issue RFQ ──────────────────────────────── */

const issueSchema = z.object({ rfqId: z.string().uuid() });

export async function issueRfq(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(issueSchema, formData);
  if (!parsed.success) return fail("Invalid request", parsed.fieldErrors);
  const { rfqId } = parsed.data;

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");
    const [rfq] = await tx
      .update(t.rfqs)
      .set({ status: "issued", updatedAt: new Date() })
      .where(eq(t.rfqs.id, rfqId))
      .returning();
    if (!rfq) return fail("RFQ not found");
    await audit(tx, ctx, {
      action: "rfq.issue",
      entityType: "rfq",
      entityId: rfq.id,
      summary: `Issued ${rfq.number} to invited vendors`,
      risk: "neutral",
      projectId: rfq.projectId,
    });
    revalidatePath(`/rfqs/${rfqId}`);
    revalidatePath("/rfqs");
    return ok("RFQ issued");
  });
}

/* ─────────────────────── edit / cancel / reopen RFQ ─────────────────────── */

const updateRfqSchema = z.object({
  rfqId: z.string().uuid(),
  title: z.string().min(2, "Title is required"),
  dueDate: zOptionalDate,
  notes: z.string().optional(),
});

export async function updateRfq(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(updateRfqSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");
    const [rfq] = await tx
      .select({ status: t.rfqs.status, projectId: t.rfqs.projectId, number: t.rfqs.number })
      .from(t.rfqs)
      .where(eq(t.rfqs.id, d.rfqId))
      .limit(1);
    if (!rfq) return fail("RFQ not found");
    if (rfq.status === "awarded" || rfq.status === "cancelled")
      return fail("An awarded or cancelled RFQ can't be edited");
    await tx
      .update(t.rfqs)
      .set({ title: d.title, dueDate: d.dueDate ?? null, notes: d.notes ?? null, updatedAt: new Date() })
      .where(eq(t.rfqs.id, d.rfqId));
    await audit(tx, ctx, {
      action: "rfq.update",
      entityType: "rfq",
      entityId: d.rfqId,
      summary: `Updated ${rfq.number} details`,
      projectId: rfq.projectId,
    });
    revalidatePath(`/rfqs/${d.rfqId}`);
    revalidatePath("/rfqs");
    return ok("RFQ updated");
  });
}

export async function cancelRfq(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rfqId = String(formData.get("rfqId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");
    const [rfq] = await tx
      .select()
      .from(t.rfqs)
      .where(eq(t.rfqs.id, rfqId))
      .limit(1)
      .for("update");
    if (!rfq) return fail("RFQ not found");
    if (rfq.status === "awarded")
      return fail("An awarded RFQ can't be cancelled — cancel its purchase order instead");
    if (rfq.status === "cancelled") return fail("RFQ is already cancelled");
    await tx
      .update(t.rfqs)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(t.rfqs.id, rfqId));
    await tx
      .update(t.vendorQuotes)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(t.vendorQuotes.rfqId, rfqId), ne(t.vendorQuotes.status, "rejected")));
    await audit(tx, ctx, {
      action: "rfq.cancel",
      entityType: "rfq",
      entityId: rfqId,
      summary: `Cancelled ${rfq.number}`,
      risk: "warning",
      projectId: rfq.projectId,
    });
    revalidatePath(`/rfqs/${rfqId}`);
    revalidatePath("/rfqs");
    return ok("RFQ cancelled");
  });
}

export async function reopenRfq(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rfqId = String(formData.get("rfqId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");
    const [rfq] = await tx
      .select()
      .from(t.rfqs)
      .where(eq(t.rfqs.id, rfqId))
      .limit(1)
      .for("update");
    if (!rfq) return fail("RFQ not found");
    if (rfq.status !== "awarded") return fail("Only an awarded RFQ can be reopened");
    // A live (non-cancelled) PO must be cancelled first.
    const [po] = await tx
      .select({ id: t.purchaseOrders.id, number: t.purchaseOrders.number, status: t.purchaseOrders.status })
      .from(t.purchaseOrders)
      .where(eq(t.purchaseOrders.rfqId, rfqId))
      .limit(1);
    if (po && po.status !== "cancelled")
      return fail(`Cancel purchase order ${po.number} before reopening this RFQ`);
    await reopenRfqLines(tx, rfqId);
    await audit(tx, ctx, {
      action: "rfq.reopen",
      entityType: "rfq",
      entityId: rfqId,
      summary: `Reopened ${rfq.number} for re-award`,
      risk: "warning",
      projectId: rfq.projectId,
    });
    revalidatePath(`/rfqs/${rfqId}`);
    revalidatePath("/rfqs");
    return ok("RFQ reopened — you can award a different quote");
  });
}

const inviteVendorSchema = z.object({
  rfqId: z.string().uuid(),
  vendorId: z.string().uuid("Select a vendor"),
});

export async function inviteVendorToRfq(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(inviteVendorSchema, formData);
  if (!parsed.success) return fail("Select a vendor to invite", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");
    const [rfq] = await tx
      .select({ status: t.rfqs.status, number: t.rfqs.number, projectId: t.rfqs.projectId })
      .from(t.rfqs)
      .where(eq(t.rfqs.id, d.rfqId))
      .limit(1);
    if (!rfq) return fail("RFQ not found");
    if (rfq.status === "awarded" || rfq.status === "cancelled")
      return fail("Can't invite vendors to an awarded or cancelled RFQ");
    const [existing] = await tx
      .select({ id: t.vendorQuotes.id })
      .from(t.vendorQuotes)
      .where(and(eq(t.vendorQuotes.rfqId, d.rfqId), eq(t.vendorQuotes.vendorId, d.vendorId)))
      .limit(1);
    if (existing) return fail("That vendor is already invited");
    await tx.insert(t.rfqVendors).values({ companyId: ctx.companyId, rfqId: d.rfqId, vendorId: d.vendorId });
    await tx.insert(t.vendorQuotes).values({
      companyId: ctx.companyId,
      rfqId: d.rfqId,
      vendorId: d.vendorId,
      status: "pending",
    });
    await audit(tx, ctx, {
      action: "rfq.invite",
      entityType: "rfq",
      entityId: d.rfqId,
      summary: `Invited a vendor to ${rfq.number}`,
      projectId: rfq.projectId,
    });
    revalidatePath(`/rfqs/${d.rfqId}`);
    return ok("Vendor invited");
  });
}
