import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { num } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { NewGrnForm, type PoOption } from "../new-form";

const OPEN_STATUSES = ["released", "partially_received"] as const;

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ poId?: string }>;
}) {
  await requireCapability("inventory.manage");
  const { poId } = await searchParams;

  const data = await db(async (tx) => {
    const pos = await tx
      .select({
        id: t.purchaseOrders.id,
        number: t.purchaseOrders.number,
        expectedDate: t.purchaseOrders.expectedDate,
        vendorName: t.vendors.name,
        projectCode: t.projects.code,
      })
      .from(t.purchaseOrders)
      .leftJoin(t.vendors, eq(t.vendors.id, t.purchaseOrders.vendorId))
      .leftJoin(t.projects, eq(t.projects.id, t.purchaseOrders.projectId))
      .where(inArray(t.purchaseOrders.status, [...OPEN_STATUSES]))
      .orderBy(asc(t.purchaseOrders.number));

    const ids = pos.map((p) => p.id);
    const lines = ids.length
      ? await tx
          .select({
            id: t.purchaseOrderLines.id,
            poId: t.purchaseOrderLines.poId,
            itemName: t.purchaseOrderLines.itemName,
            unit: t.purchaseOrderLines.unit,
            quantity: t.purchaseOrderLines.quantity,
            receivedQty: t.purchaseOrderLines.receivedQty,
            sortOrder: t.purchaseOrderLines.sortOrder,
          })
          .from(t.purchaseOrderLines)
          .where(inArray(t.purchaseOrderLines.poId, ids))
          .orderBy(asc(t.purchaseOrderLines.sortOrder))
      : [];

    const warehouses = await tx
      .select({ id: t.warehouses.id, name: t.warehouses.name, code: t.warehouses.code })
      .from(t.warehouses)
      .where(eq(t.warehouses.isActive, true))
      .orderBy(asc(t.warehouses.name));

    return { pos, lines, warehouses };
  });

  const linesByPo = new Map<string, PoOption["lines"]>();
  for (const l of data.lines) {
    const remaining = num(l.quantity) - num(l.receivedQty);
    if (remaining <= 1e-9) continue; // only show outstanding lines
    const arr = linesByPo.get(l.poId) ?? [];
    arr.push({
      id: l.id,
      itemName: l.itemName,
      unit: l.unit,
      quantity: num(l.quantity),
      receivedQty: num(l.receivedQty),
    });
    linesByPo.set(l.poId, arr);
  }

  const poOptions: PoOption[] = data.pos
    .map((p) => ({
      id: p.id,
      number: p.number,
      vendorName: p.vendorName,
      projectCode: p.projectCode,
      expectedDate: p.expectedDate,
      lines: linesByPo.get(p.id) ?? [],
    }))
    .filter((p) => p.lines.length > 0);

  const warehouseOptions = data.warehouses.map((w) => ({
    id: w.id,
    label: w.code ? `${w.name} (${w.code})` : w.name,
  }));

  return (
    <div>
      <PageHeader
        title="New goods receipt"
        description="Confirm what was delivered against a released order to book stock and cost."
        actions={
          <Button size="sm" variant="outline" render={<Link href="/deliveries" />}>
            <ArrowLeft className="size-4" /> Back to deliveries
          </Button>
        }
      />

      <NewGrnForm
        pos={poOptions}
        warehouses={warehouseOptions}
        initialPoId={poId}
        todayIso={todayISO()}
      />
    </div>
  );
}
