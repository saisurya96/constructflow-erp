import { asc, eq } from "drizzle-orm";
import { Boxes, AlertTriangle } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { num, formatMoney, formatNumber } from "@/lib/money";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { AddWarehouseDialog, AdjustStockDialog } from "./dialogs";

export default async function InventoryPage() {
  const user = await requireCapability("inventory.manage");

  const data = await db(async (tx) => {
    const items = await tx
      .select({
        id: t.inventoryItems.id,
        itemName: t.inventoryItems.itemName,
        unit: t.inventoryItems.unit,
        quantity: t.inventoryItems.quantity,
        allocatedQty: t.inventoryItems.allocatedQty,
        unitCost: t.inventoryItems.unitCost,
        reorderPoint: t.inventoryItems.reorderPoint,
        warehouseId: t.inventoryItems.warehouseId,
        warehouseName: t.warehouses.name,
        warehouseCode: t.warehouses.code,
      })
      .from(t.inventoryItems)
      .innerJoin(t.warehouses, eq(t.warehouses.id, t.inventoryItems.warehouseId))
      .orderBy(asc(t.warehouses.name), asc(t.inventoryItems.itemName));

    const warehouses = await tx
      .select({ id: t.warehouses.id, name: t.warehouses.name, code: t.warehouses.code })
      .from(t.warehouses)
      .where(eq(t.warehouses.isActive, true))
      .orderBy(asc(t.warehouses.name));

    const projects = await tx
      .select({ id: t.projects.id, name: t.projects.name, code: t.projects.code })
      .from(t.projects)
      .orderBy(asc(t.projects.name));

    return { items, warehouses, projects };
  });

  const canManage = can(user.role, "inventory.manage");

  const rows = data.items.map((it) => {
    const qty = num(it.quantity);
    const allocated = num(it.allocatedQty);
    const available = qty - allocated;
    const reorder = num(it.reorderPoint);
    const stockValue = qty * num(it.unitCost);
    const low = reorder > 0 && qty <= reorder;
    return { it, qty, allocated, available, reorder, stockValue, low };
  });

  const totalValue = rows.reduce((s, r) => s + r.stockValue, 0);
  const lowCount = rows.filter((r) => r.low).length;

  const warehouseOptions = data.warehouses.map((w) => ({
    id: w.id,
    label: w.code ? `${w.name} (${w.code})` : w.name,
  }));
  const projectOptions = data.projects.map((p) => ({
    id: p.id,
    label: `${p.code} — ${p.name}`,
  }));

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock ledger — on-hand, reserved and available across every store."
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              <AddWarehouseDialog projectOptions={projectOptions} />
              {warehouseOptions.length > 0 && (
                <AdjustStockDialog warehouseOptions={warehouseOptions} />
              )}
            </div>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="SKUs" value={rows.length} sub={`${data.warehouses.length} warehouse${data.warehouses.length === 1 ? "" : "s"}`} />
        <StatCard label="Total stock value" value={formatMoney(totalValue, "AED", { compact: true })} />
        <StatCard
          label="Low stock"
          value={lowCount}
          tone={lowCount ? "critical" : "good"}
          sub={lowCount ? "at / below reorder" : "all above reorder"}
        />
        <StatCard
          label="Reserved"
          value={formatNumber(rows.reduce((s, r) => s + r.allocated, 0), 3)}
          sub="units allocated"
        />
      </div>

      <SectionCard noPadding>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Boxes className="size-5" />}
              title="No stock on hand"
              description={
                warehouseOptions.length === 0
                  ? "Add a warehouse, then receive goods or post an adjustment to build stock."
                  : "Receive goods against a purchase order or post a stock adjustment to start."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium">Warehouse</th>
                  <th className="px-4 py-2.5 text-right font-medium">On hand</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reserved</th>
                  <th className="px-4 py-2.5 text-right font-medium">Available</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unit cost</th>
                  <th className="px-4 py-2.5 text-right font-medium">Stock value</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reorder</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ it, qty, allocated, available, reorder, stockValue, low }) => (
                  <tr key={it.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{it.itemName}</span>
                      {low && (
                        <StatusBadge tone="critical" className="ml-2">
                          <AlertTriangle className="size-3" /> Low
                        </StatusBadge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {it.warehouseName}
                      {it.warehouseCode ? ` · ${it.warehouseCode}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {formatNumber(qty, 3)} {it.unit}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular text-info">
                      {formatNumber(allocated, 3)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular ${available <= 0 ? "text-muted-foreground" : "text-good"}`}>
                      {formatNumber(available, 3)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{formatMoney(it.unitCost)}</td>
                    <td className="px-4 py-2.5 text-right tabular">{formatMoney(stockValue)}</td>
                    <td className={`px-4 py-2.5 text-right tabular ${low ? "text-critical" : "text-muted-foreground"}`}>
                      {reorder > 0 ? formatNumber(reorder, 3) : "—"}
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
