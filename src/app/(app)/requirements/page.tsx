import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { ClipboardList, FileText } from "lucide-react";
import { requireUser, db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { num } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { REQUIREMENT_STATUS_TONE } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusPill } from "@/components/app/status-badge";
import { CoverageBar } from "@/components/app/meters";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { updateRequirementStatus } from "./actions";

const INBOUND = ["approved", "released", "partially_received"] as const;

export default async function RequirementsPage() {
  const user = await requireUser();
  if (!can(user.role, "requirements.raise") && !can(user.role, "requirements.source")) {
    redirect("/forbidden");
  }
  const isBuyer = can(user.role, "requirements.source");

  const data = await db(async (tx) => {
    const reqs = await tx
      .select({
        id: t.projectRequirements.id,
        itemName: t.projectRequirements.itemName,
        unit: t.projectRequirements.unit,
        quantity: t.projectRequirements.quantity,
        neededBy: t.projectRequirements.neededBy,
        status: t.projectRequirements.status,
        estimatedUnitCost: t.projectRequirements.estimatedUnitCost,
        projectId: t.projectRequirements.projectId,
        projectName: t.projects.name,
        projectCode: t.projects.code,
      })
      .from(t.projectRequirements)
      .innerJoin(t.projects, eq(t.projects.id, t.projectRequirements.projectId))
      .orderBy(desc(t.projectRequirements.createdAt));

    const allocs = await tx
      .select({
        reqId: t.inventoryAllocations.requirementId,
        q: sql<string>`coalesce(sum(${t.inventoryAllocations.quantity}),0)`,
      })
      .from(t.inventoryAllocations)
      .where(ne(t.inventoryAllocations.status, "cancelled"))
      .groupBy(t.inventoryAllocations.requirementId);

    const inbound = await tx
      .select({
        reqId: t.purchaseOrderLines.requirementId,
        q: sql<string>`coalesce(sum(${t.purchaseOrderLines.quantity} - ${t.purchaseOrderLines.receivedQty}),0)`,
      })
      .from(t.purchaseOrderLines)
      .innerJoin(t.purchaseOrders, eq(t.purchaseOrders.id, t.purchaseOrderLines.poId))
      .where(inArray(t.purchaseOrders.status, [...INBOUND]))
      .groupBy(t.purchaseOrderLines.requirementId);

    return { reqs, allocs, inbound };
  });

  const allocMap = new Map(data.allocs.map((a) => [a.reqId, num(a.q)]));
  const inboundMap = new Map(data.inbound.map((i) => [i.reqId, num(i.q)]));

  const rows = data.reqs.map((r) => {
    const required = num(r.quantity);
    const allocated = allocMap.get(r.id) ?? 0;
    const inbound = inboundMap.get(r.id) ?? 0;
    const shortage = Math.max(0, required - allocated - inbound);
    return { r, required, allocated, inbound, shortage };
  });

  const open = rows.filter((x) => !["fulfilled", "cancelled"].includes(x.r.status));
  const toSource = rows.filter((x) => x.r.status === "submitted");
  const shortages = open.filter((x) => x.shortage > 0);

  return (
    <div>
      <PageHeader
        title={isBuyer ? "Sourcing inbox" : "Requirements"}
        description={
          isBuyer
            ? "Material requirements awaiting sourcing — turn them into RFQs and orders."
            : "Track material needs and their coverage across projects."
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open requirements" value={open.length} />
        <StatCard label="Awaiting sourcing" value={toSource.length} tone={toSource.length ? "warning" : "good"} />
        <StatCard label="With shortage" value={shortages.length} tone={shortages.length ? "critical" : "good"} />
        <StatCard label="Total tracked" value={rows.length} />
      </div>

      <SectionCard noPadding>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<ClipboardList className="size-5" />}
              title="No requirements yet"
              description="Requirements raised on project tasks show up here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-4 py-2.5 font-medium w-32">Coverage</th>
                  <th className="px-4 py-2.5 font-medium">Needed</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  {isBuyer && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, required, allocated, inbound, shortage }) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{r.itemName}</span>
                      {shortage > 0 && (
                        <span className="block text-xs text-critical">
                          short {shortage} {r.unit}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/projects/${r.projectId}`} className="text-muted-foreground hover:underline">
                        {r.projectCode}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {required} {r.unit}
                    </td>
                    <td className="px-4 py-2.5">
                      <CoverageBar required={required} allocated={allocated} inbound={inbound} />
                    </td>
                    <td className="px-4 py-2.5">{formatDate(r.neededBy)}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={r.status} tones={REQUIREMENT_STATUS_TONE} />
                    </td>
                    {isBuyer && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {r.status === "submitted" && (
                          <ActionButton
                            action={updateRequirementStatus}
                            fields={{ requirementId: r.id, status: "sourcing" }}
                            variant="outline"
                            size="xs"
                          >
                            Start sourcing
                          </ActionButton>
                        )}
                        {(r.status === "submitted" || r.status === "sourcing") && (
                          <Button
                            size="xs"
                            variant="ghost"
                            className="ml-1"
                            render={<Link href={`/rfqs/new?requirementId=${r.id}`} />}
                          >
                            <FileText className="size-3.5" /> RFQ
                          </Button>
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
    </div>
  );
}
