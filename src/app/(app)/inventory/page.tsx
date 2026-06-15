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
import { ActionButton } from "@/components/app/action-button";
import {
  AddWarehouseDialog,
  AdjustStockDialog,
  EditWarehouseDialog,
  SetReorderDialog,
} from "./dialogs";
import { setWarehouseActive } from "./actions";

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

    const allWarehouses = await tx
      .select({
        id: t.warehouses.id,
        name: t.warehouses.name,
        code: t.warehouses.code,
        projectId: t.warehouses.projectId,
        address: t.warehouses.address,
        isActive: t.warehouses.isActive,
      })
      .from(t.warehouses)
      .orderBy(asc(t.warehouses.name));

    const projects = await tx
      .select({ id: t.projects.id, name: t.projects.name, code: t.projects.code })
      .from(t.projects)
      .orderBy(asc(t.projects.name));

    return { items, warehouses, allWarehouses, projects };
  });

  const canManage = can(user.role, "inventory.manage");
  // Unit cost / stock value is buyer-negotiated landed cost — finance data the
  // storekeeper role is walled off from. Only show it to cost-aware roles.
  const canSeeCost = can(user.role, "costing.view");

  const rows = data.items.map((it) => {
    const qty = num(it.quantity);
    const allocated = num(it.allocatedQty);
    const available = qty - allocated;
    const reorder = num(it.reorderPoint);
    const stockValue = qty * num(it.unitCost);
    // Low stock is judged on what's AVAILABLE to issue (on-hand minus reserved),
    // matching the storekeeper dashboard — not raw on-hand.
    const low = reorder > 0 && available <= reorder;
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
        eyebrow="Stores · inventory"
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
        {canSeeCost ? (
          <StatCard label="Total stock value" value={formatMoney(totalValue, "AED", { compact: true })} />
        ) : (
          <StatCard
            label="On hand"
            value={formatNumber(rows.reduce((s, r) => s + r.qty, 0), 0)}
            sub="units across stores"
          />
        )}
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
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium">Warehouse</th>
                  <th className="px-4 py-2.5 text-right font-medium">On hand</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reserved</th>
                  <th className="px-4 py-2.5 text-right font-medium">Available</th>
                  {canSeeCost && <th className="px-4 py-2.5 text-right font-medium">Unit cost</th>}
                  {canSeeCost && <th className="px-4 py-2.5 text-right font-medium">Stock value</th>}
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
                    {canSeeCost && <td className="px-4 py-2.5 text-right tabular">{formatMoney(it.unitCost)}</td>}
                    {canSeeCost && <td className="px-4 py-2.5 text-right tabular">{formatMoney(stockValue)}</td>}
                    <td className={`px-4 py-2.5 text-right tabular ${low ? "text-critical" : "text-muted-foreground"}`}>
                      <span className="inline-flex items-center justify-end gap-1">
                        {reorder > 0 ? formatNumber(reorder, 3) : "—"}
                        {canManage && (
                          <SetReorderDialog itemId={it.id} itemName={it.itemName} unit={it.unit} current={reorder} />
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {canManage && data.allWarehouses.length > 0 && (
        <SectionCard title="Warehouses" description="Stores and site lay-down areas." className="mt-4" noPadding>
          <div className="divide-y">
            {data.allWarehouses.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {w.name}
                    {w.code ? <span className="text-muted-foreground"> · {w.code}</span> : null}
                    {!w.isActive && (
                      <StatusBadge tone="neutral" className="ml-2">
                        Inactive
                      </StatusBadge>
                    )}
                  </p>
                  {w.address && <p className="text-xs text-muted-foreground">{w.address}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <EditWarehouseDialog
                    warehouse={{ id: w.id, name: w.name, code: w.code, projectId: w.projectId, address: w.address }}
                    projectOptions={projectOptions}
                  />
                  <ActionButton
                    action={setWarehouseActive}
                    fields={{ warehouseId: w.id, active: w.isActive ? "false" : "true" }}
                    confirm={w.isActive ? `Deactivate ${w.name}? It will be hidden from pickers.` : undefined}
                    variant="ghost"
                    size="xs"
                  >
                    {w.isActive ? "Deactivate" : "Reactivate"}
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
