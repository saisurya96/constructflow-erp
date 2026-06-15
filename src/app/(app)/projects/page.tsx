import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { FolderKanban } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { num, formatMoney } from "@/lib/money";
import { estimateAtCompletion } from "@/lib/queries";
import { projectHealth, daysUntil } from "@/lib/severity";
import { PROJECT_STATUS_TONE } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusPill } from "@/components/app/status-badge";
import { ProgressMeter } from "@/components/app/meters";
import { EmptyState } from "@/components/app/empty-state";
import { CreateProjectDialog } from "./dialogs";

export default async function ProjectsPage() {
  const user = await requireCapability("projects.view");

  const data = await db(async (tx) => {
    const projects = await tx
      .select()
      .from(t.projects)
      .orderBy(desc(t.projects.createdAt));
    const budgets = await tx
      .select({
        pid: t.wbsCodes.projectId,
        b: sql<string>`coalesce(sum(${t.wbsCodes.budget}),0)`,
      })
      .from(t.wbsCodes)
      .groupBy(t.wbsCodes.projectId);
    const costs = await tx
      .select({
        pid: t.costPostings.projectId,
        type: t.costPostings.type,
        total: sql<string>`coalesce(sum(${t.costPostings.amount}),0)`,
      })
      .from(t.costPostings)
      .groupBy(t.costPostings.projectId, t.costPostings.type);
    return { projects, budgets, costs };
  });

  const budgetByPid = new Map(data.budgets.map((b) => [b.pid, num(b.b)]));
  const costByPid = new Map<string, { committed: number; actual: number }>();
  for (const c of data.costs) {
    const cur = costByPid.get(c.pid) ?? { committed: 0, actual: 0 };
    if (c.type === "commitment") cur.committed += num(c.total);
    if (c.type === "actual") cur.actual += num(c.total);
    if (c.type === "budget")
      budgetByPid.set(c.pid, (budgetByPid.get(c.pid) ?? 0) + num(c.total));
    costByPid.set(c.pid, cur);
  }

  const rows = data.projects.map((p) => {
    const budget = budgetByPid.get(p.id) ?? num(p.budget);
    const cost = costByPid.get(p.id) ?? { committed: 0, actual: 0 };
    const forecast = estimateAtCompletion(budget, cost.actual + cost.committed);
    const variancePct = budget > 0 ? ((forecast - budget) / budget) * 100 : 0;
    const health = projectHealth({
      progress: num(p.progress),
      costVariancePct: variancePct,
      daysToDeadline: daysUntil(p.endDate),
      openCriticalActions: 0,
    });
    return { p, budget, forecast, variance: forecast - budget, health };
  });

  const totalContract = data.projects.reduce((s, p) => s + num(p.contractValue), 0);
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalForecast = rows.reduce((s, r) => s + r.forecast, 0);
  const activeCount = data.projects.filter((p) => p.status === "active").length;

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio"
        title="Projects"
        description="Portfolio health — budget, forecast and progress across every job."
        actions={can(user.role, "projects.manage") ? <CreateProjectDialog /> : null}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active projects" value={activeCount} sub={`${data.projects.length} total`} />
        <StatCard label="Contract value" value={formatMoney(totalContract, "AED", { compact: true })} />
        <StatCard label="Budget" value={formatMoney(totalBudget, "AED", { compact: true })} />
        <StatCard
          label="Forecast vs budget"
          value={formatMoney(totalForecast - totalBudget, "AED", { compact: true })}
          tone={totalForecast > totalBudget * 1.03 ? "warning" : "good"}
          sub={totalForecast > totalBudget ? "over budget" : "within budget"}
        />
      </div>

      <SectionCard noPadding>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<FolderKanban className="size-5" />}
              title="No projects yet"
              description="Create your first project to start planning and procurement."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium w-40">Progress</th>
                  <th className="px-4 py-2.5 text-right font-medium">Budget</th>
                  <th className="px-4 py-2.5 text-right font-medium">Forecast</th>
                  <th className="px-4 py-2.5 text-right font-medium">Variance</th>
                  <th className="px-4 py-2.5 font-medium">Health</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, budget, forecast, variance, health }) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/projects/${p.id}`} className="block">
                        <span className="font-medium text-foreground hover:underline">
                          {p.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {p.code} · {p.clientName ?? "—"}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={p.status} tones={PROJECT_STATUS_TONE} />
                    </td>
                    <td className="px-4 py-2.5">
                      <ProgressMeter value={num(p.progress)} tone="info" />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{formatMoney(budget)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{formatMoney(forecast)}</td>
                    <td
                      className={`px-4 py-2.5 text-right tabular ${variance > 0 ? "text-critical" : "text-good"}`}
                    >
                      {variance > 0 ? "+" : ""}
                      {formatMoney(variance)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={`size-2.5 rounded-[2px] ${
                            health === "critical"
                              ? "bg-critical"
                              : health === "warning"
                                ? "bg-warning"
                                : "bg-good"
                          }`}
                        />
                        <span className="text-xs capitalize text-muted-foreground">{health}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
