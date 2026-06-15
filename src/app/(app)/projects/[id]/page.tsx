import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { CalendarClock, MapPin, User2, AlertTriangle } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { num, formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { daysUntil } from "@/lib/severity";
import { getProjectCost, getRequirementCoverage } from "@/lib/queries";
import {
  PROJECT_STATUS_TONE,
  TASK_STATUS_TONE,
  REQUIREMENT_STATUS_TONE,
  CHANGE_ORDER_STATUS_TONE,
} from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge, StatusPill } from "@/components/app/status-badge";
import { ProgressMeter, CoverageBar } from "@/components/app/meters";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/app/action-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AddTaskDialog,
  UpdateTaskDialog,
  AddMilestoneDialog,
  AddWbsDialog,
  AddChangeOrderDialog,
  RaiseRequirementDialog,
  ProjectStatusControl,
} from "../dialogs";
import { reachMilestone, submitChangeOrder } from "../actions";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCapability("projects.view");

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
        status: t.tasks.status,
        progress: t.tasks.progress,
        startDate: t.tasks.startDate,
        dueDate: t.tasks.dueDate,
        isBlocked: t.tasks.isBlocked,
        wbsId: t.tasks.wbsId,
        assigneeName: t.users.fullName,
      })
      .from(t.tasks)
      .leftJoin(t.users, eq(t.users.id, t.tasks.assigneeId))
      .where(eq(t.tasks.projectId, id))
      .orderBy(asc(t.tasks.sortOrder), asc(t.tasks.createdAt));

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

    const coverage = await getRequirementCoverage(tx, id);
    const cost = await getProjectCost(tx, id);

    return { project, wbs, tasks, milestones, requirements, changeOrders, wbsCosts, members, coverage, cost };
  });

  if (!result) notFound();
  const { project, wbs, tasks, milestones, requirements, changeOrders, wbsCosts, members, coverage, cost } = result;

  const canManage = can(user.role, "projects.manage");
  const canSchedule = can(user.role, "schedule.manage");
  const canReq = can(user.role, "requirements.raise");
  const canCO = can(user.role, "changeorders.manage");

  const wbsById = new Map(wbs.map((w) => [w.id, w]));
  const wbsOptions = wbs.map((w) => ({ id: w.id, label: `${w.code} — ${w.name}` }));
  const taskOptions = tasks.map((tk) => ({ id: tk.id, label: tk.name }));
  const memberOptions = members.map((mb) => ({ id: mb.id, label: mb.name }));

  const wbsCostMap = new Map<string, { committed: number; actual: number }>();
  for (const c of wbsCosts) {
    if (!c.wbsId) continue;
    const cur = wbsCostMap.get(c.wbsId) ?? { committed: 0, actual: 0 };
    if (c.type === "commitment") cur.committed += num(c.total);
    if (c.type === "actual") cur.actual += num(c.total);
    wbsCostMap.set(c.wbsId, cur);
  }

  const blockedCount = tasks.filter((tk) => tk.isBlocked).length;

  return (
    <div>
      <PageHeader
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
            <ProjectStatusControl projectId={project.id} status={project.status} />
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
        <StatCard label="Budget" value={formatMoney(cost.budget, "AED", { compact: true })} />
        <StatCard label="Committed" value={formatMoney(cost.committed, "AED", { compact: true })} tone="info" />
        <StatCard label="Actual" value={formatMoney(cost.actual, "AED", { compact: true })} />
        <StatCard
          label="Forecast"
          value={formatMoney(cost.forecast, "AED", { compact: true })}
          tone={cost.variance > cost.budget * 0.03 ? "warning" : "good"}
          sub={`${cost.variance >= 0 ? "+" : ""}${formatMoney(cost.variance, "AED", { compact: true })} vs budget`}
        />
        <StatCard label="Progress" value={`${Math.round(num(project.progress))}%`} tone="info" />
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="budget">Budget / WBS</TabsTrigger>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
          <TabsTrigger value="changes">Change Orders</TabsTrigger>
        </TabsList>

        {/* ─── Schedule ─── */}
        <TabsContent value="schedule" className="space-y-4">
          <SectionCard
            title="Tasks"
            actions={
              canSchedule ? (
                <AddTaskDialog projectId={project.id} wbsOptions={wbsOptions} memberOptions={memberOptions} />
              ) : null
            }
            noPadding
          >
            {tasks.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No tasks yet" description="Break the project into tasks to track progress." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Task</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium w-36">Progress</th>
                      <th className="px-4 py-2.5 font-medium">Due</th>
                      <th className="px-4 py-2.5 font-medium">Assignee</th>
                      {canSchedule && <th className="px-4 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((tk) => {
                      const d = daysUntil(tk.dueDate);
                      const overdue = d !== null && d < 0 && tk.status !== "done";
                      return (
                        <tr key={tk.id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-2.5">
                            <span className="font-medium">{tk.name}</span>
                            {tk.wbsId && wbsById.get(tk.wbsId) && (
                              <span className="block text-xs text-muted-foreground">
                                {wbsById.get(tk.wbsId)!.code} {wbsById.get(tk.wbsId)!.name}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusPill status={tk.status} tones={TASK_STATUS_TONE} />
                          </td>
                          <td className="px-4 py-2.5">
                            <ProgressMeter value={num(tk.progress)} tone={tk.isBlocked ? "critical" : "info"} />
                          </td>
                          <td className={`px-4 py-2.5 ${overdue ? "text-critical" : ""}`}>
                            {formatDate(tk.dueDate)}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{tk.assigneeName ?? "—"}</td>
                          {canSchedule && (
                            <td className="px-4 py-2.5 text-right">
                              <UpdateTaskDialog task={tk} projectId={project.id} />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
                {milestones.map((ms) => (
                  <div key={ms.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{ms.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {formatDate(ms.dueDate)} · {formatMoney(ms.billingAmount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        tone={
                          ms.status === "reached" || ms.status === "invoiced"
                            ? "good"
                            : ms.status === "missed"
                              ? "critical"
                              : "neutral"
                        }
                      >
                        {ms.status}
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
                    </div>
                  </div>
                ))}
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
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Code</th>
                    <th className="px-4 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 text-right font-medium">Budget</th>
                    <th className="px-4 py-2.5 text-right font-medium">Committed</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actual</th>
                    <th className="px-4 py-2.5 text-right font-medium">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {wbs.map((w) => {
                    const c = wbsCostMap.get(w.id) ?? { committed: 0, actual: 0 };
                    const remaining = num(w.budget) - c.committed - c.actual;
                    return (
                      <tr key={w.id} className="border-b last:border-0">
                        <td className="px-4 py-2.5 font-medium">{w.code}</td>
                        <td className="px-4 py-2.5">{w.name}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(w.budget)}</td>
                        <td className="px-4 py-2.5 text-right tabular text-info">{formatMoney(c.committed)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(c.actual)}</td>
                        <td className={`px-4 py-2.5 text-right tabular ${remaining < 0 ? "text-critical" : "text-muted-foreground"}`}>
                          {formatMoney(remaining)}
                        </td>
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
                  return (
                    <div key={r.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{r.itemName}</p>
                          <p className="text-xs text-muted-foreground">
                            {num(r.quantity)} {r.unit} · needed {formatDate(r.neededBy)}
                          </p>
                        </div>
                        <StatusPill status={r.status} tones={REQUIREMENT_STATUS_TONE} />
                      </div>
                      {cov && (
                        <div className="mt-2 space-y-1">
                          <CoverageBar required={cov.required} allocated={cov.allocated} inbound={cov.inbound} />
                          <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                            <span>Allocated {cov.allocated}</span>
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
                    <tr className="border-b text-left text-xs text-muted-foreground">
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
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(co.costImpact)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(co.revenueImpact)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{co.scheduleImpactDays}</td>
                        <td className="px-4 py-2.5">
                          <StatusPill status={co.status} tones={CHANGE_ORDER_STATUS_TONE} />
                        </td>
                        {canCO && (
                          <td className="px-4 py-2.5 text-right">
                            {co.status === "draft" && (
                              <ActionButton
                                action={submitChangeOrder}
                                fields={{ changeOrderId: co.id, projectId: project.id }}
                                variant="outline"
                                size="xs"
                              >
                                Submit
                              </ActionButton>
                            )}
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
      </Tabs>
    </div>
  );
}
