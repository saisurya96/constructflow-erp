"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import type { Tx } from "@/db/client";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { recomputeRequirementCoverage, reevaluateTaskMaterialBlock } from "@/lib/effects";
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

/** Verify the project exists in this tenant and any task/WBS link belongs to it.
 *  Returns a fail() ActionState to short-circuit, or null to proceed. */
async function assertReqLinks(
  tx: Tx,
  projectId: string,
  taskId?: string,
  wbsId?: string,
): Promise<ActionState | null> {
  const [proj] = await tx
    .select({ id: t.projects.id })
    .from(t.projects)
    .where(eq(t.projects.id, projectId))
    .limit(1);
  if (!proj) return fail("Project not found");
  if (taskId) {
    const [task] = await tx
      .select({ id: t.tasks.id })
      .from(t.tasks)
      .where(and(eq(t.tasks.id, taskId), eq(t.tasks.projectId, projectId)))
      .limit(1);
    if (!task) return fail("That task doesn't belong to this project");
  }
  if (wbsId) {
    const [w] = await tx
      .select({ id: t.wbsCodes.id })
      .from(t.wbsCodes)
      .where(and(eq(t.wbsCodes.id, wbsId), eq(t.wbsCodes.projectId, projectId)))
      .limit(1);
    if (!w) return fail("That cost code doesn't belong to this project");
  }
  return null;
}

export async function raiseRequirement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(requirementSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "requirements.raise")) return fail("You don't have permission");
    // Bind project/task/WBS together — RLS only scopes the tenant, so a
    // sibling-project task or cost-code id from the form must not be linked
    // (it would fake another job's coverage or block the wrong task).
    const guard = await assertReqLinks(tx, d.projectId, d.taskId, d.wbsId);
    if (guard) return guard;
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
    // Raising an unmet need flags the task as blocked until covered. The shared
    // helper derives this from the task's open requirements (so receiving later
    // clears it via the same logic) and never downgrades a done task.
    await reevaluateTaskMaterialBlock(tx, d.taskId);
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
      .select({
        status: t.projectRequirements.status,
        taskId: t.projectRequirements.taskId,
        projectId: t.projectRequirements.projectId,
      })
      .from(t.projectRequirements)
      .where(eq(t.projectRequirements.id, d.requirementId))
      .limit(1);
    if (!existing) return fail("Requirement not found");
    if (existing.status === "cancelled" || existing.status === "fulfilled")
      return fail("A cancelled or fulfilled requirement can't be edited");
    // Scope the (possibly changed) task/WBS link to the requirement's OWN project.
    const guard = await assertReqLinks(tx, existing.projectId, d.taskId, d.wbsId);
    if (guard) return guard;
    const prevTaskId = existing.taskId;
    const newTaskId = d.taskId ?? null;
    await tx
      .update(t.projectRequirements)
      .set({
        taskId: newTaskId,
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
    // Re-derive coverage status from the (possibly changed) quantity so the
    // stored status pill never drifts from the live coverage bar.
    await recomputeRequirementCoverage(tx, d.requirementId);
    // Keep task "blocked by shortage" flags honest if the task link changed.
    if (prevTaskId !== newTaskId) {
      await reevaluateTaskMaterialBlock(tx, prevTaskId);
      await reevaluateTaskMaterialBlock(tx, newTaskId);
    }
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
    // The cancelled need no longer counts as open, so re-derive the task's
    // material-block flag — this clears it (and lifts the task off "blocked")
    // when it was the task's last open requirement.
    await reevaluateTaskMaterialBlock(tx, req.taskId);
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
