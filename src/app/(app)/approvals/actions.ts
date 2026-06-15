"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { releasePurchaseOrder, applyChangeOrder } from "@/lib/effects";
import * as t from "@/db/schema";
import { parseForm, ok, fail, type ActionState } from "@/lib/forms";

/** Where the decided entity lives — used to revalidate the right module. */
const MODULE_PATH: Record<t.Approval["type"], string> = {
  purchase_order: "/orders",
  subcontract: "/orders",
  change_order: "/projects",
  invoice: "/billing",
};

const decideSchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().optional(),
});

export async function decideApproval(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(decideSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;

  return db(async (tx, ctx) => {
    if (!can(ctx.role, "approvals.decide")) return fail("You don't have permission");

    const [approval] = await tx
      .select()
      .from(t.approvals)
      .where(eq(t.approvals.id, d.approvalId))
      .limit(1);
    if (!approval) return fail("Approval not found");
    if (approval.status !== "pending") return fail("This request has already been decided");

    const approved = d.decision === "approve";

    await tx
      .update(t.approvals)
      .set({
        status: approved ? "approved" : "rejected",
        decidedBy: ctx.userId,
        decidedAt: new Date(),
        decisionNote: d.note ?? null,
      })
      .where(eq(t.approvals.id, approval.id));

    if (approved) {
      switch (approval.type) {
        case "purchase_order":
        case "subcontract":
          await releasePurchaseOrder(tx, ctx, approval.entityId);
          break;
        case "change_order":
          await applyChangeOrder(tx, ctx, approval.entityId);
          break;
        case "invoice":
          await tx
            .update(t.invoices)
            .set({ status: "sent", updatedAt: new Date() })
            .where(eq(t.invoices.id, approval.entityId));
          break;
      }
    } else {
      switch (approval.type) {
        case "purchase_order":
        case "subcontract":
          await tx
            .update(t.purchaseOrders)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(eq(t.purchaseOrders.id, approval.entityId));
          break;
        case "change_order":
          await tx
            .update(t.changeOrders)
            .set({ status: "rejected", updatedAt: new Date() })
            .where(eq(t.changeOrders.id, approval.entityId));
          break;
        case "invoice":
          await tx
            .update(t.invoices)
            .set({ status: "void", updatedAt: new Date() })
            .where(eq(t.invoices.id, approval.entityId));
          break;
      }
    }

    await audit(tx, ctx, {
      action: "approval.decide",
      entityType: "approval",
      entityId: approval.id,
      summary: `${approved ? "Approved" : "Rejected"} ${approval.title}`,
      risk: approved ? "warning" : "critical",
      projectId: approval.projectId,
      metadata: {
        type: approval.type,
        decision: d.decision,
        amount: approval.amount,
        note: d.note ?? null,
      },
    });

    revalidatePath("/approvals");
    revalidatePath(MODULE_PATH[approval.type]);

    return ok(approved ? "Request approved" : "Request rejected");
  });
}
