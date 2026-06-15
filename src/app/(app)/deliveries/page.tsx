import Link from "next/link";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { Truck, PackageCheck } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { num, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { daysUntil } from "@/lib/severity";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusPill } from "@/components/app/status-badge";
import { ProgressMeter } from "@/components/app/meters";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { PO_STATUS_TONE } from "@/lib/constants";

const OPEN_STATUSES = ["released", "partially_received"] as const;

export default async function DeliveriesPage() {
  await requireCapability("inventory.manage");

  const data = await db(async (tx) => {
    const pos = await tx
      .select({
        id: t.purchaseOrders.id,
        number: t.purchaseOrders.number,
        status: t.purchaseOrders.status,
        expectedDate: t.purchaseOrders.expectedDate,
        type: t.purchaseOrders.type,
        vendorName: t.vendors.name,
        projectName: t.projects.name,
        projectCode: t.projects.code,
      })
      .from(t.purchaseOrders)
      .leftJoin(t.vendors, eq(t.vendors.id, t.purchaseOrders.vendorId))
      .leftJoin(t.projects, eq(t.projects.id, t.purchaseOrders.projectId))
      .where(inArray(t.purchaseOrders.status, [...OPEN_STATUSES]))
      .orderBy(asc(t.purchaseOrders.expectedDate));

    const ids = pos.map((p) => p.id);
    const lineAgg = ids.length
      ? await tx
          .select({
            poId: t.purchaseOrderLines.poId,
            ordered: sql<string>`coalesce(sum(${t.purchaseOrderLines.quantity}),0)`,
            received: sql<string>`coalesce(sum(${t.purchaseOrderLines.receivedQty}),0)`,
          })
          .from(t.purchaseOrderLines)
          .where(inArray(t.purchaseOrderLines.poId, ids))
          .groupBy(t.purchaseOrderLines.poId)
      : [];

    return { pos, lineAgg };
  });

  const aggMap = new Map(
    data.lineAgg.map((a) => [a.poId, { ordered: num(a.ordered), received: num(a.received) }]),
  );

  const rows = data.pos.map((po) => {
    const agg = aggMap.get(po.id) ?? { ordered: 0, received: 0 };
    const pct = agg.ordered > 0 ? (agg.received / agg.ordered) * 100 : 0;
    const d = daysUntil(po.expectedDate);
    const overdue = d !== null && d < 0;
    return { po, ordered: agg.ordered, received: agg.received, pct, days: d, overdue };
  });

  const overdueCount = rows.filter((r) => r.overdue).length;
  const dueSoon = rows.filter((r) => r.days !== null && r.days >= 0 && r.days <= 3).length;
  const partial = rows.filter((r) => r.po.status === "partially_received").length;

  return (
    <div>
      <PageHeader
        title="Expected deliveries"
        description="Released orders awaiting goods receipt. Receive to book stock and recognise cost."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open orders" value={rows.length} />
        <StatCard label="Overdue" value={overdueCount} tone={overdueCount ? "critical" : "good"} />
        <StatCard label="Due within 3 days" value={dueSoon} tone={dueSoon ? "warning" : "good"} />
        <StatCard label="Partially received" value={partial} tone={partial ? "info" : "neutral"} />
      </div>

      <SectionCard noPadding>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Truck className="size-5" />}
              title="No deliveries expected"
              description="Released purchase orders appear here until they're fully received."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Vendor</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Expected</th>
                  <th className="px-4 py-2.5 font-medium w-40">Received</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ po, ordered, received, pct, days, overdue }) => (
                  <tr key={po.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{po.number}</span>
                      {po.type === "subcontract" && (
                        <span className="block text-xs text-muted-foreground">subcontract</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{po.vendorName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{po.projectCode ?? "—"}</td>
                    <td className={`px-4 py-2.5 ${overdue ? "text-critical font-medium" : ""}`}>
                      {formatDate(po.expectedDate)}
                      {days !== null && (
                        <span className="block text-xs text-muted-foreground">
                          {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? "today" : `in ${days}d`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <ProgressMeter value={pct} tone={overdue ? "critical" : "info"} />
                      <span className="mt-0.5 block text-xs tabular text-muted-foreground">
                        {formatNumber(received, 3)} / {formatNumber(ordered, 3)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={po.status} tones={PO_STATUS_TONE} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="xs"
                        variant="outline"
                        render={<Link href={`/receipts/new?poId=${po.id}`} />}
                      >
                        <PackageCheck className="size-3.5" /> Receive
                      </Button>
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
