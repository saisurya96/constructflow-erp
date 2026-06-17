"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/auth/context";
import type { Tx } from "@/db/client";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import * as t from "@/db/schema";
import { money } from "@/lib/money";
import { ok, fail, type ActionState } from "@/lib/forms";
import type { TaskStatus, TaskPriority } from "@/db/schema";

/**
 * Interactive task mutations for the Kanban board, table and task drawer.
 *
 * Unlike the form-driven dialogs in ./actions.ts, these take plain object
 * arguments so the client can call them directly (drag-drop, inline selects,
 * checkbox toggles) without round-tripping through FormData. Each one still
 * enforces the schedule.manage capability, writes to the audit trail, and
 * revalidates the project page so server-derived rollups stay in sync.
 */

const pctStr = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

async function recomputeProjectProgress(tx: Tx, projectId: string) {
  const rows = await tx
    .select({ p: t.tasks.progress, w: t.tasks.weight })
    .from(t.tasks)
    .where(eq(t.tasks.projectId, projectId));
  if (!rows.length) {
    await tx.update(t.projects).set({ progress: "0" }).where(eq(t.projects.id, projectId));
    return;
  }
  const totalW = rows.reduce((s, r) => s + Number(r.w ?? 0), 0) || 1;
  const prog = rows.reduce((s, r) => s + Number(r.p ?? 0) * Number(r.w ?? 0), 0) / totalW;
  await tx.update(t.projects).set({ progress: pctStr(prog) }).where(eq(t.projects.id, projectId));
}

/** Inline budget edit on the Budget/WBS tab — set a cost code's budget in place,
 *  no modal-per-code. Same capability + audit + revalidation as updateWbsCode. */
export async function setWbsBudget(input: {
  wbsId: string;
  projectId: string;
  budget: number;
}): Promise<ActionState> {
  const { wbsId, projectId, budget } = input;
  if (!Number.isFinite(budget) || budget < 0) return fail("Enter a valid budget");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "projects.manage")) return fail("You don't have permission");
    const [wbs] = await tx
      .select({ code: t.wbsCodes.code })
      .from(t.wbsCodes)
      .where(and(eq(t.wbsCodes.id, wbsId), eq(t.wbsCodes.projectId, projectId)))
      .limit(1);
    if (!wbs) return fail("Cost code not found");
    await tx.update(t.wbsCodes).set({ budget: money(budget) }).where(eq(t.wbsCodes.id, wbsId));
    await audit(tx, ctx, {
      action: "wbs.budget",
      entityType: "wbs",
      entityId: wbsId,
      summary: `Set ${wbs.code} budget to ${money(budget)}`,
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/costing/${projectId}`);
    return ok("Budget updated");
  });
}

/** Move a task to a new status column (Kanban drag / table status select). */
export async function moveTask(input: {
  taskId: string;
  projectId: string;
  status: TaskStatus;
}): Promise<ActionState> {
  const { taskId, projectId, status } = input;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    // Confirm the task really belongs to the supplied project — otherwise a
    // mismatched projectId would recompute/revalidate the wrong project.
    const [task] = await tx
      .select({ name: t.tasks.name, progress: t.tasks.progress })
      .from(t.tasks)
      .where(and(eq(t.tasks.id, taskId), eq(t.tasks.projectId, projectId)))
      .limit(1);
    if (!task) return fail("Task not found");

    // Status drives progress at the extremes; mid-states keep their value.
    let progress = Number(task.progress ?? 0);
    if (status === "done") progress = 100;
    else if (status === "not_started") progress = 0;

    await tx
      .update(t.tasks)
      .set({
        status,
        progress: pctStr(progress),
        isBlocked: status === "blocked",
        updatedAt: new Date(),
      })
      .where(eq(t.tasks.id, taskId));
    await recomputeProjectProgress(tx, projectId);
    await audit(tx, ctx, {
      action: "task.move",
      entityType: "task",
      entityId: taskId,
      summary: `Moved task "${task.name}" to ${status.replace("_", " ")}`,
      risk: status === "blocked" ? "warning" : "neutral",
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/my-work");
    return ok("Task moved");
  });
}

/** Inline priority change. */
export async function setTaskPriority(input: {
  taskId: string;
  projectId: string;
  priority: TaskPriority;
}): Promise<ActionState> {
  const { taskId, projectId, priority } = input;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    const [task] = await tx
      .update(t.tasks)
      .set({ priority, updatedAt: new Date() })
      .where(and(eq(t.tasks.id, taskId), eq(t.tasks.projectId, projectId)))
      .returning({ name: t.tasks.name });
    if (!task) return fail("Task not found");
    await audit(tx, ctx, {
      action: "task.priority",
      entityType: "task",
      entityId: taskId,
      summary: `Set priority of "${task.name}" to ${priority}`,
      risk: priority === "urgent" ? "warning" : "neutral",
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/my-work");
    return ok("Priority updated");
  });
}

/** Inline assignee change (empty string clears the assignee). */
export async function setTaskAssignee(input: {
  taskId: string;
  projectId: string;
  assigneeId: string;
}): Promise<ActionState> {
  const { taskId, projectId } = input;
  const assigneeId = input.assigneeId || null;
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    const [task] = await tx
      .update(t.tasks)
      .set({ assigneeId, updatedAt: new Date() })
      .where(and(eq(t.tasks.id, taskId), eq(t.tasks.projectId, projectId)))
      .returning({ name: t.tasks.name });
    if (!task) return fail("Task not found");
    await audit(tx, ctx, {
      action: "task.assign",
      entityType: "task",
      entityId: taskId,
      summary: assigneeId
        ? `Reassigned task "${task.name}"`
        : `Unassigned task "${task.name}"`,
      projectId,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/my-work");
    return ok("Assignee updated");
  });
}

/** Fast add from a board column. */
export async function quickAddTask(input: {
  projectId: string;
  name: string;
  status?: TaskStatus;
}): Promise<ActionState> {
  const name = input.name.trim();
  const status = input.status ?? "not_started";
  if (name.length < 2) return fail("Enter a task name");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    const [maxRow] = await tx
      .select({ m: sql<number>`coalesce(max(${t.tasks.sortOrder}), 0)` })
      .from(t.tasks)
      .where(eq(t.tasks.projectId, input.projectId));
    await tx.insert(t.tasks).values({
      companyId: ctx.companyId,
      projectId: input.projectId,
      name,
      status,
      progress: status === "done" ? "100" : "0",
      isBlocked: status === "blocked",
      sortOrder: Number(maxRow?.m ?? 0) + 1,
    });
    await recomputeProjectProgress(tx, input.projectId);
    await audit(tx, ctx, {
      action: "task.create",
      entityType: "task",
      summary: `Added task: ${name}`,
      projectId: input.projectId,
    });
    revalidatePath(`/projects/${input.projectId}`);
    return ok("Task added");
  });
}

/* ───────────────────────────── checklist ───────────────────────────── */

export async function addChecklistItem(input: {
  taskId: string;
  projectId: string;
  title: string;
}): Promise<ActionState> {
  const title = input.title.trim();
  if (!title) return fail("Enter a checklist item");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    const [task] = await tx
      .select({ id: t.tasks.id })
      .from(t.tasks)
      .where(and(eq(t.tasks.id, input.taskId), eq(t.tasks.projectId, input.projectId)))
      .limit(1);
    if (!task) return fail("Task not found");
    const [maxRow] = await tx
      .select({ m: sql<number>`coalesce(max(${t.taskChecklistItems.sortOrder}), 0)` })
      .from(t.taskChecklistItems)
      .where(eq(t.taskChecklistItems.taskId, input.taskId));
    await tx.insert(t.taskChecklistItems).values({
      companyId: ctx.companyId,
      taskId: input.taskId,
      title,
      sortOrder: Number(maxRow?.m ?? 0) + 1,
    });
    revalidatePath(`/projects/${input.projectId}`);
    return ok("Item added");
  });
}

export async function toggleChecklistItem(input: {
  itemId: string;
  projectId: string;
  isDone: boolean;
}): Promise<ActionState> {
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    // Item must hang off a task in the supplied project.
    const [item] = await tx
      .select({ id: t.taskChecklistItems.id })
      .from(t.taskChecklistItems)
      .innerJoin(t.tasks, eq(t.tasks.id, t.taskChecklistItems.taskId))
      .where(and(eq(t.taskChecklistItems.id, input.itemId), eq(t.tasks.projectId, input.projectId)))
      .limit(1);
    if (!item) return fail("Item not found");
    await tx
      .update(t.taskChecklistItems)
      .set({ isDone: input.isDone })
      .where(eq(t.taskChecklistItems.id, input.itemId));
    revalidatePath(`/projects/${input.projectId}`);
    return ok("Updated");
  });
}

export async function deleteChecklistItem(input: {
  itemId: string;
  projectId: string;
}): Promise<ActionState> {
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    const [item] = await tx
      .select({ id: t.taskChecklistItems.id })
      .from(t.taskChecklistItems)
      .innerJoin(t.tasks, eq(t.tasks.id, t.taskChecklistItems.taskId))
      .where(and(eq(t.taskChecklistItems.id, input.itemId), eq(t.tasks.projectId, input.projectId)))
      .limit(1);
    if (!item) return fail("Item not found");
    await tx.delete(t.taskChecklistItems).where(eq(t.taskChecklistItems.id, input.itemId));
    revalidatePath(`/projects/${input.projectId}`);
    return ok("Item removed");
  });
}

/* ───────────────────────────── comments ────────────────────────────── */

export async function addTaskComment(input: {
  taskId: string;
  projectId: string;
  body: string;
}): Promise<ActionState> {
  const body = input.body.trim();
  if (!body) return fail("Write something first");
  return db(async (tx, ctx) => {
    if (!can(ctx.role, "schedule.manage")) return fail("You don't have permission");
    const [task] = await tx
      .select({ name: t.tasks.name })
      .from(t.tasks)
      .where(and(eq(t.tasks.id, input.taskId), eq(t.tasks.projectId, input.projectId)))
      .limit(1);
    if (!task) return fail("Task not found");
    await tx.insert(t.taskComments).values({
      companyId: ctx.companyId,
      taskId: input.taskId,
      authorId: ctx.userId,
      authorName: ctx.fullName,
      body,
    });
    await audit(tx, ctx, {
      action: "task.comment",
      entityType: "task",
      entityId: input.taskId,
      summary: `Commented on "${task.name}"`,
      projectId: input.projectId,
    });
    revalidatePath(`/projects/${input.projectId}`);
    return ok("Comment added");
  });
}
