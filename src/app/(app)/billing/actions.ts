"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
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
  zMoney,
  zRequiredDate,
  zOptionalDate,
  type ActionState,
} from "@/lib/forms";
import { money, num } from "@/lib/money";
import { todayISO } from "@/lib/dates";

/* ───────────────────────────── create invoice ───────────────────────────── */

const invoiceSchema = z.object({
  projectId: z.string().uuid("Select a project"),
  type: z.enum(["milestone", "progress"]),
  title: z.string().min(2, "Title is required"),
  milestoneId: z.string().uuid().optional(),
  progressPercent: z.coerce.number().min(0).max(100).optional(),
  issueDate: zOptionalDate,
  dueDate: zOptionalDate,
});

export async function createInvoice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(invoiceSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;

  // Multi-value line arrays — read directly off the FormData.
  const descs = formData.getAll("lineDesc").map((v) => String(v));
  const amounts = formData.getAll("lineAmount").map((v) => num(String(v)));
  const wbsRaw = formData.getAll("lineWbs").map((v) => String(v));

  const lines: { description: string; amount: number; wbsId: string | null }[] = [];
  for (let i = 0; i < descs.length; i++) {
    const description = (descs[i] ?? "").trim();
    const amount = amounts[i] ?? 0;
    if (!description && amount === 0) continue;
    if (!description) return fail("Each line needs a description");
    lines.push({
      description,
      amount,
      wbsId: wbsRaw[i] && wbsRaw[i] !== "" ? wbsRaw[i] : null,
    });
  }
  if (lines.length === 0) return fail("Add at least one line item");

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "billing.manage")) return fail("You don't have permission");

    const [project] = await tx
      .select({ id: t.projects.id, code: t.projects.code, name: t.projects.name })
      .from(t.projects)
      .where(eq(t.projects.id, d.projectId))
      .limit(1);
    if (!project) return fail("Project not found");

    // Validate milestone (if any) belongs to the project.
    if (d.type === "milestone") {
      if (!d.milestoneId) return fail("Select a milestone for a milestone invoice");
      const [ms] = await tx
        .select({ id: t.milestones.id, projectId: t.milestones.projectId, status: t.milestones.status })
        .from(t.milestones)
        .where(eq(t.milestones.id, d.milestoneId))
        .limit(1);
      if (!ms || ms.projectId !== d.projectId) return fail("Milestone not found for this project");
    }

    const [company] = await tx
      .select({ vatRate: t.companies.vatRate })
      .from(t.companies)
      .where(eq(t.companies.id, ctx.companyId))
      .limit(1);
    const vatRate = num(company?.vatRate);

    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const taxAmount = subtotal * (vatRate / 100);
    const total = subtotal + taxAmount;

    const number = await nextNumber(tx, ctx.companyId, "INV", "INV");

    const [invoice] = await tx
      .insert(t.invoices)
      .values({
        companyId: ctx.companyId,
        number,
        projectId: d.projectId,
        type: d.type,
        milestoneId: d.type === "milestone" ? (d.milestoneId ?? null) : null,
        title: d.title,
        status: "draft",
        subtotal: money(subtotal),
        taxAmount: money(taxAmount),
        totalAmount: money(total),
        progressPercent:
          d.type === "progress" && d.progressPercent !== undefined
            ? money(d.progressPercent)
            : null,
        issueDate: d.issueDate ?? null,
        dueDate: d.dueDate ?? null,
        createdBy: ctx.userId,
      })
      .returning();

    await tx.insert(t.invoiceLines).values(
      lines.map((l, i) => ({
        companyId: ctx.companyId,
        invoiceId: invoice.id,
        wbsId: l.wbsId,
        description: l.description,
        amount: money(l.amount),
        sortOrder: i,
      })),
    );

    if (d.type === "milestone" && d.milestoneId) {
      await tx
        .update(t.milestones)
        .set({ status: "invoiced", invoiceId: invoice.id, updatedAt: new Date() })
        .where(eq(t.milestones.id, d.milestoneId));
    }

    await audit(tx, ctx, {
      action: "invoice.create",
      entityType: "invoice",
      entityId: invoice.id,
      summary: `Created ${number} for ${project.code} — ${money(total)}`,
      projectId: d.projectId,
    });

    revalidatePath("/billing");
    revalidatePath(`/projects/${d.projectId}`);
    return ok("Invoice created", `/billing/${invoice.id}`);
  });
}

/* ───────────────────────────── send invoice ───────────────────────────── */

export async function sendInvoice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "billing.manage")) return fail("You don't have permission");
    const [inv] = await tx
      .select()
      .from(t.invoices)
      .where(eq(t.invoices.id, invoiceId))
      .limit(1);
    if (!inv) return fail("Invoice not found");
    if (inv.status !== "draft") return fail("Only draft invoices can be sent");

    await tx
      .update(t.invoices)
      .set({
        status: "sent",
        issueDate: inv.issueDate ?? todayISO(),
        updatedAt: new Date(),
      })
      .where(eq(t.invoices.id, invoiceId));

    await audit(tx, ctx, {
      action: "invoice.send",
      entityType: "invoice",
      entityId: inv.id,
      summary: `Sent ${inv.number} (${money(num(inv.totalAmount))})`,
      risk: "neutral",
      projectId: inv.projectId,
    });

    revalidatePath("/billing");
    revalidatePath(`/billing/${invoiceId}`);
    return ok("Invoice sent");
  });
}

/* ───────────────────────────── record payment ───────────────────────────── */

const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: zMoney,
  paidDate: zRequiredDate,
  method: z.string().optional(),
  reference: z.string().optional(),
});

export async function recordPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(paymentSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  if (d.amount <= 0) return fail("Payment amount must be greater than zero", { amount: "Enter an amount" });

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "billing.manage")) return fail("You don't have permission");

    const [inv] = await tx
      .select()
      .from(t.invoices)
      .where(eq(t.invoices.id, d.invoiceId))
      .limit(1);
    if (!inv) return fail("Invoice not found");
    if (!["sent", "partially_paid"].includes(inv.status))
      return fail("Payments can only be recorded against a sent invoice");

    const total = num(inv.totalAmount);
    const newPaid = num(inv.amountPaid) + d.amount;
    const nextStatus: t.Invoice["status"] = newPaid >= total ? "paid" : "partially_paid";

    await tx.insert(t.payments).values({
      companyId: ctx.companyId,
      invoiceId: inv.id,
      amount: money(d.amount),
      paidDate: d.paidDate,
      method: d.method ?? null,
      reference: d.reference ?? null,
      recordedBy: ctx.userId,
    });

    await tx
      .update(t.invoices)
      .set({ amountPaid: money(newPaid), status: nextStatus, updatedAt: new Date() })
      .where(eq(t.invoices.id, inv.id));

    await audit(tx, ctx, {
      action: "invoice.payment",
      entityType: "invoice",
      entityId: inv.id,
      summary: `Recorded ${money(d.amount)} payment on ${inv.number} (${nextStatus})`,
      risk: "good",
      projectId: inv.projectId,
    });

    revalidatePath("/billing");
    revalidatePath(`/billing/${inv.id}`);
    return ok("Payment recorded");
  });
}

/* ───────────────────────────── void invoice ───────────────────────────── */

export async function voidInvoice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "billing.manage")) return fail("You don't have permission");
    const [inv] = await tx
      .select()
      .from(t.invoices)
      .where(eq(t.invoices.id, invoiceId))
      .limit(1);
    if (!inv) return fail("Invoice not found");
    if (inv.status === "paid") return fail("A fully paid invoice cannot be voided");
    if (inv.status === "void") return fail("Invoice is already void");

    await tx
      .update(t.invoices)
      .set({ status: "void", updatedAt: new Date() })
      .where(eq(t.invoices.id, invoiceId));

    // Release a milestone that was reserved by this invoice.
    if (inv.milestoneId) {
      await tx
        .update(t.milestones)
        .set({ status: "reached", invoiceId: null, updatedAt: new Date() })
        .where(eq(t.milestones.id, inv.milestoneId));
    }

    await audit(tx, ctx, {
      action: "invoice.void",
      entityType: "invoice",
      entityId: inv.id,
      summary: `Voided ${inv.number}`,
      risk: "warning",
      projectId: inv.projectId,
    });

    revalidatePath("/billing");
    revalidatePath(`/billing/${invoiceId}`);
    return ok("Invoice voided");
  });
}
