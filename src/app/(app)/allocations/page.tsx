import { asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Split, AlertTriangle, PackageCheck } from "lucide-react";
import { requireUser, db } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { num, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge, StatusPill } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/app/action-button";
import { REQUIREMENT_STATUS_TONE, type BadgeTone } from "@/lib/constants";
import { ReserveAllocationDialog } from "../inventory/dialogs";
import { issueAllocation, cancelAllocation } from "../inventory/actions";

const INBOUND = ["approved", "released", "partially_received"] as const;
const ALLOC_TONE: Record<string, BadgeTone> = {
  reserved: "info",
  issued: "good",
  cancelled: "neutral",
};

export default async function AllocationsPage() {
  const user = await requireUser();
  if (!can(user.role, "inventory.allocate")) redirect("/forbidden");
  const canAllocate = can(user.role, "inventory.allocate");
  // Stores can allocate but must not see buyer-negotiated landed cost — mirror
  // the wall the inventory table applies, so the Reserve dialog doesn't leak it.
  const canSeeCost = can(user.role, "costing.view");
  const currency = user.currencyCode;

  const data = await db(async (tx) => {
    // Requirements that are still open (need material).
    const reqs = await tx
      .select({
        id: t.projectRequirements.id,
        itemName: t.projectRequirements.itemName,
        unit: t.projectRequirements.unit,
        quantity: t.projectRequirements.quantity,
        neededBy: t.projectRequirements.neededBy,
        status: t.projectRequirements.status,
        projectId: t.projectRequirements.projectId,
        taskId: t.projectRequirements.taskId,
        wbsId: t.projectRequirements.wbsId,
        projectName: t.projects.name,
        projectCode: t.projects.code,
      })
      .from(t.projectRequirements)
      .innerJoin(t.projects, eq(t.projects.id, t.projectRequirements.projectId))
      .where(
        inArray(t.projectRequirements.status, [
          "submitted",
          "sourcing",
          "ordered",
          "partially_received",
        ]),
      )
      .orderBy(asc(t.projectRequirements.neededBy));

    // Allocated (non-cancelled) per requirement.
    const allocByReq = await tx
      .select({
        reqId: t.inventoryAllocations.requirementId,
        q: sql<string>`coalesce(sum(${t.inventoryAllocations.quantity}),0)`,
      })
      .from(t.inventoryAllocations)
      .where(ne(t.inventoryAllocations.status, "cancelled"))
      .groupBy(t.inventoryAllocations.requirementId);

    // Inbound (open PO lines) per requirement.
    const inboundByReq = await tx
      .select({
        reqId: t.purchaseOrderLines.requirementId,
        q: sql<string>`coalesce(sum(${t.purchaseOrderLines.quantity} - ${t.purchaseOrderLines.receivedQty}),0)`,
      })
      .from(t.purchaseOrderLines)
      .innerJoin(t.purchaseOrders, eq(t.purchaseOrders.id, t.purchaseOrderLines.poId))
      .where(inArray(t.purchaseOrders.status, [...INBOUND]))
      .groupBy(t.purchaseOrderLines.requirementId);

    // On-hand stock with availability.
    const items = await tx
      .select({
        id: t.inventoryItems.id,
        itemName: t.inventoryItems.itemName,
        unit: t.inventoryItems.unit,
        quantity: t.inventoryItems.quantity,
        allocatedQty: t.inventoryItems.allocatedQty,
        unitCost: t.inventoryItems.unitCost,
        warehouseName: t.warehouses.name,
      })
      .from(t.inventoryItems)
      .innerJoin(t.warehouses, eq(t.warehouses.id, t.inventoryItems.warehouseId))
      .orderBy(asc(t.inventoryItems.itemName));

    // Active + historic allocations.
    const allocations = await tx
      .select({
        id: t.inventoryAllocations.id,
        quantity: t.inventoryAllocations.quantity,
        status: t.inventoryAllocations.status,
        issuedAt: t.inventoryAllocations.issuedAt,
        createdAt: t.inventoryAllocations.createdAt,
        itemName: t.inventoryItems.itemName,
        unit: t.inventoryItems.unit,
        projectId: t.inventoryAllocations.projectId,
        projectCode: t.projects.code,
        taskName: t.tasks.name,
      })
      .from(t.inventoryAllocations)
      .innerJoin(t.inventoryItems, eq(t.inventoryItems.id, t.inventoryAllocations.itemId))
      .leftJoin(t.projects, eq(t.projects.id, t.inventoryAllocations.projectId))
      .leftJoin(t.tasks, eq(t.tasks.id, t.inventoryAllocations.taskId))
      .orderBy(desc(t.inventoryAllocations.createdAt))
      .limit(200);

    // Tasks for the reserve dialog (label per project).
    const tasks = await tx
      .select({ id: t.tasks.id, name: t.tasks.name, projectId: t.tasks.projectId })
      .from(t.tasks)
      .orderBy(asc(t.tasks.name));

    const projects = await tx
      .select({ id: t.projects.id, name: t.projects.name, code: t.projects.code })
      .from(t.projects)
      .orderBy(asc(t.projects.name));

    return { reqs, allocByReq, inboundByReq, items, allocations, tasks, projects };
  });

  const allocMap = new Map(data.allocByReq.map((a) => [a.reqId, num(a.q)]));
  const inboundMap = new Map(data.inboundByReq.map((i) => [i.reqId, num(i.q)]));

  const stockItems = data.items.map((it) => ({
    ...it,
    available: num(it.quantity) - num(it.allocatedQty),
  }));
  const availableItems = stockItems.filter((s) => s.available > 1e-9);

  // Shortage queue: open requirements not yet fully covered.
  const shortages = data.reqs
    .map((r) => {
      const required = num(r.quantity);
      const allocated = allocMap.get(r.id) ?? 0;
      const inbound = inboundMap.get(r.id) ?? 0;
      const shortage = Math.max(0, required - allocated - inbound);
      // Stock available that matches the requirement item by name.
      const match = availableItems.find(
        (s) => s.itemName.toLowerCase() === r.itemName.toLowerCase(),
      );
      return { r, required, allocated, inbound, shortage, match };
    })
    .filter((x) => x.shortage > 0 || x.match);

  const projectOptions = data.projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
  const tasksByProject = new Map<string, { id: string; label: string }[]>();
  for (const tk of data.tasks) {
    const arr = tasksByProject.get(tk.projectId) ?? [];
    arr.push({ id: tk.id, label: tk.name });
    tasksByProject.set(tk.projectId, arr);
  }

  const reserved = data.allocations.filter((a) => a.status === "reserved");
  const reservedQty = reserved.reduce((s, a) => s + num(a.quantity), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Material loop"
        title="Allocations"
        description="Reserve on-hand stock against project needs, then issue it to site."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open shortages" value={shortages.filter((s) => s.shortage > 0).length} tone={shortages.some((s) => s.shortage > 0) ? "critical" : "good"} />
        <StatCard label="Available SKUs" value={availableItems.length} sub="with free stock" />
        <StatCard label="Reserved" value={reserved.length} sub={`${formatNumber(reservedQty, 3)} units`} tone={reserved.length ? "info" : "neutral"} />
        <StatCard label="Allocations" value={data.allocations.length} />
      </div>

      {/* ─── Allocation queue: requirements vs available stock ─── */}
      <SectionCard
        title="Allocation queue"
        description="Open requirements and the stock that can cover them."
        noPadding
        className="mb-6"
      >
        {shortages.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<PackageCheck className="size-5" />}
              title="Nothing waiting on stock"
              description="Open requirements with a shortage or matching stock appear here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Requirement</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 text-right font-medium">Required</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reserved</th>
                  <th className="px-4 py-2.5 text-right font-medium">Shortage</th>
                  <th className="px-4 py-2.5 text-right font-medium">In stock</th>
                  <th className="px-4 py-2.5 font-medium">Needed</th>
                  {canAllocate && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {shortages.map(({ r, required, allocated, shortage, match }) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{r.itemName}</span>
                      <span className="block">
                        <StatusPill status={r.status} tones={REQUIREMENT_STATUS_TONE} className="mt-0.5" />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.projectCode}</td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {formatNumber(required, 3)} {r.unit}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular text-info">{formatNumber(allocated, 3)}</td>
                    <td className={`px-4 py-2.5 text-right tabular ${shortage > 0 ? "text-critical" : "text-good"}`}>
                      {shortage > 0 ? formatNumber(shortage, 3) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {match ? `${formatNumber(match.available, 3)} ${match.unit}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">{formatDate(r.neededBy)}</td>
                    {canAllocate && (
                      <td className="px-4 py-2.5 text-right">
                        {match ? (
                          <ReserveAllocationDialog
                            itemId={match.id}
                            itemName={match.itemName}
                            available={match.available}
                            unit={match.unit}
                            unitCost={num(match.unitCost)}
                            canSeeCost={canSeeCost}
                            projectOptions={projectOptions}
                            taskOptions={tasksByProject.get(r.projectId) ?? []}
                            requirementId={r.id}
                            projectId={r.projectId}
                            taskId={r.taskId ?? undefined}
                            wbsId={r.wbsId ?? undefined}
                            currency={currency}
                          />
                        ) : (
                          <StatusBadge tone="warning">
                            <AlertTriangle className="size-3" /> No stock
                          </StatusBadge>
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

      {/* ─── Free stock that can be reserved ad-hoc ─── */}
      {canAllocate && availableItems.length > 0 && (
        <SectionCard
          title="Available stock"
          description="Reserve any on-hand item to a project."
          noPadding
          className="mb-6"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium">Warehouse</th>
                  <th className="px-4 py-2.5 text-right font-medium">Available</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {availableItems.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-medium">{s.itemName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.warehouseName}</td>
                    <td className="px-4 py-2.5 text-right tabular text-good">
                      {formatNumber(s.available, 3)} {s.unit}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <ReserveAllocationDialog
                        itemId={s.id}
                        itemName={s.itemName}
                        available={s.available}
                        unit={s.unit}
                        unitCost={num(s.unitCost)}
                        canSeeCost={canSeeCost}
                        projectOptions={projectOptions}
                        taskOptions={[]}
                        currency={currency}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ─── Allocation register ─── */}
      <SectionCard title="Allocations" noPadding>
        {data.allocations.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Split className="size-5" />}
              title="No allocations yet"
              description="Reserve stock against a project to track issued material."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Task</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Reserved</th>
                  {canAllocate && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {data.allocations.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-medium">{a.itemName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{a.projectCode ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{a.taskName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {formatNumber(num(a.quantity), 3)} {a.unit}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={ALLOC_TONE[a.status] ?? "neutral"}>{a.status}</StatusBadge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(a.createdAt)}</td>
                    {canAllocate && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {a.status === "reserved" && (
                          <>
                            <ActionButton
                              action={issueAllocation}
                              fields={{ allocationId: a.id }}
                              variant="outline"
                              size="xs"
                            >
                              Issue
                            </ActionButton>
                            <ActionButton
                              action={cancelAllocation}
                              fields={{ allocationId: a.id }}
                              variant="ghost"
                              size="xs"
                              className="ml-1"
                              confirm="Cancel this reservation and release the stock?"
                            >
                              Cancel
                            </ActionButton>
                          </>
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
