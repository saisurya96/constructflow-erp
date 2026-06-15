import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Building2, CalendarClock, FolderKanban, Receipt } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { num, formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PO_STATUS_TONE } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge, StatusPill } from "@/components/app/status-badge";
import { ProgressMeter } from "@/components/app/meters";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/app/action-button";
import { submitPurchaseOrder, cancelPurchaseOrder } from "../actions";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCapability("procurement.manage");

  const result = await db(async (tx) => {
    const [po] = await tx
      .select({
        id: t.purchaseOrders.id,
        number: t.purchaseOrders.number,
        type: t.purchaseOrders.type,
        title: t.purchaseOrders.title,
        status: t.purchaseOrders.status,
        subtotal: t.purchaseOrders.subtotal,
        taxAmount: t.purchaseOrders.taxAmount,
        totalAmount: t.purchaseOrders.totalAmount,
        expectedDate: t.purchaseOrders.expectedDate,
        paymentTerms: t.purchaseOrders.paymentTerms,
        approvedAt: t.purchaseOrders.approvedAt,
        releasedAt: t.purchaseOrders.releasedAt,
        notes: t.purchaseOrders.notes,
        vendorId: t.purchaseOrders.vendorId,
        vendorName: t.vendors.name,
        vendorCategory: t.vendors.category,
        projectId: t.purchaseOrders.projectId,
        projectCode: t.projects.code,
        projectName: t.projects.name,
      })
      .from(t.purchaseOrders)
      .innerJoin(t.vendors, eq(t.vendors.id, t.purchaseOrders.vendorId))
      .leftJoin(t.projects, eq(t.projects.id, t.purchaseOrders.projectId))
      .where(eq(t.purchaseOrders.id, id))
      .limit(1);
    if (!po) return null;

    const lines = await tx
      .select({
        id: t.purchaseOrderLines.id,
        itemName: t.purchaseOrderLines.itemName,
        unit: t.purchaseOrderLines.unit,
        quantity: t.purchaseOrderLines.quantity,
        unitPrice: t.purchaseOrderLines.unitPrice,
        lineTotal: t.purchaseOrderLines.lineTotal,
        receivedQty: t.purchaseOrderLines.receivedQty,
        wbsCode: t.wbsCodes.code,
        wbsName: t.wbsCodes.name,
      })
      .from(t.purchaseOrderLines)
      .leftJoin(t.wbsCodes, eq(t.wbsCodes.id, t.purchaseOrderLines.wbsId))
      .where(eq(t.purchaseOrderLines.poId, id))
      .orderBy(asc(t.purchaseOrderLines.sortOrder));

    return { po, lines };
  });

  if (!result) notFound();
  const { po, lines } = result;
  const canManage = can(user.role, "procurement.manage");
  const isSub = po.type === "subcontract";

  const orderedQty = lines.reduce((s, l) => s + num(l.quantity), 0);
  const receivedTotal = lines.reduce((s, l) => s + num(l.receivedQty), 0);
  const receivedPct = orderedQty > 0 ? (receivedTotal / orderedQty) * 100 : 0;

  const isReceiving = ["released", "partially_received", "received"].includes(po.status);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {po.number}
            <StatusBadge tone={isSub ? "warning" : "info"}>
              {isSub ? "Subcontract" : "PO"}
            </StatusBadge>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{po.title}</span>
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3.5" /> {po.vendorName}
              {po.vendorCategory ? ` · ${po.vendorCategory}` : ""}
            </span>
            {po.projectId && (
              <span className="inline-flex items-center gap-1">
                <FolderKanban className="size-3.5" />
                <Link href={`/projects/${po.projectId}`} className="hover:underline">
                  {po.projectCode} — {po.projectName}
                </Link>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" /> Expected {formatDate(po.expectedDate)}
            </span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {po.status === "pending_approval" ? (
              <StatusBadge tone="warning">Awaiting approval</StatusBadge>
            ) : (
              <StatusPill status={po.status} tones={PO_STATUS_TONE} />
            )}
            {canManage && po.status === "draft" && (
              <>
                <ActionButton action={submitPurchaseOrder} fields={{ poId: po.id }} size="sm">
                  Submit
                </ActionButton>
                <ActionButton
                  action={cancelPurchaseOrder}
                  fields={{ poId: po.id }}
                  variant="outline"
                  size="sm"
                  confirm="Cancel this order?"
                >
                  Cancel
                </ActionButton>
              </>
            )}
            {canManage &&
              ["pending_approval", "approved", "released", "partially_received"].includes(
                po.status,
              ) && (
                <ActionButton
                  action={cancelPurchaseOrder}
                  fields={{ poId: po.id }}
                  variant="outline"
                  size="sm"
                  confirm="Cancel this order? Any released commitment will need manual review."
                >
                  Cancel
                </ActionButton>
              )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Subtotal" value={formatMoney(po.subtotal, "AED", { compact: true })} />
        <StatCard label="VAT" value={formatMoney(po.taxAmount, "AED", { compact: true })} />
        <StatCard
          label="Total"
          value={formatMoney(po.totalAmount, "AED", { compact: true })}
          tone="info"
        />
        <StatCard
          label="Received"
          value={`${Math.round(receivedPct)}%`}
          tone={receivedPct >= 100 ? "good" : isReceiving ? "warning" : "neutral"}
          sub={
            po.paymentTerms ? `Terms: ${po.paymentTerms}` : isReceiving ? "awaiting delivery" : undefined
          }
        />
      </div>

      <SectionCard
        title="Line items"
        description={
          isReceiving
            ? "Receiving progress per line — goods receipts post actual cost and relieve commitment."
            : "Quantities and pricing on this order."
        }
        noPadding
      >
        {lines.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No line items" description="This order has no line items." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unit price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Line total</th>
                  <th className="px-4 py-2.5 font-medium w-44">Received</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const q = num(l.quantity);
                  const recv = num(l.receivedQty);
                  const pct = q > 0 ? (recv / q) * 100 : 0;
                  return (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{l.itemName}</span>
                        {l.wbsCode && (
                          <span className="block text-xs text-muted-foreground">
                            {l.wbsCode} {l.wbsName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">
                        {q} {l.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular">{formatMoney(l.unitPrice)}</td>
                      <td className="px-4 py-2.5 text-right tabular">{formatMoney(l.lineTotal)}</td>
                      <td className="px-4 py-2.5">
                        <ProgressMeter
                          value={pct}
                          tone={pct >= 100 ? "good" : pct > 0 ? "warning" : "neutral"}
                        />
                        <span className="mt-0.5 block text-xs text-muted-foreground tabular">
                          {recv} / {q} {l.unit}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t text-sm">
                  <td className="px-4 py-2.5 font-medium" colSpan={3}>
                    Subtotal
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular">
                    {formatMoney(po.subtotal)}
                  </td>
                  <td />
                </tr>
                <tr className="text-sm text-muted-foreground">
                  <td className="px-4 py-1.5" colSpan={3}>
                    VAT
                  </td>
                  <td className="px-4 py-1.5 text-right tabular">{formatMoney(po.taxAmount)}</td>
                  <td />
                </tr>
                <tr className="border-t text-sm">
                  <td className="px-4 py-2.5 font-semibold" colSpan={3}>
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular">
                    {formatMoney(po.totalAmount)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      {isReceiving && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Receipt className="size-4" />
          Released{po.releasedAt ? ` ${formatDate(po.releasedAt)}` : ""}. Record deliveries against
          this order in Goods Receipts to recognize cost and update inventory.
        </div>
      )}
    </div>
  );
}
