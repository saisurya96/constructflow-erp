import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ScrollText } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import type { Severity } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { SEVERITY_TONE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";

const RISK_VALUES: Severity[] = ["critical", "warning", "good", "neutral"];

const RISK_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "good", label: "Good" },
  { value: "neutral", label: "Routine" },
];

function isRisk(v: string | undefined): v is Severity {
  return !!v && (RISK_VALUES as string[]).includes(v);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ risk?: string }>;
}) {
  await requireCapability("audit.view");
  const params = await searchParams;
  const active = isRisk(params.risk) ? params.risk : "all";

  const data = await db(async (tx) => {
    const events = await tx
      .select({
        id: t.auditEvents.id,
        createdAt: t.auditEvents.createdAt,
        actorName: t.auditEvents.actorName,
        action: t.auditEvents.action,
        summary: t.auditEvents.summary,
        risk: t.auditEvents.risk,
        projectId: t.auditEvents.projectId,
        projectName: t.projects.name,
        projectCode: t.projects.code,
      })
      .from(t.auditEvents)
      .leftJoin(t.projects, eq(t.auditEvents.projectId, t.projects.id))
      .where(isRisk(active) ? eq(t.auditEvents.risk, active) : undefined)
      .orderBy(desc(t.auditEvents.createdAt))
      .limit(200);

    return { events };
  });

  const criticalCount = data.events.filter((e) => e.risk === "critical").length;
  const warningCount = data.events.filter((e) => e.risk === "warning").length;

  const hrefFor = (value: string) =>
    value === "all" ? "/audit" : `/audit?risk=${value}`;

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        description="Every consequential action across the company — actor, what changed and its risk."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Events shown"
          value={data.events.length}
          sub={
            isRisk(active)
              ? `${RISK_FILTERS.find((f) => f.value === active)?.label} only · newest 200`
              : "newest 200"
          }
        />
        <StatCard
          label="Critical"
          value={criticalCount}
          tone={criticalCount > 0 ? "critical" : "neutral"}
          sub="high-risk actions"
        />
        <StatCard
          label="Warning"
          value={warningCount}
          tone={warningCount > 0 ? "warning" : "neutral"}
          sub="elevated-risk actions"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {RISK_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={hrefFor(f.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
              active === f.value
                ? "bg-foreground text-background ring-foreground"
                : "bg-card text-muted-foreground ring-border hover:bg-muted",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <SectionCard noPadding>
        {data.events.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<ScrollText className="size-5" />}
              title="No audit events"
              description={
                isRisk(active)
                  ? "No events match this risk level yet."
                  : "Actions across the company will be recorded here as work happens."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium w-44">Time</th>
                  <th className="px-4 py-2.5 font-medium">Actor</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Summary</th>
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-foreground">{e.actorName}</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {e.action}
                    </td>
                    <td className="px-4 py-2.5 text-foreground">{e.summary}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={SEVERITY_TONE[e.risk]}>{e.risk}</StatusBadge>
                    </td>
                    <td className="px-4 py-2.5">
                      {e.projectId && e.projectName ? (
                        <Link
                          href={`/projects/${e.projectId}`}
                          className="text-foreground hover:underline"
                        >
                          {e.projectName}
                          {e.projectCode ? (
                            <span className="block text-xs text-muted-foreground">
                              {e.projectCode}
                            </span>
                          ) : null}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
