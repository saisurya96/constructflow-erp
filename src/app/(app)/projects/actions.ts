"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import type { Tx } from "@/db/client";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { WBS_TEMPLATES } from "@/lib/constants";
import * as t from "@/db/schema";
import {
  parseForm,
  ok,
  fail,
  zMoney,
  zSignedMoney,
  zOptionalDate,
  type ActionState,
} from "@/lib/forms";
import { money, num } from "@/lib/money";

const pct = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

async function recomputeProjectProgress(tx: Tx, projectId: string) {
  const rows = await tx
    .select({ p: t.tasks.progress, w: t.tasks.weight })
    .from(t.tasks)
    .where(eq(t.tasks.projectId, projectId));
  if (!rows.length) return;
  const totalW = rows.reduce((s, r) => s + num(r.w), 0) || 1;
  const prog = rows.reduce((s, r) => s + num(r.p) * num(r.w), 0) / totalW;
  await tx.update(t.projects).set({ progress: pct(prog) }).where(eq(t.projects.id, projectId));
}

/* ───────────────────────────── projects ───────────────────────────── */

const projectSchema = z.object({
  name: z.string().min(2, "Name is required"),
  clientName: z.string().optional(),
  location: z.string().optional(),
  budget: zMoney,
  contractValue: zMoney,
  startDate: zOptionalDate,
  endDate: zOptionalDate,
  description: z.string().optional(),
  template: z.enum(["new_build", "fit_out", "renovation", "generic"]).optional(),
});

export async function createProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(projectSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "projects.manage")) return fail("You don't have permission");
    const code = await nextNumber(tx, ctx.companyId, "PRJ", "PRJ", 3);
    const [proj] = await tx
      .insert(t.projects)
      .values({
        companyId: ctx.companyId,
        code,
        name: d.name,
        clientName: d.clientName ?? null,
        location: d.location ?? null,
        budget: money(d.budget),
        contractValue: money(d.contractValue),
        startDate: d.startDate ?? null,
        endDate: d.endDate ?? null,
        description: d.description ?? null,
        createdBy: ctx.userId,
      })
      .returning();
    const template = WBS_TEMPLATES[d.template ?? "new_build"] ?? WBS_TEMPLATES.new_build;
    await tx.insert(t.wbsCodes).values(
      template.codes.map((w, i) => ({
        companyId: ctx.companyId,
        projectId: proj.id,
        code: w.code,
        name: w.name,
        sortOrder: i,
      })),
    );
    await audit(tx, ctx, {
      action: "project.create",
      entityType: "project",
      entityId: proj.id,
      summary: `Created project ${proj.name} (${code})`,
      projectId: proj.id,
    });
    revalidatePath("/projects");
    return ok("Project created", `/projects/${proj.id}`);
  });
}

const PROJECT_STATUSES = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "archived",
] as const;

export async function updateProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = parseForm(projectSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "projects.manage")) return fail("You don't have permission");
    const [proj] = await tx
      .update(t.projects)
      .set({
        name: d.name,
        clientName: d.clientName ?? null,
        location: d.location ?? null,
        budget: money(d.budget),
        contractValue: money(d.contractValue),
        startDate: d.startDate ?? null,
        endDate: d.endDate ?? null,
        description: d.description ?? null,
        updatedAt: new Date(),
      })
      .where(eq(t.projects.id, projectId))
      .returning();
    if (!proj) return fail("Project not found");
    await audit(tx, ctx, {
      action: "project.update",
      entityType: "project",
      entityId: projectId,
      summary: `Updated project details for ${proj.name}`,
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    return ok("Project updated");
  });
}

export async function updateProjectStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const statusParse = z.enum(PROJECT_STATUSES).safeParse(formData.get("status"));
  if (!statusParse.success) return fail("Invalid status");
  const status = statusParse.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "projects.manage")) return fail("You don't have permission");
    await tx.update(t.projects).set({ status, updatedAt: new Date() }).where(eq(t.projects.id, projectId));
    await audit(tx, ctx, {
      action: "project.status",
      entityType: "project",
      entityId: projectId,
      summary: `Set project status to ${status}`,
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    return ok("Status updated");
  });
}

/* ──────────────────────────── WBS / cost codes ─────────────────────── */

const wbsSchema = z.object({
  projectId: z.string().uuid(),
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  budget: zMoney,
});

export async function createWbsCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(wbsSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "projects.manage")) return fail("You don't have permission");
    await tx.insert(t.wbsCodes).values({
      companyId: ctx.companyId,
      projectId: d.projectId,
      code: d.code,
      name: d.name,
      budget: money(d.budget),
      sortOrder: 99,
    });
    await audit(tx, ctx, {
      action: "wbs.create",
      entityType: "wbs",
      summary: `Added cost code ${d.code} — ${d.name}`,
      projectId: d.projectId,
    });
    revalidatePath(`/projects/${d.projectId}`);
    return ok("Cost code added");
  });
}

const wbsUpdateSchema = wbsSchema.extend({ wbsId: z.string().uuid() });

export async function updateWbsCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(wbsUpdateSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "projects.manage")) return fail("You don't have permission");
    const [updated] = await tx
      .update(t.wbsCodes)
      .set({ code: d.code, name: d.name, budget: money(d.budget) })
      .where(eq(t.wbsCodes.id, d.wbsId))
      .returning();
    if (!updated) return fail("Cost code not found");
    await audit(tx, ctx, {
      action: "wbs.update",
      entityType: "wbs",
      entityId: d.wbsId,
      summary: `Updated cost code ${d.code} — ${d.name} (budget ${money(d.budget)})`,
      projectId: d.projectId,
    });
    revalidatePath(`/projects/${d.projectId}`);
    revalidatePath(`/costing/${d.projectId}`);
    return ok("Cost code updated");
  });
}

export async function deleteWbsCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const wbsId = String(formData.get("wbsId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "projects.manage")) return fail("You don't have permission");
    // Block deletion once the code carries any cost (commitment/actual/budget
    // postings) — removing it would silently drop money from the job ledger.
    const [posting] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(t.costPostings)
      .where(and(eq(t.costPostings.wbsId, wbsId), eq(t.costPostings.projectId, projectId)));
    if (posting && Number(posting.n) > 0)
      return fail("This cost code already has postings and can't be deleted. Set its budget to 0 instead.");
    const [wbs] = await tx
      .delete(t.wbsCodes)
      .where(eq(t.wbsCodes.id, wbsId))
      .returning();
    if (!wbs) return fail("Cost code not found");
    await audit(tx, ctx, {
      action: "wbs.delete",
      entityType: "wbs",
      entityId: wbsId,
      summary: `Deleted cost code ${wbs.code} — ${wbs.name}`,
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/costing/${projectId}`);
    return ok("Cost code deleted");
  });
}

/* ───────────────────────────── schedule ────────────────────────────── */

const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

const taskSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(2, "Task name is required"),
  description: z.string().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  wbsId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  startDate: zOptionalDate,
  dueDate: zOptionalDate,
});

export async function createTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(taskSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    // New tasks drop to the end of the not-started column.
    const [maxRow] = await tx
      .select({ m: sql<number>`coalesce(max(${t.tasks.sortOrder}), 0)` })
      .from(t.tasks)
      .where(eq(t.tasks.projectId, d.projectId));
    await tx.insert(t.tasks).values({
      companyId: ctx.companyId,
      projectId: d.projectId,
      name: d.name,
      description: d.description ?? null,
      priority: d.priority ?? "medium",
      wbsId: d.wbsId ?? null,
      assigneeId: d.assigneeId ?? null,
      startDate: d.startDate ?? null,
      dueDate: d.dueDate ?? null,
      sortOrder: Number(maxRow?.m ?? 0) + 1,
    });
    await recomputeProjectProgress(tx, d.projectId);
    await audit(tx, ctx, {
      action: "task.create",
      entityType: "task",
      summary: `Added task: ${d.name}`,
      projectId: d.projectId,
    });
    revalidatePath(`/projects/${d.projectId}`);
    return ok("Task added");
  });
}

const taskUpdateSchema = z.object({
  taskId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(2, "Task name is required"),
  description: z.string().optional(),
  status: z.enum(["not_started", "in_progress", "blocked", "done"]),
  priority: z.enum(TASK_PRIORITIES).optional(),
  progress: z.coerce.number().default(0),
  wbsId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  startDate: zOptionalDate,
  dueDate: zOptionalDate,
  weight: z.coerce.number().positive().default(1),
});

export async function updateTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(taskUpdateSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  let progress = d.progress;
  if (d.status === "done") progress = 100;
  else if (d.status === "not_started") progress = 0;
  else progress = Math.max(0, Math.min(100, progress));
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    await tx
      .update(t.tasks)
      .set({
        name: d.name,
        description: d.description ?? null,
        status: d.status,
        priority: d.priority ?? "medium",
        progress: pct(progress),
        wbsId: d.wbsId ?? null,
        assigneeId: d.assigneeId ?? null,
        startDate: d.startDate ?? null,
        dueDate: d.dueDate ?? null,
        weight: pct(d.weight),
        isBlocked: d.status === "blocked",
        updatedAt: new Date(),
      })
      .where(eq(t.tasks.id, d.taskId));
    await recomputeProjectProgress(tx, d.projectId);
    await audit(tx, ctx, {
      action: "task.update",
      entityType: "task",
      entityId: d.taskId,
      summary: `Updated task "${d.name}" to ${d.status} (${Math.round(progress)}%)`,
      risk: d.status === "blocked" ? "warning" : "neutral",
      projectId: d.projectId,
    });
    revalidatePath(`/projects/${d.projectId}`);
    return ok("Task updated");
  });
}

export async function deleteTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const taskId = String(formData.get("taskId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    const [task] = await tx
      .delete(t.tasks)
      .where(eq(t.tasks.id, taskId))
      .returning();
    if (!task) return fail("Task not found");
    await recomputeProjectProgress(tx, projectId);
    await audit(tx, ctx, {
      action: "task.delete",
      entityType: "task",
      entityId: taskId,
      summary: `Deleted task: ${task.name}`,
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    return ok("Task deleted");
  });
}

const milestoneSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(2, "Name is required"),
  dueDate: zOptionalDate,
  billingAmount: zMoney,
});

export async function createMilestone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(milestoneSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    await tx.insert(t.milestones).values({
      companyId: ctx.companyId,
      projectId: d.projectId,
      name: d.name,
      dueDate: d.dueDate ?? null,
      billingAmount: money(d.billingAmount),
    });
    await audit(tx, ctx, {
      action: "milestone.create",
      entityType: "milestone",
      summary: `Added milestone: ${d.name}`,
      projectId: d.projectId,
    });
    revalidatePath(`/projects/${d.projectId}`);
    return ok("Milestone added");
  });
}

export async function reachMilestone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const milestoneId = String(formData.get("milestoneId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    await tx
      .update(t.milestones)
      .set({ status: "reached", reachedAt: new Date().toISOString().slice(0, 10) })
      .where(eq(t.milestones.id, milestoneId));
    await audit(tx, ctx, {
      action: "milestone.reach",
      entityType: "milestone",
      entityId: milestoneId,
      summary: "Marked milestone as reached",
      risk: "good",
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    return ok("Milestone reached");
  });
}

const milestoneUpdateSchema = milestoneSchema.extend({ milestoneId: z.string().uuid() });

export async function updateMilestone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(milestoneUpdateSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    const [existing] = await tx
      .select({ status: t.milestones.status })
      .from(t.milestones)
      .where(eq(t.milestones.id, d.milestoneId))
      .limit(1);
    if (!existing) return fail("Milestone not found");
    if (existing.status === "invoiced")
      return fail("This milestone has been invoiced and can no longer be edited");
    await tx
      .update(t.milestones)
      .set({
        name: d.name,
        dueDate: d.dueDate ?? null,
        billingAmount: money(d.billingAmount),
        updatedAt: new Date(),
      })
      .where(eq(t.milestones.id, d.milestoneId));
    await audit(tx, ctx, {
      action: "milestone.update",
      entityType: "milestone",
      entityId: d.milestoneId,
      summary: `Updated milestone: ${d.name}`,
      projectId: d.projectId,
    });
    revalidatePath(`/projects/${d.projectId}`);
    return ok("Milestone updated");
  });
}

export async function deleteMilestone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const milestoneId = String(formData.get("milestoneId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    const [existing] = await tx
      .select({ status: t.milestones.status, name: t.milestones.name })
      .from(t.milestones)
      .where(eq(t.milestones.id, milestoneId))
      .limit(1);
    if (!existing) return fail("Milestone not found");
    if (existing.status === "invoiced")
      return fail("This milestone has been invoiced and can no longer be deleted");
    await tx.delete(t.milestones).where(eq(t.milestones.id, milestoneId));
    await audit(tx, ctx, {
      action: "milestone.delete",
      entityType: "milestone",
      entityId: milestoneId,
      summary: `Deleted milestone: ${existing.name}`,
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    return ok("Milestone deleted");
  });
}

/* ─────────────────────────── change orders ─────────────────────────── */

const changeOrderSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  costImpact: zSignedMoney,
  revenueImpact: zSignedMoney,
  scheduleImpactDays: z.coerce.number().int().default(0),
  reason: z.string().optional(),
});

export async function createChangeOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(changeOrderSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "changeorders.manage")) return fail("You don't have permission");
    const number = await nextNumber(tx, ctx.companyId, "CO", "CO");
    const [co] = await tx
      .insert(t.changeOrders)
      .values({
        companyId: ctx.companyId,
        number,
        projectId: d.projectId,
        title: d.title,
        description: d.description ?? null,
        costImpact: money(d.costImpact),
        revenueImpact: money(d.revenueImpact),
        scheduleImpactDays: d.scheduleImpactDays,
        reason: d.reason ?? null,
        requestedBy: ctx.userId,
      })
      .returning();
    await audit(tx, ctx, {
      action: "changeorder.create",
      entityType: "change_order",
      entityId: co.id,
      summary: `Created ${number}: ${d.title}`,
      projectId: d.projectId,
    });
    revalidatePath(`/projects/${d.projectId}`);
    return ok("Change order created");
  });
}

export async function submitChangeOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "changeorders.manage")) return fail("You don't have permission");
    const [current] = await tx
      .select({ status: t.changeOrders.status })
      .from(t.changeOrders)
      .where(eq(t.changeOrders.id, changeOrderId))
      .limit(1)
      .for("update");
    if (!current) return fail("Change order not found");
    if (current.status !== "draft")
      return fail("Only draft change orders can be submitted for approval");
    const [co] = await tx
      .update(t.changeOrders)
      .set({ status: "submitted", updatedAt: new Date() })
      .where(eq(t.changeOrders.id, changeOrderId))
      .returning();
    if (!co) return fail("Change order not found");
    // The approval amount is the COST (budget) impact — the money the firm
    // actually commits — not the revenue impact. Revenue is carried in the
    // title so the approver can see the margin effect of the variation.
    await tx.insert(t.approvals).values({
      companyId: ctx.companyId,
      type: "change_order",
      entityType: "change_order",
      entityId: co.id,
      title: `${co.number} — ${co.title} · revenue ${money(num(co.revenueImpact))}`,
      amount: co.costImpact,
      projectId,
      requestedBy: ctx.userId,
    });
    await audit(tx, ctx, {
      action: "changeorder.submit",
      entityType: "change_order",
      entityId: co.id,
      summary: `Submitted ${co.number} for approval`,
      risk: "warning",
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/approvals");
    return ok("Submitted for approval");
  });
}
