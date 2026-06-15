import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { Calculator, ArrowLeft } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { num, formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { getProjectCost } from "@/lib/queries";
import { titleCase, PROJECT_STATUS_TONE, type BadgeTone } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge, StatusPill } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { PostCostDialog } from "../dialogs";
import { reverseCostPosting } from "../actions";

const COST_TYPE_TONE: Record<string, BadgeTone> = {
  budget: "neutral",
  commitment: "info",
  actual: "warning",
};

const SOURCE_LABEL: Record<string, string> = {
  purchase_order: "Purchase order",
  goods_receipt: "Goods receipt",
  change_order: "Change order",
  manual: "Manual",
};

export default async function JobCostingDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireCapability("costing.view");

  const result = await db(async (tx) => {
    const [project] = await tx
      .select()
      .from(t.projects)
      .where(eq(t.projects.id, projectId))
      .limit(1);
    if (!project) return null;

    const wbs = await tx
      .select()
      .from(t.wbsCodes)
      .where(eq(t.wbsCodes.projectId, projectId))
      .orderBy(asc(t.wbsCodes.sortOrder), asc(t.wbsCodes.code));

    const postings = await tx
      .select({
        id: t.costPostings.id,
        wbsId: t.costPostings.wbsId,
        type: t.costPostings.type,
        amount: t.costPostings.amount,
        sourceType: t.costPostings.sourceType,
        description: t.costPostings.description,
        createdAt: t.costPostings.createdAt,
        postedByName: t.users.fullName,
      })
      .from(t.costPostings)
      .leftJoin(t.users, eq(t.users.id, t.costPostings.postedBy))
      .where(eq(t.costPostings.projectId, projectId))
      .orderBy(desc(t.costPostings.createdAt));

    const cost = await getProjectCost(tx, projectId);

    return { project, wbs, postings, cost };
  });

  if (!result) notFound();
  const { project, wbs, postings, cost } = result;

  const canPost = can(user.role, "billing.manage");
  const contractValue = num(project.contractValue);
  const margin = contractValue - cost.forecast;

  const wbsById = new Map(wbs.map((w) => [w.id, w]));
  const wbsOptions = wbs.map((w) => ({ id: w.id, label: `${w.code} — ${w.name}` }));

  // Group postings by wbsId for the per-WBS roll-up.
  const wbsCostMap = new Map<string, { committed: number; actual: number; budget: number }>();
  let unassignedCommitted = 0;
  let unassignedActual = 0;
  let unassignedBudget = 0;
  for (const p of postings) {
    const amt = num(p.amount);
    if (!p.wbsId) {
      if (p.type === "commitment") unassignedCommitted += amt;
      if (p.type === "actual") unassignedActual += amt;
      if (p.type === "budget") unassignedBudget += amt;
      continue;
    }
    const cur = wbsCostMap.get(p.wbsId) ?? { committed: 0, actual: 0, budget: 0 };
    if (p.type === "commitment") cur.committed += amt;
    if (p.type === "actual") cur.actual += amt;
    if (p.type === "budget") cur.budget += amt;
    wbsCostMap.set(p.wbsId, cur);
  }
  const hasUnassigned =
    unassignedCommitted !== 0 || unassignedActual !== 0 || unassignedBudget !== 0;

  return (
    <div>
      <div className="mb-4">
        <Button render={<Link href="/costing" />} variant="ghost" size="xs">
          <ArrowLeft className="size-3.5" /> Back to portfolio
        </Button>
      </div>

      <PageHeader
        eyebrow="Job ledger"
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{project.code}</span>
            {project.clientName && <span>{project.clientName}</span>}
            <span>Contract {formatMoney(contractValue)}</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={project.status} tones={PROJECT_STATUS_TONE} />
            {canPost && <PostCostDialog projectId={project.id} wbsOptions={wbsOptions} />}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Budget" value={formatMoney(cost.budget, "AED", { compact: true })} />
        <StatCard
          label="Committed"
          value={formatMoney(cost.committed, "AED", { compact: true })}
          tone="info"
        />
        <StatCard label="Actual" value={formatMoney(cost.actual, "AED", { compact: true })} />
        <StatCard
          label="Incurred"
          value={formatMoney(cost.incurred, "AED", { compact: true })}
          sub="actual + on order"
        />
        <StatCard
          label="Forecast"
          value={formatMoney(cost.forecast, "AED", { compact: true })}
          tone={cost.variance > cost.budget * 0.03 ? "warning" : "good"}
          sub={
            cost.variance > 0
              ? `+${formatMoney(cost.variance, "AED", { compact: true })} over budget`
              : "on budget"
          }
        />
        <StatCard
          label="Margin"
          value={formatMoney(margin, "AED", { compact: true })}
          tone={margin < 0 ? "critical" : "good"}
          sub="contract − forecast"
        />
      </div>

      <div className="space-y-4">
        <SectionCard title="Cost by work breakdown" noPadding>
          {wbs.length === 0 && !hasUnassigned ? (
            <div className="p-6">
              <EmptyState
                icon={<Calculator className="size-5" />}
                title="No cost codes"
                description="This project has no WBS / cost codes yet."
              />
            </div>
          ) : (
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
                  </tr>
                </thead>
                <tbody>
                  {wbs.map((w) => {
                    const c = wbsCostMap.get(w.id) ?? { committed: 0, actual: 0, budget: 0 };
                    const budget = num(w.budget) + c.budget;
                    const remaining = budget - c.committed - c.actual;
                    return (
                      <tr key={w.id} className="border-b last:border-0">
                        <td className="px-4 py-2.5 font-medium">{w.code}</td>
                        <td className="px-4 py-2.5">{w.name}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(budget)}</td>
                        <td className="px-4 py-2.5 text-right tabular text-info">{formatMoney(c.committed)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(c.actual)}</td>
                        <td
                          className={`px-4 py-2.5 text-right tabular ${remaining < 0 ? "text-critical" : "text-muted-foreground"}`}
                        >
                          {formatMoney(remaining)}
                        </td>
                      </tr>
                    );
                  })}
                  {hasUnassigned && (() => {
                    const remaining = unassignedBudget - unassignedCommitted - unassignedActual;
                    return (
                      <tr className="border-b last:border-0 text-muted-foreground">
                        <td className="px-4 py-2.5 font-medium">—</td>
                        <td className="px-4 py-2.5 italic">Unassigned / project level</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(unassignedBudget)}</td>
                        <td className="px-4 py-2.5 text-right tabular text-info">{formatMoney(unassignedCommitted)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(unassignedActual)}</td>
                        <td className={`px-4 py-2.5 text-right tabular ${remaining < 0 ? "text-critical" : ""}`}>
                          {formatMoney(remaining)}
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Cost ledger"
          description="Every commitment, actual and budget movement posted to this job."
          noPadding
        >
          {postings.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No cost postings"
                description="Costs appear here as purchase orders are released and deliveries are received."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 font-medium">Cost code</th>
                    <th className="px-4 py-2.5 font-medium">Source</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    {canPost && <th className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {postings.map((p) => {
                    const w = p.wbsId ? wbsById.get(p.wbsId) : null;
                    const amt = num(p.amount);
                    const canReverse =
                      p.sourceType === "manual" &&
                      !(p.description ?? "").startsWith("Reversal of");
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          {formatDate(p.createdAt)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge tone={COST_TYPE_TONE[p.type] ?? "neutral"}>
                            {titleCase(p.type)}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-2.5">
                          {p.description ?? "—"}
                          {p.postedByName && (
                            <span className="block text-xs text-muted-foreground">
                              by {p.postedByName}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {w ? `${w.code} ${w.name}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {p.sourceType ? (SOURCE_LABEL[p.sourceType] ?? titleCase(p.sourceType)) : "—"}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right tabular ${amt < 0 ? "text-good" : ""}`}
                        >
                          {amt < 0 ? "" : "+"}
                          {formatMoney(amt)}
                        </td>
                        {canPost && (
                          <td className="px-4 py-2.5 text-right">
                            {canReverse && (
                              <ActionButton
                                action={reverseCostPosting}
                                fields={{ postingId: p.id, projectId: project.id }}
                                confirm="Reverse this manual posting? An offsetting entry will be added."
                                variant="ghost"
                                size="xs"
                              >
                                Reverse
                              </ActionButton>
                            )}
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
      </div>
    </div>
  );
}
