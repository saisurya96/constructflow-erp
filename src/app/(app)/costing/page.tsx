import Link from "next/link";
import { desc } from "drizzle-orm";
import { Calculator } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { num, formatMoney } from "@/lib/money";
import { getProjectCost } from "@/lib/queries";
import { PROJECT_STATUS_TONE } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusPill } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";

function varianceTone(variance: number, budget: number): "good" | "warning" | "critical" {
  if (variance <= 0) return "good";
  if (budget > 0 && variance > budget * 0.1) return "critical";
  return "warning";
}

export default async function CostingPage() {
  const user = await requireCapability("costing.view");
  const currency = user.currencyCode;

  const rows = await db(async (tx) => {
    const projects = await tx
      .select()
      .from(t.projects)
      .orderBy(desc(t.projects.createdAt));
    return Promise.all(
      projects.map(async (p) => {
        const cost = await getProjectCost(tx, p.id);
        const contractValue = num(p.contractValue);
        return {
          project: p,
          cost,
          contractValue,
          margin: contractValue - cost.forecast,
        };
      }),
    );
  });

  const totals = rows.reduce(
    (s, r) => ({
      budget: s.budget + r.cost.budget,
      committed: s.committed + r.cost.committed,
      actual: s.actual + r.cost.actual,
      forecast: s.forecast + r.cost.forecast,
      margin: s.margin + r.margin,
    }),
    { budget: 0, committed: 0, actual: 0, forecast: 0, margin: 0 },
  );

  return (
    <div>
      <PageHeader
        eyebrow="Cost control"
        title="Job Costing"
        description="Budget vs committed vs actual across the portfolio — forecast, variance and margin per job."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Portfolio budget" value={formatMoney(totals.budget, currency, { compact: true })} />
        <StatCard
          label="Committed"
          value={formatMoney(totals.committed, currency, { compact: true })}
          tone="info"
        />
        <StatCard label="Actual" value={formatMoney(totals.actual, currency, { compact: true })} />
        <StatCard
          label="Forecast"
          value={formatMoney(totals.forecast, currency, { compact: true })}
          tone={totals.forecast > totals.budget * 1.03 ? "warning" : "good"}
          sub={
            totals.forecast - totals.budget > 0
              ? `+${formatMoney(totals.forecast - totals.budget, currency, { compact: true })} over budget`
              : "on budget"
          }
        />
        <StatCard
          label="Total margin"
          value={formatMoney(totals.margin, currency, { compact: true })}
          tone={totals.margin < 0 ? "critical" : "good"}
          sub="contract − forecast"
        />
      </div>

      <SectionCard noPadding>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Calculator className="size-5" />}
              title="No projects to cost"
              description="Create a project to begin tracking budget, commitments and actual cost."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Budget</th>
                  <th className="px-4 py-2.5 text-right font-medium">Committed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actual</th>
                  <th className="px-4 py-2.5 text-right font-medium">Forecast</th>
                  <th className="px-4 py-2.5 text-right font-medium">Variance</th>
                  <th className="px-4 py-2.5 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ project, cost, margin }) => {
                  const vTone = varianceTone(cost.variance, cost.budget);
                  return (
                    <tr key={project.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <Link href={`/costing/${project.id}`} className="block">
                          <span className="font-medium text-foreground hover:underline">
                            {project.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {project.code} · {project.clientName ?? "—"}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={project.status} tones={PROJECT_STATUS_TONE} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">{formatMoney(cost.budget, currency)}</td>
                      <td className="px-4 py-2.5 text-right tabular text-info">{formatMoney(cost.committed, currency)}</td>
                      <td className="px-4 py-2.5 text-right tabular">{formatMoney(cost.actual, currency)}</td>
                      <td className="px-4 py-2.5 text-right tabular">{formatMoney(cost.forecast, currency)}</td>
                      <td
                        className={`px-4 py-2.5 text-right tabular ${
                          vTone === "critical"
                            ? "text-critical"
                            : vTone === "warning"
                              ? "text-warning-foreground"
                              : "text-good"
                        }`}
                      >
                        {cost.variance > 0 ? "+" : ""}
                        {formatMoney(cost.variance, currency)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular ${margin < 0 ? "text-critical" : "text-good"}`}
                      >
                        {formatMoney(margin, currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
