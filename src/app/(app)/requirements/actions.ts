"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
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
import { money, quantity, num } from "@/lib/money";

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
    // Raising an unmet need flags the task as blocked until covered — but never
    // downgrade a task that is already done (or itself a milestone), which would
    // corrupt schedule/progress and fire a false "blocked by shortage" banner.
    if (d.taskId) {
      const [task] = await tx
        .select({ status: t.tasks.status })
        .from(t.tasks)
        .where(eq(t.tasks.id, d.taskId))
        .limit(1);
      if (task && task.status !== "done") {
        await tx
          .update(t.tasks)
          .set({ isBlocked: true, status: "blocked", updatedAt: new Date() })
          .where(eq(t.tasks.id, d.taskId));
      }
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

const requirementUpdateSchema = z.object({
  requirementId: z.string().uuid(),
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

export async function updateRequirement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(requirementUpdateSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "requirements.raise")) return fail("You don't have permission");
    const [existing] = await tx
      .select({ status: t.projectRequirements.status })
      .from(t.projectRequirements)
      .where(eq(t.projectRequirements.id, d.requirementId))
      .limit(1);
    if (!existing) return fail("Requirement not found");
    if (existing.status === "cancelled" || existing.status === "fulfilled")
      return fail("A cancelled or fulfilled requirement can't be edited");
    await tx
      .update(t.projectRequirements)
      .set({
        taskId: d.taskId ?? null,
        wbsId: d.wbsId ?? null,
        itemName: d.itemName,
        unit: d.unit,
        quantity: quantity(d.quantity),
        estimatedUnitCost: money(d.estimatedUnitCost),
        neededBy: d.neededBy ?? null,
        description: d.description ?? null,
        updatedAt: new Date(),
      })
      .where(eq(t.projectRequirements.id, d.requirementId));
    await audit(tx, ctx, {
      action: "requirement.update",
      entityType: "requirement",
      entityId: d.requirementId,
      summary: `Updated requirement: ${d.itemName} (${d.quantity} ${d.unit})`,
      projectId: d.projectId,
    });
    revalidatePath("/requirements");
    revalidatePath(`/projects/${d.projectId}`);
    return ok("Requirement updated");
  });
}

export async function cancelRequirement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const requirementId = String(formData.get("requirementId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "requirements.raise") && !can(ctx.role, "requirements.source"))
      return fail("You don't have permission");
    const [req] = await tx
      .select()
      .from(t.projectRequirements)
      .where(eq(t.projectRequirements.id, requirementId))
      .limit(1)
      .for("update");
    if (!req) return fail("Requirement not found");
    if (req.status === "cancelled") return fail("Requirement is already cancelled");
    if (req.status === "fulfilled") return fail("A fulfilled requirement can't be cancelled");
    // Guard: don't cancel a need that has already pulled material in.
    const [recv] = await tx
      .select({ q: sql<string>`coalesce(sum(${t.purchaseOrderLines.receivedQty}),0)` })
      .from(t.purchaseOrderLines)
      .where(eq(t.purchaseOrderLines.requirementId, requirementId));
    if (num(recv?.q) > 0)
      return fail("Material has already been received against this requirement — it can't be cancelled");
    await tx
      .update(t.projectRequirements)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(t.projectRequirements.id, requirementId));
    // Clear the blocked flag on the linked task if it has no other open need.
    if (req.taskId) {
      const others = await tx
        .select({ id: t.projectRequirements.id })
        .from(t.projectRequirements)
        .where(
          and(
            eq(t.projectRequirements.taskId, req.taskId),
            ne(t.projectRequirements.id, requirementId),
            ne(t.projectRequirements.status, "cancelled"),
            ne(t.projectRequirements.status, "fulfilled"),
          ),
        );
      if (others.length === 0) {
        // Also move the task off "blocked" — clearing isBlocked alone would leave
        // it in the contradictory blocked-status / not-blocked-flag state.
        const [task] = await tx
          .select({ status: t.tasks.status })
          .from(t.tasks)
          .where(eq(t.tasks.id, req.taskId))
          .limit(1);
        await tx
          .update(t.tasks)
          .set({
            isBlocked: false,
            ...(task?.status === "blocked" ? { status: "in_progress" as const } : {}),
            updatedAt: new Date(),
          })
          .where(eq(t.tasks.id, req.taskId));
      }
    }
    await audit(tx, ctx, {
      action: "requirement.cancel",
      entityType: "requirement",
      entityId: requirementId,
      summary: `Cancelled requirement: ${req.itemName}`,
      risk: "warning",
      projectId: req.projectId,
    });
    revalidatePath("/requirements");
    revalidatePath(`/projects/${req.projectId}`);
    return ok("Requirement cancelled");
  });
}

export async function updateRequirementStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const requirementId = String(formData.get("requirementId") ?? "");
  const statusParse = z
    .enum(["draft", "submitted", "sourcing", "ordered", "partially_received", "fulfilled", "cancelled"])
    .safeParse(formData.get("status"));
  if (!statusParse.success) return fail("Invalid status");
  const status = statusParse.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "requirements.source") && !can(ctx.role, "requirements.raise"))
      return fail("You don't have permission");
    const [req] = await tx
      .select({
        status: t.projectRequirements.status,
        itemName: t.projectRequirements.itemName,
        projectId: t.projectRequirements.projectId,
      })
      .from(t.projectRequirements)
      .where(eq(t.projectRequirements.id, requirementId))
      .limit(1)
      .for("update");
    if (!req) return fail("Requirement not found");
    // This action only backs the buyer's "Start sourcing" button. Coverage-driven
    // states (ordered / partially_received / fulfilled) are owned by the inventory
    // + ordering flows and must not be forced here, nor reopened once terminal.
    if (!(req.status === "submitted" && status === "sourcing"))
      return fail("Invalid status transition");
    await tx
      .update(t.projectRequirements)
      .set({ status, updatedAt: new Date() })
      .where(eq(t.projectRequirements.id, requirementId));
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
