"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/auth/context";
import type { Tx } from "@/db/client";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { WBS_TEMPLATES, PROJECT_STATUSES } from "@/lib/constants";
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
import { formatMoney, money, num } from "@/lib/money";

const pct = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/**
 * Verify a client-supplied projectId belongs to this tenant AND is open to
 * changes. Returns a fail() ActionState to short-circuit, or null to proceed.
 * Doubles as the missing IDOR check — schedule/CO create actions otherwise trust
 * the projectId from the form — and blocks edits to a completed/archived job.
 */
async function assertProjectMutable(
  tx: Tx,
  projectId: string,
): Promise<ActionState | null> {
  const [proj] = await tx
    .select({ status: t.projects.status })
    .from(t.projects)
    .where(eq(t.projects.id, projectId))
    .limit(1);
  if (!proj) return fail("Project not found");
  if (proj.status === "completed" || proj.status === "archived")
    return fail("Reopen this project to make changes");
  return null;
}

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
  status: z.enum(["planning", "active", "on_hold", "completed", "archived"]).optional(),
  // Mid-adoption baseline: cost already incurred on an in-flight job before the
  // firm started using the tool, so margin doesn't read a fictional 100%.
  openingCost: zMoney,
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
        status: d.status ?? "planning",
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
    // Opening cost-to-date posts as a real actual on the ledger, so an adopted
    // in-flight job shows a truthful forecast/margin from day one.
    if (d.openingCost > 0) {
      await tx.insert(t.costPostings).values({
        companyId: ctx.companyId,
        projectId: proj.id,
        wbsId: null,
        type: "actual",
        amount: money(d.openingCost),
        sourceType: "opening",
        description: "Opening cost to date at adoption",
        postedBy: ctx.userId,
      });
    }
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
        // Deliberately NOT writing `budget` here: the create dialog has no
        // project-budget input (budget is set per WBS code), so d.budget is
        // always 0 — writing it would wipe the running budget that change-order
        // approvals accumulate onto this column.
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
    // Friendly duplicate check (the unique index would otherwise throw a 23505
    // that aborts the tx and surfaces as an uncaught error, not a field error).
    const [dup] = await tx
      .select({ id: t.wbsCodes.id })
      .from(t.wbsCodes)
      .where(and(eq(t.wbsCodes.projectId, d.projectId), eq(t.wbsCodes.code, d.code)))
      .limit(1);
    if (dup)
      return fail("A cost code with this number already exists", {
        code: "Code already in use",
      });
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
    // Reject a rename that collides with another code on the same project.
    const [dup] = await tx
      .select({ id: t.wbsCodes.id })
      .from(t.wbsCodes)
      .where(
        and(
          eq(t.wbsCodes.projectId, d.projectId),
          eq(t.wbsCodes.code, d.code),
          ne(t.wbsCodes.id, d.wbsId),
        ),
      )
      .limit(1);
    if (dup)
      return fail("A cost code with this number already exists", {
        code: "Code already in use",
      });
    const [updated] = await tx
      .update(t.wbsCodes)
      .set({ code: d.code, name: d.name, budget: money(d.budget) })
      // Bind id AND projectId so an edit can't target another same-tenant
      // project's code (IDOR), and the revalidated projectId is the real owner.
      .where(and(eq(t.wbsCodes.id, d.wbsId), eq(t.wbsCodes.projectId, d.projectId)))
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
      // Bind id AND projectId: the posting guard above is scoped by (wbsId,
      // projectId), so a forged projectId that doesn't own the wbsId would pass
      // the guard (count 0) and then delete a sibling project's code. This stops
      // that by matching both.
      .where(and(eq(t.wbsCodes.id, wbsId), eq(t.wbsCodes.projectId, projectId)))
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
    const guard = await assertProjectMutable(tx, d.projectId);
    if (guard) return guard;
    // Scope an optional WBS link to THIS project (RLS only bounds the tenant, so
    // a sibling-project cost-code id from the form must not be linked).
    if (d.wbsId) {
      const [w] = await tx
        .select({ id: t.wbsCodes.id })
        .from(t.wbsCodes)
        .where(and(eq(t.wbsCodes.id, d.wbsId), eq(t.wbsCodes.projectId, d.projectId)))
        .limit(1);
      if (!w) return fail("Cost code not found for this project");
    }
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
    const guard = await assertProjectMutable(tx, d.projectId);
    if (guard) return guard;
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
    const [existing] = await tx
      .select({ status: t.milestones.status })
      .from(t.milestones)
      .where(eq(t.milestones.id, milestoneId))
      .limit(1);
    if (!existing) return fail("Milestone not found");
    // An invoiced milestone is locked — don't roll it back to "reached".
    if (existing.status === "invoiced")
      return fail("This milestone has been invoiced and can no longer be changed");
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

export async function revertMilestone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const milestoneId = String(formData.get("milestoneId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    const [existing] = await tx
      .select({ status: t.milestones.status, invoiceId: t.milestones.invoiceId })
      .from(t.milestones)
      .where(eq(t.milestones.id, milestoneId))
      .limit(1);
    if (!existing) return fail("Milestone not found");
    if (existing.status !== "reached")
      return fail("Only a reached milestone can be moved back to pending");
    // A milestone reserved/billed by an invoice can't be un-reached underneath it.
    if (existing.invoiceId)
      return fail("This milestone is reserved by an invoice — void that invoice first");
    await tx
      .update(t.milestones)
      .set({ status: "pending", reachedAt: null })
      .where(eq(t.milestones.id, milestoneId));
    await audit(tx, ctx, {
      action: "milestone.revert",
      entityType: "milestone",
      entityId: milestoneId,
      summary: "Reverted milestone to pending",
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    return ok("Milestone moved back to pending");
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

const changeOrderBase = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(2, "Title is required"),
  // The dialog's "Reason / description" textarea is named `description`; the
  // rationale lives here and is surfaced on the approvals queue. (There is no
  // separate `reason` form field, so that column was always null — dropped.)
  description: z.string().optional(),
  costImpact: zSignedMoney,
  revenueImpact: zSignedMoney,
  scheduleImpactDays: z.coerce.number().int().default(0),
});

// A change order with no cost, revenue or schedule impact is meaningless and
// would queue a $0 approval — require at least one non-zero impact.
const hasImpact = (d: z.infer<typeof changeOrderBase>) =>
  d.costImpact !== 0 || d.revenueImpact !== 0 || d.scheduleImpactDays !== 0;
const impactMsg = {
  message: "A change order must have a cost, revenue, or schedule impact",
  path: ["costImpact"],
};

const changeOrderSchema = changeOrderBase.refine(hasImpact, impactMsg);

export async function createChangeOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(changeOrderSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "changeorders.manage")) return fail("You don't have permission");
    const guard = await assertProjectMutable(tx, d.projectId);
    if (guard) return guard;
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

const changeOrderUpdateSchema = changeOrderBase
  .extend({ changeOrderId: z.string().uuid() })
  .refine(hasImpact, impactMsg);

export async function updateChangeOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(changeOrderUpdateSchema, formData);
  if (!parsed.success) return fail("Please fix the highlighted fields", parsed.fieldErrors);
  const d = parsed.data;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "changeorders.manage")) return fail("You don't have permission");
    const [current] = await tx
      .select({ status: t.changeOrders.status, number: t.changeOrders.number })
      .from(t.changeOrders)
      .where(eq(t.changeOrders.id, d.changeOrderId))
      .limit(1)
      .for("update");
    if (!current) return fail("Change order not found");
    if (current.status !== "draft")
      return fail("Only draft change orders can be edited");
    await tx
      .update(t.changeOrders)
      .set({
        title: d.title,
        description: d.description ?? null,
        costImpact: money(d.costImpact),
        revenueImpact: money(d.revenueImpact),
        scheduleImpactDays: d.scheduleImpactDays,
        updatedAt: new Date(),
      })
      .where(eq(t.changeOrders.id, d.changeOrderId));
    await audit(tx, ctx, {
      action: "changeorder.update",
      entityType: "change_order",
      entityId: d.changeOrderId,
      summary: `Updated ${current.number}: ${d.title}`,
      projectId: d.projectId,
    });
    revalidatePath(`/projects/${d.projectId}`);
    return ok("Change order updated");
  });
}

export async function deleteChangeOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "changeorders.manage")) return fail("You don't have permission");
    const [co] = await tx
      .select({ status: t.changeOrders.status, number: t.changeOrders.number })
      .from(t.changeOrders)
      .where(eq(t.changeOrders.id, changeOrderId))
      .limit(1)
      .for("update");
    if (!co) return fail("Change order not found");
    // Only states with no ledger effect can be removed; an applied CO has already
    // adjusted budget + contract value and must stay on the record.
    if (co.status !== "draft" && co.status !== "rejected")
      return fail("Only draft or rejected change orders can be deleted");
    await tx.delete(t.changeOrders).where(eq(t.changeOrders.id, changeOrderId));
    await audit(tx, ctx, {
      action: "changeorder.delete",
      entityType: "change_order",
      entityId: changeOrderId,
      summary: `Deleted ${co.number}`,
      risk: "warning",
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    return ok("Change order deleted");
  });
}

export async function reopenChangeOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "changeorders.manage")) return fail("You don't have permission");
    const [co] = await tx
      .select({ status: t.changeOrders.status, number: t.changeOrders.number })
      .from(t.changeOrders)
      .where(eq(t.changeOrders.id, changeOrderId))
      .limit(1)
      .for("update");
    if (!co) return fail("Change order not found");
    if (co.status !== "rejected")
      return fail("Only a rejected change order can be reopened");
    await tx
      .update(t.changeOrders)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(t.changeOrders.id, changeOrderId));
    await audit(tx, ctx, {
      action: "changeorder.reopen",
      entityType: "change_order",
      entityId: changeOrderId,
      summary: `Reopened ${co.number} to draft`,
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    return ok("Change order reopened — edit and resubmit");
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
      title: `${co.number} — ${co.title} · revenue ${formatMoney(num(co.revenueImpact), ctx.currencyCode)}`,
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
