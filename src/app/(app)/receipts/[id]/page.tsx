import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Building2, Warehouse, FileText } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { num, formatMoney, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { BadgeTone } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionButton } from "@/components/app/action-button";
import { reverseGoodsReceipt } from "@/app/(app)/inventory/actions";

const GRN_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  posted: "good",
  rejected: "critical",
  reversed: "warning",
};

const CONDITION_TONE: Record<string, BadgeTone> = {
  good: "good",
  partial: "warning",
  damaged: "critical",
  rejected: "critical",
};

export default async function GrnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCapability("inventory.manage");
  const currency = user.currencyCode;
  const canSeeCost = can(user.role, "costing.view");

  const result = await db(async (tx) => {
    const [grn] = await tx
      .select({
        id: t.goodsReceipts.id,
        number: t.goodsReceipts.number,
        status: t.goodsReceipts.status,
        receivedDate: t.goodsReceipts.receivedDate,
        deliveryNoteNumber: t.goodsReceipts.deliveryNoteNumber,
        notes: t.goodsReceipts.notes,
        poId: t.goodsReceipts.poId,
        poNumber: t.purchaseOrders.number,
        vendorName: t.vendors.name,
        warehouseName: t.warehouses.name,
        receiverName: t.users.fullName,
      })
      .from(t.goodsReceipts)
      .leftJoin(t.purchaseOrders, eq(t.purchaseOrders.id, t.goodsReceipts.poId))
      .leftJoin(t.vendors, eq(t.vendors.id, t.goodsReceipts.vendorId))
      .leftJoin(t.warehouses, eq(t.warehouses.id, t.goodsReceipts.warehouseId))
      .leftJoin(t.users, eq(t.users.id, t.goodsReceipts.receivedBy))
      .where(eq(t.goodsReceipts.id, id))
      .limit(1);
    if (!grn) return null;

    const lines = await tx
      .select()
      .from(t.goodsReceiptLines)
      .where(eq(t.goodsReceiptLines.grnId, id))
      .orderBy(asc(t.goodsReceiptLines.itemName));

    return { grn, lines };
  });

  if (!result) notFound();
  const { grn, lines } = result;
  const canReverse = can(user.role, "inventory.manage");

  const totalAccepted = lines.reduce((s, l) => s + num(l.acceptedQty), 0);
  const totalRejected = lines.reduce((s, l) => s + num(l.rejectedQty), 0);
  const totalValue = lines.reduce((s, l) => s + num(l.acceptedQty) * num(l.unitCost), 0);

  return (
    <div>
      <PageHeader
        backHref="/receipts"
        backLabel="All receipts"
        eyebrow="Goods receipt"
        title={grn.number}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {grn.poId && grn.poNumber && (
              <Link href={`/orders/${grn.poId}`} className="hover:underline">
                {grn.poNumber}
              </Link>
            )}
            {grn.vendorName && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="size-3.5" /> {grn.vendorName}
              </span>
            )}
            {grn.warehouseName && (
              <span className="inline-flex items-center gap-1">
                <Warehouse className="size-3.5" /> {grn.warehouseName}
              </span>
            )}
            <span>Received {formatDate(grn.receivedDate)}</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone={GRN_TONE[grn.status] ?? "neutral"}>{grn.status}</StatusBadge>
            {canReverse && grn.status === "posted" && (
              <ActionButton
                action={reverseGoodsReceipt}
                fields={{ grnId: grn.id }}
                variant="outline"
                size="sm"
                confirm="Reverse this goods receipt? Stock will be pulled back out, the actual cost removed and the commitment reinstated. This only works while the received goods are still on hand."
              >
                Reverse
              </ActionButton>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Lines" value={lines.length} />
        <StatCard label="Accepted" value={formatNumber(totalAccepted, 3)} tone="good" sub="units booked" />
        <StatCard
          label="Rejected"
          value={formatNumber(totalRejected, 3)}
          tone={totalRejected > 0 ? "critical" : "neutral"}
          sub={totalRejected > 0 ? "units refused" : "none"}
        />
        {canSeeCost ? (
          <StatCard label="Received value" value={formatMoney(totalValue, currency, { compact: true })} />
        ) : (
          <StatCard label="Delivery note" value={grn.deliveryNoteNumber ?? "—"} />
        )}
      </div>

      <SectionCard title="Received lines" noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 text-right font-medium">Ordered</th>
                <th className="px-4 py-2.5 text-right font-medium">Accepted</th>
                <th className="px-4 py-2.5 text-right font-medium">Rejected</th>
                <th className="px-4 py-2.5 font-medium">Condition</th>
                {canSeeCost && <th className="px-4 py-2.5 text-right font-medium">Unit cost</th>}
                {canSeeCost && <th className="px-4 py-2.5 text-right font-medium">Line value</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium">{l.itemName}</td>
                  <td className="px-4 py-2.5 text-right tabular text-muted-foreground">
                    {formatNumber(l.orderedQty, 3)} {l.unit}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{formatNumber(l.acceptedQty, 3)}</td>
                  <td className={`px-4 py-2.5 text-right tabular ${num(l.rejectedQty) > 0 ? "text-critical" : "text-muted-foreground"}`}>
                    {formatNumber(l.rejectedQty, 3)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={CONDITION_TONE[l.condition] ?? "neutral"}>{l.condition}</StatusBadge>
                  </td>
                  {canSeeCost && <td className="px-4 py-2.5 text-right tabular">{formatMoney(l.unitCost, currency)}</td>}
                  {canSeeCost && (
                    <td className="px-4 py-2.5 text-right tabular">
                      {formatMoney(num(l.acceptedQty) * num(l.unitCost), currency)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {grn.notes && (
        <SectionCard title="Notes" className="mt-4">
          <p className="flex items-start gap-2 whitespace-pre-wrap text-sm text-muted-foreground">
            <FileText className="mt-0.5 size-4 shrink-0" /> {grn.notes}
          </p>
        </SectionCard>
      )}
    </div>
  );
}
