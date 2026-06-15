"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import * as t from "@/db/schema";
import {
  parseForm,
  ok,
  fail,
  zQty,
  zMoney,
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
  requirementId: z.string().uuid().optional(),
  itemName: z.string().min(2, "Item is required"),
  unit: z.string().min(1, "Unit is required"),
  quantity: zQty,
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

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "procurement.manage")) return fail("You don't have permission");

    const number = await nextNumber(tx, ctx.companyId, "RFQ", "RFQ");
    const [rfq] = await tx
      .insert(t.rfqs)
      .values({
        companyId: ctx.companyId,
        number,
        projectId: d.projectId,
        title: d.title,
        status: "issued",
        dueDate: d.dueDate ?? null,
        createdBy: ctx.userId,
      })
      .returning();

    await tx.insert(t.rfqLines).values({
      companyId: ctx.companyId,
      rfqId: rfq.id,
      requirementId: d.requirementId ?? null,
      itemName: d.itemName,
      unit: d.unit,
      quantity: quantity(d.quantity),
      sortOrder: 0,
    });

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

    if (d.requirementId) {
      await tx
        .update(t.projectRequirements)
        .set({ status: "sourcing", updatedAt: new Date() })
        .where(eq(t.projectRequirements.id, d.requirementId));
    }

    await audit(tx, ctx, {
      action: "rfq.create",
      entityType: "rfq",
      entityId: rfq.id,
      summary: `Issued ${number}: ${d.title} to ${vendorIds.length} vendor${vendorIds.length > 1 ? "s" : ""}`,
      risk: "neutral",
      projectId: d.projectId,
    });

    revalidatePath("/rfqs");
    revalidatePath("/requirements");
    return ok("RFQ issued", `/rfqs/${rfq.id}`);
  });
}

/* ─────────────────────────────── enter quote ────────────────────────────── */

const enterQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  totalAmount: zMoney,
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

    const [line] = await tx
      .select({ id: t.rfqLines.id, quantity: t.rfqLines.quantity })
      .from(t.rfqLines)
      .where(eq(t.rfqLines.rfqId, quote.rfqId))
      .limit(1);

    await tx
      .update(t.vendorQuotes)
      .set({
        status: "received",
        totalAmount: money(d.totalAmount),
        leadTimeDays: d.leadTimeDays ?? null,
        deliveryDate: d.deliveryDate ?? null,
        technicalCompliance: money(d.technicalCompliance),
        paymentTerms: d.paymentTerms ?? null,
        submittedAt: todayISO(),
        updatedAt: new Date(),
      })
      .where(eq(t.vendorQuotes.id, d.quoteId));

    if (line) {
      const qty = num(line.quantity);
      const unitPrice = qty > 0 ? d.totalAmount / qty : d.totalAmount;
      const [existing] = await tx
        .select({ id: t.vendorQuoteLines.id })
        .from(t.vendorQuoteLines)
        .where(
          and(
            eq(t.vendorQuoteLines.quoteId, d.quoteId),
            eq(t.vendorQuoteLines.rfqLineId, line.id),
          ),
        )
        .limit(1);
      if (existing) {
        await tx
          .update(t.vendorQuoteLines)
          .set({ unitPrice: money(unitPrice), lineTotal: money(d.totalAmount), available: true })
          .where(eq(t.vendorQuoteLines.id, existing.id));
      } else {
        await tx.insert(t.vendorQuoteLines).values({
          companyId: ctx.companyId,
          quoteId: d.quoteId,
          rfqLineId: line.id,
          unitPrice: money(unitPrice),
          lineTotal: money(d.totalAmount),
          available: true,
        });
      }
    }

    // Once quotes start arriving, move the RFQ into comparing if still issued.
    await tx
      .update(t.rfqs)
      .set({ status: "comparing", updatedAt: new Date() })
      .where(and(eq(t.rfqs.id, quote.rfqId), eq(t.rfqs.status, "issued")));

    await audit(tx, ctx, {
      action: "quote.enter",
      entityType: "vendor_quote",
      entityId: d.quoteId,
      summary: `Recorded quote ${money(d.totalAmount)} on ${rfq?.number ?? "RFQ"}`,
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
      .limit(1);
    if (!rfq) return fail("RFQ not found");
    if (rfq.status === "awarded") return fail("This RFQ is already awarded");

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

    // Build the purchase order (draft) from the RFQ lines + winning quote.
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
