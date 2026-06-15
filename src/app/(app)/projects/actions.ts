"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import type { Tx } from "@/db/client";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { DEFAULT_WBS_TEMPLATE } from "@/lib/constants";
import * as t from "@/db/schema";
import {
  parseForm,
  ok,
  fail,
  zMoney,
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
    await tx.insert(t.wbsCodes).values(
      DEFAULT_WBS_TEMPLATE.map((w, i) => ({
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

export async function updateProjectStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const status = String(formData.get("status") ?? "") as t.Project["status"];
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

/* ───────────────────────────── schedule ────────────────────────────── */

const taskSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(2, "Task name is required"),
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
    await tx.insert(t.tasks).values({
      companyId: ctx.companyId,
      projectId: d.projectId,
      name: d.name,
      wbsId: d.wbsId ?? null,
      assigneeId: d.assigneeId ?? null,
      startDate: d.startDate ?? null,
      dueDate: d.dueDate ?? null,
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

export async function updateTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const taskId = String(formData.get("taskId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const status = String(formData.get("status") ?? "") as t.Task["status"];
  let progress = num(String(formData.get("progress") ?? "0"));
  if (status === "done") progress = 100;
  if (status === "not_started") progress = Math.min(progress, 0);
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    await tx
      .update(t.tasks)
      .set({
        status,
        progress: pct(progress),
        isBlocked: status === "blocked",
        updatedAt: new Date(),
      })
      .where(eq(t.tasks.id, taskId));
    await recomputeProjectProgress(tx, projectId);
    await audit(tx, ctx, {
      action: "task.update",
      entityType: "task",
      entityId: taskId,
      summary: `Updated task to ${status} (${Math.round(progress)}%)`,
      risk: status === "blocked" ? "warning" : "neutral",
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    return ok("Task updated");
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

/* ─────────────────────────── change orders ─────────────────────────── */

const changeOrderSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  costImpact: zMoney,
  revenueImpact: zMoney,
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
    const [co] = await tx
      .update(t.changeOrders)
      .set({ status: "submitted", updatedAt: new Date() })
      .where(eq(t.changeOrders.id, changeOrderId))
      .returning();
    if (!co) return fail("Change order not found");
    await tx.insert(t.approvals).values({
      companyId: ctx.companyId,
      type: "change_order",
      entityType: "change_order",
      entityId: co.id,
      title: `${co.number} — ${co.title}`,
      amount: co.revenueImpact,
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
