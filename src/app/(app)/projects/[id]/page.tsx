import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { CalendarClock, MapPin, User2, AlertTriangle, Trash2, Receipt } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { num, formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { daysUntil } from "@/lib/severity";
import { getProjectCost, getRequirementCoverage } from "@/lib/queries";
import {
  PROJECT_STATUS_TONE,
  REQUIREMENT_STATUS_TONE,
  CHANGE_ORDER_STATUS_TONE,
  INVOICE_STATUS_TONE,
} from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge, StatusPill } from "@/components/app/status-badge";
import { CoverageBar } from "@/components/app/meters";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/app/action-button";
import { AttachmentsPanel } from "@/components/app/attachments-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { WorkViews } from "../work-views";
import {
  AddTaskDialog,
  AddMilestoneDialog,
  EditMilestoneDialog,
  AddWbsDialog,
  EditWbsDialog,
  WbsBudgetCell,
  AddChangeOrderDialog,
  EditChangeOrderDialog,
  RaiseRequirementDialog,
  EditRequirementDialog,
  ProjectStatusControl,
  EditProjectDialog,
} from "../dialogs";
import { cancelRequirement } from "../../requirements/actions";
import {
  reachMilestone,
  revertMilestone,
  submitChangeOrder,
  deleteChangeOrder,
  reopenChangeOrder,
  deleteMilestone,
  deleteWbsCode,
} from "../actions";

const PROJECT_TABS = ["schedule", "budget", "requirements", "changes", "billing"] as const;

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  // Deep-link support: dashboard/approvals cards point at a specific tab.
  const initialTab = PROJECT_TABS.includes(tab as (typeof PROJECT_TABS)[number])
    ? (tab as string)
    : "schedule";
  const user = await requireCapability("projects.view");
  const currency = user.currencyCode;

  const result = await db(async (tx) => {
    const [project] = await tx
      .select()
      .from(t.projects)
      .where(eq(t.projects.id, id))
      .limit(1);
    if (!project) return null;

    const wbs = await tx
      .select()
      .from(t.wbsCodes)
      .where(eq(t.wbsCodes.projectId, id))
      .orderBy(asc(t.wbsCodes.sortOrder), asc(t.wbsCodes.code));

    const tasks = await tx
      .select({
        id: t.tasks.id,
        name: t.tasks.name,
        description: t.tasks.description,
        status: t.tasks.status,
        priority: t.tasks.priority,
        progress: t.tasks.progress,
        startDate: t.tasks.startDate,
        dueDate: t.tasks.dueDate,
        isBlocked: t.tasks.isBlocked,
        wbsId: t.tasks.wbsId,
        assigneeId: t.tasks.assigneeId,
        weight: t.tasks.weight,
        assigneeName: t.users.fullName,
      })
      .from(t.tasks)
      .leftJoin(t.users, eq(t.users.id, t.tasks.assigneeId))
      .where(eq(t.tasks.projectId, id))
      .orderBy(asc(t.tasks.sortOrder), asc(t.tasks.createdAt));

    const taskIds = tasks.map((tk) => tk.id);
    const checklist = taskIds.length
      ? await tx
          .select({
            id: t.taskChecklistItems.id,
            taskId: t.taskChecklistItems.taskId,
            title: t.taskChecklistItems.title,
            isDone: t.taskChecklistItems.isDone,
          })
          .from(t.taskChecklistItems)
          .where(inArray(t.taskChecklistItems.taskId, taskIds))
          .orderBy(asc(t.taskChecklistItems.sortOrder), asc(t.taskChecklistItems.createdAt))
      : [];
    const comments = taskIds.length
      ? await tx
          .select({
            id: t.taskComments.id,
            taskId: t.taskComments.taskId,
            authorName: t.taskComments.authorName,
            body: t.taskComments.body,
            createdAt: t.taskComments.createdAt,
          })
          .from(t.taskComments)
          .where(inArray(t.taskComments.taskId, taskIds))
          .orderBy(asc(t.taskComments.createdAt))
      : [];

    const milestones = await tx
      .select()
      .from(t.milestones)
      .where(eq(t.milestones.projectId, id))
      .orderBy(asc(t.milestones.sortOrder), asc(t.milestones.dueDate));

    const requirements = await tx
      .select()
      .from(t.projectRequirements)
      .where(eq(t.projectRequirements.projectId, id))
      .orderBy(desc(t.projectRequirements.createdAt));

    const changeOrders = await tx
      .select()
      .from(t.changeOrders)
      .where(eq(t.changeOrders.projectId, id))
      .orderBy(desc(t.changeOrders.createdAt));

    const wbsCosts = await tx
      .select({
        wbsId: t.costPostings.wbsId,
        type: t.costPostings.type,
        total: sql<string>`coalesce(sum(${t.costPostings.amount}),0)`,
      })
      .from(t.costPostings)
      .where(eq(t.costPostings.projectId, id))
      .groupBy(t.costPostings.wbsId, t.costPostings.type);

    const members = await tx
      .select({ id: t.users.id, name: t.users.fullName })
      .from(t.users)
      .where(eq(t.users.isActive, true));

    // "Billed to date" must be NET (ex-VAT) so it's apples-to-apples with the
    // ex-VAT contract value — VAT is a pass-through tax added on top and doesn't
    // count toward the contract. (This matches the over-billing guard in
    // billing/actions.ts, which also compares net subtotals.)
    const [billedRow] = await tx
      .select({ b: sql<string>`coalesce(sum(${t.invoices.subtotal}), 0)` })
      .from(t.invoices)
      .where(and(eq(t.invoices.projectId, id), ne(t.invoices.status, "void")));

    // This project's invoices — so the owner can see what makes up "billed to
    // date" without scanning the global billing list.
    const invoices = await tx
      .select({
        id: t.invoices.id,
        number: t.invoices.number,
        type: t.invoices.type,
        status: t.invoices.status,
        totalAmount: t.invoices.totalAmount,
        amountPaid: t.invoices.amountPaid,
        issueDate: t.invoices.issueDate,
      })
      .from(t.invoices)
      .where(eq(t.invoices.projectId, id))
      .orderBy(desc(t.invoices.createdAt));

    const coverage = await getRequirementCoverage(tx, id);
    const cost = await getProjectCost(tx, id);

    return { project, wbs, tasks, checklist, comments, milestones, requirements, changeOrders, wbsCosts, members, coverage, cost, billed: num(billedRow?.b), invoices };
  });

  if (!result) notFound();
  const { project, wbs, tasks, checklist, comments, milestones, requirements, changeOrders, wbsCosts, members, coverage, cost, billed, invoices } = result;

  const canManage = can(user.role, "projects.manage");
  const canSchedule = can(user.role, "schedule.manage");
  const canReq = can(user.role, "requirements.raise");
  const canCO = can(user.role, "changeorders.manage");
  const canBill = can(user.role, "billing.manage");

  const wbsOptions = wbs.map((w) => ({ id: w.id, label: `${w.code} — ${w.name}` }));
  const taskOptions = tasks.map((tk) => ({ id: tk.id, label: tk.name, wbsId: tk.wbsId }));
  const memberOptions = members.map((mb) => ({ id: mb.id, label: mb.name }));

  // Shape the schedule data for the Board / Table / Timeline work module.
  const wbsLabelById = Object.fromEntries(wbs.map((w) => [w.id, `${w.code} — ${w.name}`]));
  const checklistByTask: Record<string, { id: string; title: string; isDone: boolean }[]> = {};
  const checklistCount: Record<string, { total: number; done: number }> = {};
  for (const c of checklist) {
    (checklistByTask[c.taskId] ??= []).push({ id: c.id, title: c.title, isDone: c.isDone });
    const cnt = (checklistCount[c.taskId] ??= { total: 0, done: 0 });
    cnt.total += 1;
    if (c.isDone) cnt.done += 1;
  }
  const commentsByTask: Record<
    string,
    { id: string; authorName: string; body: string; createdAt: string }[]
  > = {};
  const commentCount: Record<string, number> = {};
  for (const c of comments) {
    (commentsByTask[c.taskId] ??= []).push({
      id: c.id,
      authorName: c.authorName,
      body: c.body,
      createdAt: new Date(c.createdAt).toISOString(),
    });
    commentCount[c.taskId] = (commentCount[c.taskId] ?? 0) + 1;
  }
  const boardTasks = tasks.map((tk) => ({
    id: tk.id,
    name: tk.name,
    description: tk.description,
    status: tk.status,
    priority: tk.priority,
    progress: tk.progress,
    startDate: tk.startDate,
    dueDate: tk.dueDate,
    isBlocked: tk.isBlocked,
    wbsId: tk.wbsId,
    assigneeId: tk.assigneeId,
    assigneeName: tk.assigneeName,
    weight: tk.weight,
    checklistTotal: checklistCount[tk.id]?.total ?? 0,
    checklistDone: checklistCount[tk.id]?.done ?? 0,
    commentCount: commentCount[tk.id] ?? 0,
  }));

  const wbsCostMap = new Map<string, { committed: number; actual: number; budget: number }>();
  for (const c of wbsCosts) {
    if (!c.wbsId) continue;
    const cur = wbsCostMap.get(c.wbsId) ?? { committed: 0, actual: 0, budget: 0 };
    if (c.type === "commitment") cur.committed += num(c.total);
    if (c.type === "actual") cur.actual += num(c.total);
    // WBS-tagged budget adjustments (e.g. a finance posting to a cost code) must
    // count toward that code's budget so Remaining reconciles with the Costing
    // detail page and the project budget header (getProjectCost includes them).
    if (c.type === "budget") cur.budget += num(c.total);
    wbsCostMap.set(c.wbsId, cur);
  }

  // "Blocked by material shortage" must reflect a *live* shortage — not a stale
  // flag, and not a task a user parked in "blocked" for a non-material reason.
  // Count a task only when its material flag is set AND it still has an open
  // (un-fulfilled, un-cancelled) requirement. So receiving a requirement in full
  // clears the banner, and a manual block never inflates it.
  const tasksWithOpenShortage = new Set(
    requirements
      .filter((r) => r.taskId && r.status !== "cancelled" && r.status !== "fulfilled")
      .map((r) => r.taskId),
  );
  const blockedCount = tasks.filter(
    (tk) => tk.isBlocked && tasksWithOpenShortage.has(tk.id),
  ).length;
  const contractValue = num(project.contractValue);
  const margin = contractValue - cost.forecast;
  const billedRemaining = contractValue - billed;

  return (
    <div>
      <PageHeader
        backHref="/projects"
        backLabel="All projects"
        eyebrow="Project"
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{project.code}</span>
            {project.clientName && (
              <span className="inline-flex items-center gap-1">
                <User2 className="size-3.5" /> {project.clientName}
              </span>
            )}
            {project.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {project.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              {formatDate(project.startDate)} → {formatDate(project.endDate)}
            </span>
          </span>
        }
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              <EditProjectDialog
                project={{
                  id: project.id,
                  name: project.name,
                  clientName: project.clientName,
                  location: project.location,
                  contractValue: project.contractValue,
                  startDate: project.startDate,
                  endDate: project.endDate,
                  description: project.description,
                }}
              />
              <ProjectStatusControl projectId={project.id} status={project.status} />
            </div>
          ) : (
            <StatusPill status={project.status} tones={PROJECT_STATUS_TONE} />
          )
        }
      />

      {blockedCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">
          <AlertTriangle className="size-4" />
          {blockedCount} task{blockedCount > 1 ? "s" : ""} blocked by material shortage.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Budget" value={formatMoney(cost.budget, currency, { compact: true })} />
        <StatCard label="Committed" value={formatMoney(cost.committed, currency, { compact: true })} tone="info" />
        <StatCard label="Actual" value={formatMoney(cost.actual, currency, { compact: true })} />
        <StatCard
          label="Forecast"
          value={formatMoney(cost.forecast, currency, { compact: true })}
          // Only flag "over budget" once a budget is set (else a new job with
          // any cost always reads over budget, contradicting the dashboard's
          // budget>0 queue), and align the caption to the same 3% tolerance the
          // tone uses so green never sits next to "over budget".
          tone={cost.budget > 0 && cost.variance > cost.budget * 0.03 ? "warning" : "good"}
          sub={
            cost.budget === 0
              ? "No budget set"
              : cost.variance > cost.budget * 0.03
                ? `+${formatMoney(cost.variance, currency, { compact: true })} over budget`
                : cost.variance > 0
                  ? "within tolerance"
                  : "on budget"
          }
        />
        <StatCard label="Progress" value={`${Math.round(num(project.progress))}%`} tone="info" />
      </div>

      <SectionCard title="Commercial summary" className="mb-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div>
            <p className="eyebrow text-muted-foreground">Contract value</p>
            <p className="font-display text-lg font-semibold tabular">{formatMoney(contractValue, currency)}</p>
          </div>
          <div>
            <p className="eyebrow text-muted-foreground">Forecast cost</p>
            <p className="font-display text-lg font-semibold tabular">{formatMoney(cost.forecast, currency)}</p>
          </div>
          <div>
            <p className="eyebrow text-muted-foreground">Forecast margin</p>
            <p className={`font-display text-lg font-semibold tabular ${margin < 0 ? "text-critical" : "text-good"}`}>
              {formatMoney(margin, currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {contractValue > 0 ? `${Math.round((margin / contractValue) * 100)}% of contract` : "no contract set"}
            </p>
          </div>
          <div>
            <p className="eyebrow text-muted-foreground">Billed to date</p>
            <p className="font-display text-lg font-semibold tabular">{formatMoney(billed, currency)}</p>
            <p className="text-xs text-muted-foreground">
              {contractValue > 0
                ? `${formatMoney(billedRemaining, currency, { compact: true })} left to bill`
                : "—"}
            </p>
          </div>
        </div>
        {project.description && (
          <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">{project.description}</p>
        )}
      </SectionCard>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="budget">Budget / WBS</TabsTrigger>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
          <TabsTrigger value="changes">Change Orders</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        {/* ─── Schedule ─── */}
        <TabsContent value="schedule" className="space-y-4">
          <SectionCard
            title="Work"
            description="Board, table and timeline — drag to update status, click a card to open it."
            actions={
              canSchedule ? (
                <AddTaskDialog projectId={project.id} wbsOptions={wbsOptions} memberOptions={memberOptions} />
              ) : null
            }
          >
            {tasks.length === 0 ? (
              <EmptyState title="No tasks yet" description="Break the project into tasks to plan and track the work." />
            ) : (
              <WorkViews
                projectId={project.id}
                tasks={boardTasks}
                wbsOptions={wbsOptions}
                memberOptions={memberOptions}
                wbsLabelById={wbsLabelById}
                checklistByTask={checklistByTask}
                commentsByTask={commentsByTask}
                canSchedule={canSchedule}
              />
            )}
          </SectionCard>

          <SectionCard
            title="Milestones"
            description="Billing milestones drive progress invoices."
            actions={canSchedule ? <AddMilestoneDialog projectId={project.id} /> : null}
            noPadding
          >
            {milestones.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No milestones" description="Add billing milestones to enable progress invoicing." />
              </div>
            ) : (
              <div className="divide-y">
                {milestones.map((ms) => {
                  const overdueMs =
                    ms.status === "pending" &&
                    (() => {
                      const d = daysUntil(ms.dueDate);
                      return d !== null && d < 0;
                    })();
                  const displayStatus = overdueMs ? "missed" : ms.status;
                  return (
                    <div key={ms.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{ms.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Due {formatDate(ms.dueDate)} · {formatMoney(ms.billingAmount, currency)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          tone={
                            displayStatus === "reached" || displayStatus === "invoiced"
                              ? "good"
                              : displayStatus === "missed"
                                ? "critical"
                                : "neutral"
                          }
                        >
                          {displayStatus}
                        </StatusBadge>
                        {canSchedule && ms.status === "pending" && (
                          <ActionButton
                            action={reachMilestone}
                            fields={{ milestoneId: ms.id, projectId: project.id }}
                            variant="outline"
                            size="xs"
                          >
                            Mark reached
                          </ActionButton>
                        )}
                        {canSchedule && ms.status === "reached" && (
                          <ActionButton
                            action={revertMilestone}
                            fields={{ milestoneId: ms.id, projectId: project.id }}
                            variant="outline"
                            size="xs"
                          >
                            Mark pending
                          </ActionButton>
                        )}
                        {canSchedule && ms.status !== "invoiced" && (
                          <>
                            <EditMilestoneDialog
                              projectId={project.id}
                              milestone={{
                                id: ms.id,
                                name: ms.name,
                                dueDate: ms.dueDate,
                                billingAmount: ms.billingAmount,
                              }}
                            />
                            <ActionButton
                              action={deleteMilestone}
                              fields={{ milestoneId: ms.id, projectId: project.id }}
                              confirm={`Delete milestone "${ms.name}"?`}
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Delete milestone ${ms.name}`}
                            >
                              <Trash2 className="size-3.5" />
                            </ActionButton>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ─── Budget / WBS ─── */}
        <TabsContent value="budget">
          <SectionCard
            title="Work breakdown & cost codes"
            actions={canManage ? <AddWbsDialog projectId={project.id} /> : null}
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Code</th>
                    <th className="px-4 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 text-right font-medium">Budget</th>
                    <th className="px-4 py-2.5 text-right font-medium">Committed</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actual</th>
                    <th className="px-4 py-2.5 text-right font-medium">Remaining</th>
                    {canManage && <th className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {wbs.map((w) => {
                    const c = wbsCostMap.get(w.id) ?? { committed: 0, actual: 0, budget: 0 };
                    // Remaining uses the base WBS budget PLUS any budget-type
                    // postings tagged to this code (the editable Budget cell stays
                    // bound to the raw w.budget the inline editor writes back).
                    const remaining = num(w.budget) + c.budget - c.committed - c.actual;
                    const hasCost = c.committed !== 0 || c.actual !== 0;
                    return (
                      <tr key={w.id} className="border-b last:border-0">
                        <td className="px-4 py-2.5 font-medium">{w.code}</td>
                        <td className="px-4 py-2.5">{w.name}</td>
                        <td className="px-4 py-2.5 text-right tabular">
                          {canManage ? (
                            <WbsBudgetCell wbsId={w.id} projectId={project.id} budget={w.budget} />
                          ) : (
                            formatMoney(w.budget, currency)
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular text-info">{formatMoney(c.committed, currency)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(c.actual, currency)}</td>
                        <td className={`px-4 py-2.5 text-right tabular ${remaining < 0 ? "text-critical" : "text-muted-foreground"}`}>
                          {formatMoney(remaining, currency)}
                        </td>
                        {canManage && (
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <EditWbsDialog
                                projectId={project.id}
                                wbs={{ id: w.id, code: w.code, name: w.name, budget: w.budget }}
                              />
                              {!hasCost && (
                                <ActionButton
                                  action={deleteWbsCode}
                                  fields={{ wbsId: w.id, projectId: project.id }}
                                  confirm={`Delete cost code ${w.code}?`}
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Delete cost code ${w.code}`}
                                >
                                  <Trash2 className="size-3.5" />
                                </ActionButton>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ─── Requirements ─── */}
        <TabsContent value="requirements">
          <SectionCard
            title="Material requirements"
            description="Required vs allocated vs inbound — shortages flag the task."
            actions={
              canReq ? (
                <RaiseRequirementDialog projectId={project.id} taskOptions={taskOptions} wbsOptions={wbsOptions} />
              ) : null
            }
            noPadding
          >
            {requirements.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No requirements" description="Raise material needs against tasks to start procurement." />
              </div>
            ) : (
              <div className="divide-y">
                {requirements.map((r) => {
                  const cov = coverage.get(r.id);
                  const estValue = num(r.quantity) * num(r.estimatedUnitCost);
                  const canEditReq =
                    canReq && r.status !== "cancelled" && r.status !== "fulfilled";
                  return (
                    <div key={r.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{r.itemName}</p>
                          <p className="text-xs text-muted-foreground">
                            {num(r.quantity)} {r.unit} · needed {formatDate(r.neededBy)}
                            {estValue > 0 && <> · est {formatMoney(estValue, currency)}</>}
                          </p>
                          {r.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground/80">{r.description}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <StatusPill status={r.status} tones={REQUIREMENT_STATUS_TONE} />
                          {canEditReq && (
                            <>
                              <EditRequirementDialog
                                projectId={project.id}
                                taskOptions={taskOptions}
                                wbsOptions={wbsOptions}
                                requirement={{
                                  id: r.id,
                                  itemName: r.itemName,
                                  unit: r.unit,
                                  quantity: r.quantity,
                                  estimatedUnitCost: r.estimatedUnitCost,
                                  neededBy: r.neededBy,
                                  taskId: r.taskId,
                                  wbsId: r.wbsId,
                                  description: r.description,
                                }}
                              />
                              <ActionButton
                                action={cancelRequirement}
                                fields={{ requirementId: r.id }}
                                confirm={`Cancel requirement "${r.itemName}"?`}
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Cancel requirement ${r.itemName}`}
                              >
                                <Trash2 className="size-3.5" />
                              </ActionButton>
                            </>
                          )}
                        </div>
                      </div>
                      {cov && (
                        <div className="mt-2 space-y-1">
                          <CoverageBar
                            required={cov.required}
                            allocated={cov.allocated}
                            received={cov.received}
                            inbound={cov.inbound}
                          />
                          <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                            <span>Allocated {cov.allocated}</span>
                            <span>Received {cov.received}</span>
                            <span>Inbound {cov.inbound}</span>
                            {cov.shortage > 0 ? (
                              <span className="text-critical">Shortage {cov.shortage}</span>
                            ) : (
                              <span className="text-good">Covered</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ─── Change orders ─── */}
        <TabsContent value="changes">
          <SectionCard
            title="Change orders"
            actions={canCO ? <AddChangeOrderDialog projectId={project.id} /> : null}
            noPadding
          >
            {changeOrders.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No change orders" description="Log scope changes with cost and schedule impact." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">CO</th>
                      <th className="px-4 py-2.5 font-medium">Title</th>
                      <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                      <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                      <th className="px-4 py-2.5 text-right font-medium">Days</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      {canCO && <th className="px-4 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody>
                    {changeOrders.map((co) => (
                      <tr key={co.id} className="border-b last:border-0">
                        <td className="px-4 py-2.5 font-medium">{co.number}</td>
                        <td className="px-4 py-2.5">{co.title}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(co.costImpact, currency)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(co.revenueImpact, currency)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{co.scheduleImpactDays}</td>
                        <td className="px-4 py-2.5">
                          <StatusPill status={co.status} tones={CHANGE_ORDER_STATUS_TONE} />
                        </td>
                        {canCO && (
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {co.status === "draft" && (
                                <>
                                  <EditChangeOrderDialog
                                    projectId={project.id}
                                    changeOrder={{
                                      id: co.id,
                                      title: co.title,
                                      costImpact: co.costImpact,
                                      revenueImpact: co.revenueImpact,
                                      scheduleImpactDays: co.scheduleImpactDays,
                                      description: co.description,
                                    }}
                                  />
                                  <ActionButton
                                    action={submitChangeOrder}
                                    fields={{ changeOrderId: co.id, projectId: project.id }}
                                    variant="outline"
                                    size="xs"
                                  >
                                    Submit
                                  </ActionButton>
                                </>
                              )}
                              {co.status === "rejected" && (
                                <ActionButton
                                  action={reopenChangeOrder}
                                  fields={{ changeOrderId: co.id, projectId: project.id }}
                                  variant="outline"
                                  size="xs"
                                >
                                  Reopen
                                </ActionButton>
                              )}
                              {(co.status === "draft" || co.status === "rejected") && (
                                <ActionButton
                                  action={deleteChangeOrder}
                                  fields={{ changeOrderId: co.id, projectId: project.id }}
                                  variant="ghost"
                                  size="icon-sm"
                                  confirm={`Delete ${co.number}? This can't be undone.`}
                                  aria-label={`Delete ${co.number}`}
                                >
                                  <Trash2 className="size-4" />
                                </ActionButton>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ─── Billing ─── */}
        <TabsContent value="billing" className="space-y-4">
          <SectionCard
            title="Invoices"
            description="Invoices raised against this project. Billed to date (above) is net of VAT."
            noPadding
            actions={
              canBill ? (
                <Button size="sm" variant="outline" render={<Link href="/billing" />}>
                  <Receipt className="size-4" /> New invoice
                </Button>
              ) : null
            }
          >
            {invoices.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Receipt className="size-5" />}
                  title="No invoices yet"
                  description="Progress and milestone invoices for this project will appear here."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Invoice</th>
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 text-right font-medium">Total</th>
                      <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                      <th className="px-4 py-2.5 font-medium">Issued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-medium">
                          <Link href={`/billing/${inv.id}`} className="hover:underline">
                            {inv.number}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 capitalize text-muted-foreground">{inv.type}</td>
                        <td className="px-4 py-2.5">
                          <StatusPill status={inv.status} tones={INVOICE_STATUS_TONE} />
                        </td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(inv.totalAmount, currency)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(inv.amountPaid, currency)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(inv.issueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <div className="mt-4">
        <AttachmentsPanel entityType="project" entityId={project.id} />
      </div>
    </div>
  );
}
