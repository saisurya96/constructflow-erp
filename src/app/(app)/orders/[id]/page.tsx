import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { Building2, CalendarClock, FolderKanban, Receipt, Printer, Ban } from "lucide-react";
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
import { AttachmentsPanel } from "@/components/app/attachments-panel";
import { Button } from "@/components/ui/button";
import { submitPurchaseOrder, cancelPurchaseOrder, closePurchaseOrder } from "../actions";
import { EditPoDialog } from "../dialogs";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // View is open to approvers (finance/PM) so they can review an order before
  // authorizing it; every mutation control below is gated on procurement.manage.
  const user = await requireCapability("procurement.view");
  const currency = user.currencyCode;

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
        requirementId: t.purchaseOrderLines.requirementId,
        itemName: t.purchaseOrderLines.itemName,
        unit: t.purchaseOrderLines.unit,
        quantity: t.purchaseOrderLines.quantity,
        unitPrice: t.purchaseOrderLines.unitPrice,
        lineTotal: t.purchaseOrderLines.lineTotal,
        receivedQty: t.purchaseOrderLines.receivedQty,
        wbsId: t.purchaseOrderLines.wbsId,
        wbsCode: t.wbsCodes.code,
        wbsName: t.wbsCodes.name,
      })
      .from(t.purchaseOrderLines)
      .leftJoin(t.wbsCodes, eq(t.wbsCodes.id, t.purchaseOrderLines.wbsId))
      .where(eq(t.purchaseOrderLines.poId, id))
      .orderBy(asc(t.purchaseOrderLines.sortOrder));

    // Latest approval decision for this order — surfaces the rejection reason.
    const [approval] = await tx
      .select({
        status: t.approvals.status,
        decisionNote: t.approvals.decisionNote,
        decidedByName: t.users.fullName,
      })
      .from(t.approvals)
      .leftJoin(t.users, eq(t.users.id, t.approvals.decidedBy))
      .where(
        and(
          eq(t.approvals.entityId, id),
          eq(t.approvals.entityType, "purchase_order"),
        ),
      )
      .orderBy(desc(t.approvals.createdAt))
      .limit(1);

    // Option lists for the draft edit dialog (only needed while editable).
    let vendorOptions: { id: string; label: string }[] = [];
    let projectOptions: { id: string; label: string }[] = [];
    let wbsByProject: Record<string, { id: string; label: string }[]> = {};
    if (po.status === "draft") {
      const vendors = await tx
        .select({ id: t.vendors.id, name: t.vendors.name })
        .from(t.vendors)
        .where(eq(t.vendors.isActive, true))
        .orderBy(asc(t.vendors.name));
      vendorOptions = vendors.map((v) => ({ id: v.id, label: v.name }));
      const projects = await tx
        .select({ id: t.projects.id, code: t.projects.code, name: t.projects.name })
        .from(t.projects)
        .orderBy(asc(t.projects.code));
      projectOptions = projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
      const wbs = await tx
        .select({ id: t.wbsCodes.id, projectId: t.wbsCodes.projectId, code: t.wbsCodes.code, name: t.wbsCodes.name })
        .from(t.wbsCodes)
        .orderBy(asc(t.wbsCodes.sortOrder), asc(t.wbsCodes.code));
      wbsByProject = {};
      for (const w of wbs) {
        (wbsByProject[w.projectId] ??= []).push({ id: w.id, label: `${w.code} — ${w.name}` });
      }
    }

    return { po, lines, vendorOptions, projectOptions, wbsByProject, approval };
  });

  if (!result) notFound();
  const { po, lines, vendorOptions, projectOptions, wbsByProject, approval } = result;
  const canManage = can(user.role, "procurement.manage");
  const canReceive = can(user.role, "inventory.manage");
  const isSub = po.type === "subcontract";

  const orderedQty = lines.reduce((s, l) => s + num(l.quantity), 0);
  const receivedTotal = lines.reduce((s, l) => s + num(l.receivedQty), 0);
  const receivedPct = orderedQty > 0 ? (receivedTotal / orderedQty) * 100 : 0;

  const isReceiving = ["released", "partially_received", "received"].includes(po.status);

  return (
    <div>
      <PageHeader
        backHref="/orders"
        backLabel="All orders"
        eyebrow="Procurement"
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
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/print/po/${po.id}`} target="_blank" />}
            >
              <Printer className="size-4" /> PDF
            </Button>
            {po.status === "pending_approval" ? (
              <StatusBadge tone="warning">Awaiting approval</StatusBadge>
            ) : (
              <StatusPill status={po.status} tones={PO_STATUS_TONE} />
            )}
            {canManage && po.status === "draft" && (
              <>
                <EditPoDialog
                  poId={po.id}
                  vendorOptions={vendorOptions}
                  projectOptions={projectOptions}
                  wbsByProject={wbsByProject}
                  defaults={{
                    type: po.type,
                    vendorId: po.vendorId,
                    projectId: po.projectId ?? "",
                    title: po.title,
                    expectedDate: po.expectedDate,
                    paymentTerms: po.paymentTerms,
                    notes: po.notes,
                    lines: lines.map((l) => ({
                      itemName: l.itemName,
                      unit: l.unit,
                      quantity: l.quantity,
                      unitPrice: l.unitPrice,
                      wbsId: l.wbsId,
                      requirementId: l.requirementId,
                    })),
                  }}
                  currency={currency}
                />
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
            {canManage && ["released", "partially_received"].includes(po.status) && (
              <ActionButton
                action={closePurchaseOrder}
                fields={{ poId: po.id }}
                variant="outline"
                size="sm"
                confirm="Close this order? Any remaining outstanding commitment is released; received goods stay posted."
              >
                Close
              </ActionButton>
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
                  confirm="Cancel this order? Any committed cost still open will be released back to the job budget; received goods stay posted."
                >
                  Cancel
                </ActionButton>
              )}
          </div>
        }
      />

      {po.status === "cancelled" && approval?.status === "rejected" && approval.decisionNote && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-critical/30 bg-critical/5 px-3 py-2.5 text-sm text-critical">
          <Ban className="mt-0.5 size-4 shrink-0" />
          <span>
            Rejected{approval.decidedByName ? ` by ${approval.decidedByName}` : ""}: {approval.decisionNote}
          </span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Subtotal" value={formatMoney(po.subtotal, currency, { compact: true })} />
        <StatCard label="VAT" value={formatMoney(po.taxAmount, currency, { compact: true })} />
        <StatCard
          label="Total"
          value={formatMoney(po.totalAmount, currency, { compact: true })}
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
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
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
                      <td className="px-4 py-2.5 text-right tabular">{formatMoney(l.unitPrice, currency)}</td>
                      <td className="px-4 py-2.5 text-right tabular">{formatMoney(l.lineTotal, currency)}</td>
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
                    {formatMoney(po.subtotal, currency)}
                  </td>
                  <td />
                </tr>
                <tr className="text-sm text-muted-foreground">
                  <td className="px-4 py-1.5" colSpan={3}>
                    VAT
                  </td>
                  <td className="px-4 py-1.5 text-right tabular">{formatMoney(po.taxAmount, currency)}</td>
                  <td />
                </tr>
                <tr className="border-t text-sm">
                  <td className="px-4 py-2.5 font-semibold" colSpan={3}>
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular">
                    {formatMoney(po.totalAmount, currency)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      {po.notes && (
        <SectionCard title="Notes" className="mt-4">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{po.notes}</p>
        </SectionCard>
      )}

      {isReceiving && po.status !== "received" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Receipt className="size-4" />
            Released{po.releasedAt ? ` ${formatDate(po.releasedAt)}` : ""}. Record deliveries to
            recognize cost and update inventory.
          </span>
          {canReceive && (
            <Button size="sm" render={<Link href={`/receipts/new?poId=${po.id}`} />}>
              <Receipt className="size-4" /> Receive against this PO
            </Button>
          )}
        </div>
      )}

      <div className="mt-4">
        <AttachmentsPanel entityType="purchase_order" entityId={po.id} />
      </div>
    </div>
  );
}
