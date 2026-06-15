import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { ShoppingCart } from "lucide-react";
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
import { EmptyState } from "@/components/app/empty-state";
import { CreatePoDialog } from "./dialogs";

const OPEN_STATUSES = ["draft", "pending_approval", "approved", "released", "partially_received"];

export default async function OrdersPage() {
  const user = await requireCapability("procurement.manage");

  const data = await db(async (tx) => {
    const orders = await tx
      .select({
        id: t.purchaseOrders.id,
        number: t.purchaseOrders.number,
        type: t.purchaseOrders.type,
        title: t.purchaseOrders.title,
        status: t.purchaseOrders.status,
        totalAmount: t.purchaseOrders.totalAmount,
        subtotal: t.purchaseOrders.subtotal,
        expectedDate: t.purchaseOrders.expectedDate,
        vendorName: t.vendors.name,
        projectId: t.purchaseOrders.projectId,
        projectCode: t.projects.code,
      })
      .from(t.purchaseOrders)
      .innerJoin(t.vendors, eq(t.vendors.id, t.purchaseOrders.vendorId))
      .leftJoin(t.projects, eq(t.projects.id, t.purchaseOrders.projectId))
      .orderBy(desc(t.purchaseOrders.createdAt))
      .limit(200);

    const vendors = await tx
      .select({ id: t.vendors.id, name: t.vendors.name })
      .from(t.vendors)
      .where(eq(t.vendors.isActive, true))
      .orderBy(asc(t.vendors.name));

    const projects = await tx
      .select({ id: t.projects.id, code: t.projects.code, name: t.projects.name })
      .from(t.projects)
      .orderBy(desc(t.projects.createdAt));

    const wbs = await tx
      .select({
        id: t.wbsCodes.id,
        projectId: t.wbsCodes.projectId,
        code: t.wbsCodes.code,
        name: t.wbsCodes.name,
      })
      .from(t.wbsCodes)
      .orderBy(asc(t.wbsCodes.sortOrder), asc(t.wbsCodes.code));

    return { orders, vendors, projects, wbs };
  });

  const vendorOptions = data.vendors.map((v) => ({ id: v.id, label: v.name }));
  const projectOptions = data.projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
  const wbsByProject: Record<string, { id: string; label: string }[]> = {};
  for (const w of data.wbs) {
    (wbsByProject[w.projectId] ??= []).push({ id: w.id, label: `${w.code} — ${w.name}` });
  }

  const openOrders = data.orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const pendingApproval = data.orders.filter((o) => o.status === "pending_approval");
  // Committed value = subtotal of orders that have been released into the cost ledger.
  const committed = data.orders
    .filter((o) => ["released", "partially_received", "received", "closed"].includes(o.status))
    .reduce((s, o) => s + num(o.subtotal), 0);

  const canManage = can(user.role, "procurement.manage");

  return (
    <div>
      <PageHeader
        eyebrow="Procurement"
        title="Purchase Orders"
        description="Purchase orders and subcontracts — raise, approve, release and receive against the cost ledger."
        actions={
          canManage ? (
            <CreatePoDialog
              vendorOptions={vendorOptions}
              projectOptions={projectOptions}
              wbsByProject={wbsByProject}
            />
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Open orders" value={openOrders.length} sub={`${data.orders.length} total`} />
        <StatCard
          label="Pending approval"
          value={pendingApproval.length}
          tone={pendingApproval.length ? "warning" : "good"}
        />
        <StatCard
          label="Committed value"
          value={formatMoney(committed, "AED", { compact: true })}
          tone="info"
          sub="released into cost ledger"
        />
      </div>

      <SectionCard noPadding>
        {data.orders.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<ShoppingCart className="size-5" />}
              title="No orders yet"
              description="Raise a purchase order or subcontract to start committing project cost."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Vendor</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 font-medium">Expected</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/orders/${o.id}`} className="block">
                        <span className="font-medium text-foreground hover:underline">
                          {o.number}
                        </span>
                        <span className="block text-xs text-muted-foreground">{o.title}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={o.type === "subcontract" ? "warning" : "info"}>
                        {o.type === "subcontract" ? "Subcontract" : "PO"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-2.5">{o.vendorName}</td>
                    <td className="px-4 py-2.5">
                      {o.projectId ? (
                        <Link
                          href={`/projects/${o.projectId}`}
                          className="text-muted-foreground hover:underline"
                        >
                          {o.projectCode}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{formatMoney(o.totalAmount)}</td>
                    <td className="px-4 py-2.5">{formatDate(o.expectedDate)}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={o.status} tones={PO_STATUS_TONE} />
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
