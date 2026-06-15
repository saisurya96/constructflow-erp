"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import * as t from "@/db/schema";
import {
  parseForm,
  ok,
  fail,
  zMoney,
  zQty,
  zOptionalDate,
  type ActionState,
} from "@/lib/forms";
import { money, quantity } from "@/lib/money";

const requirementSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  wbsId: z.string().uuid().optional(),
  itemName: z.string().min(2, "Item is required"),
  unit: z.string().min(1, "Unit is required"),
  quantity: zQty,
  estimatedUnitCost: zMoney,
  neededBy: zOptionalDate,
  description: z.string().optional(),
});

export async function raiseRequirement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(requirementSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "requirements.raise")) return fail("You don't have permission");
    await tx.insert(t.projectRequirements).values({
      companyId: ctx.companyId,
      projectId: d.projectId,
      taskId: d.taskId ?? null,
      wbsId: d.wbsId ?? null,
      itemName: d.itemName,
      unit: d.unit,
      quantity: quantity(d.quantity),
      estimatedUnitCost: money(d.estimatedUnitCost),
      neededBy: d.neededBy ?? null,
      description: d.description ?? null,
      status: "submitted",
      requestedBy: ctx.userId,
    });
    // raising an unmet need flags the task as blocked until covered
    if (d.taskId) {
      await tx
        .update(t.tasks)
        .set({ isBlocked: true, status: "blocked", updatedAt: new Date() })
        .where(eq(t.tasks.id, d.taskId));
    }
    await audit(tx, ctx, {
      action: "requirement.raise",
      entityType: "requirement",
      summary: `Raised requirement: ${d.itemName} (${d.quantity} ${d.unit})`,
      risk: "warning",
      projectId: d.projectId,
    });
    revalidatePath(`/projects/${d.projectId}`);
    revalidatePath("/requirements");
    return ok("Requirement raised");
  });
}

export async function updateRequirementStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const requirementId = String(formData.get("requirementId") ?? "");
  const status = String(formData.get("status") ?? "") as t.ProjectRequirement["status"];
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "requirements.source") && !can(ctx.role, "requirements.raise"))
      return fail("You don't have permission");
    const [req] = await tx
      .update(t.projectRequirements)
      .set({ status, updatedAt: new Date() })
      .where(eq(t.projectRequirements.id, requirementId))
      .returning();
    if (!req) return fail("Requirement not found");
    await audit(tx, ctx, {
      action: "requirement.status",
      entityType: "requirement",
      entityId: requirementId,
      summary: `Requirement ${req.itemName} → ${status}`,
      projectId: req.projectId,
    });
    revalidatePath("/requirements");
    revalidatePath(`/projects/${req.projectId}`);
    return ok("Requirement updated");
  });
}
