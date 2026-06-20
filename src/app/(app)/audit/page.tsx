import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ScrollText, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import { can, type Capability } from "@/lib/rbac";
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
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 100;

/** Deep-link an audit row to the record it describes, where one exists. */
const ENTITY_ROUTE: Record<string, (id: string) => string> = {
  purchase_order: (id) => `/orders/${id}`,
  subcontract: (id) => `/orders/${id}`,
  invoice: (id) => `/billing/${id}`,
  project: (id) => `/projects/${id}`,
  rfq: (id) => `/rfqs/${id}`,
  vendor: (id) => `/vendors/${id}`,
  goods_receipt: (id) => `/receipts/${id}`,
};

/** Capability the target page requires — so we don't link an auditor (e.g.
 *  finance) to a record that would just bounce them to /forbidden. */
const ENTITY_CAP: Record<string, Capability> = {
  purchase_order: "procurement.view",
  subcontract: "procurement.view",
  invoice: "billing.manage",
  project: "projects.view",
  rfq: "procurement.manage",
  vendor: "vendors.manage",
  goods_receipt: "inventory.manage",
};

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
  searchParams: Promise<{ risk?: string; page?: string }>;
}) {
  const user = await requireCapability("audit.view");
  const params = await searchParams;
  const active = isRisk(params.risk) ? params.risk : "all";
  const page = Math.max(0, parseInt(params.page ?? "0", 10) || 0);

  const data = await db(async (tx) => {
    const events = await tx
      .select({
        id: t.auditEvents.id,
        createdAt: t.auditEvents.createdAt,
        actorName: t.auditEvents.actorName,
        action: t.auditEvents.action,
        summary: t.auditEvents.summary,
        risk: t.auditEvents.risk,
        entityType: t.auditEvents.entityType,
        entityId: t.auditEvents.entityId,
        projectId: t.auditEvents.projectId,
        projectName: t.projects.name,
        projectCode: t.projects.code,
      })
      .from(t.auditEvents)
      .leftJoin(t.projects, eq(t.auditEvents.projectId, t.projects.id))
      .where(isRisk(active) ? eq(t.auditEvents.risk, active) : undefined)
      .orderBy(desc(t.auditEvents.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset(page * PAGE_SIZE);

    return { events };
  });

  const hasMore = data.events.length > PAGE_SIZE;
  const events = data.events.slice(0, PAGE_SIZE);
  const criticalCount = events.filter((e) => e.risk === "critical").length;
  const warningCount = events.filter((e) => e.risk === "warning").length;

  const hrefFor = (value: string) =>
    value === "all" ? "/audit" : `/audit?risk=${value}`;
  const pageHref = (p: number) => {
    const q = new URLSearchParams();
    if (active !== "all") q.set("risk", active);
    if (p > 0) q.set("page", String(p));
    const s = q.toString();
    return s ? `/audit?${s}` : "/audit";
  };
  const exportHref = active === "all" ? "/audit/export" : `/audit/export?risk=${active}`;
  const entityHref = (entityType: string | null, entityId: string | null) => {
    if (!entityType || !entityId) return null;
    const cap = ENTITY_CAP[entityType];
    if (cap && !can(user.role, cap)) return null; // would dead-end at /forbidden
    return ENTITY_ROUTE[entityType]?.(entityId) ?? null;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Audit trail"
        title="Audit Trail"
        description="Every consequential action across the company — actor, what changed and its risk."
        actions={
          <Button variant="outline" size="sm" render={<Link href={exportHref} target="_blank" />}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Events shown"
          value={events.length}
          sub={
            isRisk(active)
              ? `${RISK_FILTERS.find((f) => f.value === active)?.label} only · page ${page + 1}`
              : `page ${page + 1}`
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
        {events.length === 0 ? (
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
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium w-44">Time</th>
                  <th className="px-4 py-2.5 font-medium">Actor</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Summary</th>
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const href = entityHref(e.entityType, e.entityId);
                  return (
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
                    <td className="px-4 py-2.5 text-foreground">
                      {href ? (
                        <Link href={href} className="hover:underline">
                          {e.summary}
                        </Link>
                      ) : (
                        e.summary
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={SEVERITY_TONE[e.risk]}>
                        {RISK_FILTERS.find((f) => f.value === e.risk)?.label ?? e.risk}
                      </StatusBadge>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {(page > 0 || hasMore) && (
        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            render={page === 0 ? <span /> : <Link href={pageHref(page - 1)} />}
          >
            <ChevronLeft className="size-4" /> Newer
          </Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore}
            render={!hasMore ? <span /> : <Link href={pageHref(page + 1)} />}
          >
            Older <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
