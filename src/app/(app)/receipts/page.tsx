import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { PackageCheck, Plus } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import type { BadgeTone } from "@/lib/constants";

const GRN_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  posted: "good",
  rejected: "critical",
};

export default async function ReceiptsPage() {
  await requireCapability("inventory.manage");

  const data = await db(async (tx) => {
    const grns = await tx
      .select({
        id: t.goodsReceipts.id,
        number: t.goodsReceipts.number,
        status: t.goodsReceipts.status,
        receivedDate: t.goodsReceipts.receivedDate,
        deliveryNoteNumber: t.goodsReceipts.deliveryNoteNumber,
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
      .orderBy(desc(t.goodsReceipts.createdAt));
    return { grns };
  });

  const postedCount = data.grns.filter((g) => g.status === "posted").length;
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = data.grns.filter((g) => g.receivedDate === today).length;

  return (
    <div>
      <PageHeader
        title="Goods receipts"
        description="Receipt history — each posting books stock and recognises actual cost."
        actions={
          <Button size="sm" render={<Link href="/receipts/new" />}>
            <Plus className="size-4" /> New goods receipt
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total receipts" value={data.grns.length} />
        <StatCard label="Posted" value={postedCount} tone={postedCount ? "good" : "neutral"} />
        <StatCard label="Received today" value={todayCount} tone={todayCount ? "info" : "neutral"} />
        <StatCard
          label="Latest"
          value={data.grns[0] ? data.grns[0].number : "—"}
          sub={data.grns[0] ? formatDate(data.grns[0].receivedDate) : undefined}
        />
      </div>

      <SectionCard noPadding>
        {data.grns.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<PackageCheck className="size-5" />}
              title="No goods receipts yet"
              description="Receive a released order to create your first goods receipt."
              action={
                <Button size="sm" render={<Link href="/receipts/new" />}>
                  <Plus className="size-4" /> New goods receipt
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">GRN</th>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Vendor</th>
                  <th className="px-4 py-2.5 font-medium">Warehouse</th>
                  <th className="px-4 py-2.5 font-medium">Delivery note</th>
                  <th className="px-4 py-2.5 font-medium">Received</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.grns.map((g) => (
                  <tr key={g.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{g.number}</span>
                      {g.receiverName && (
                        <span className="block text-xs text-muted-foreground">by {g.receiverName}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{g.poNumber ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{g.vendorName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{g.warehouseName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{g.deliveryNoteNumber ?? "—"}</td>
                    <td className="px-4 py-2.5">{formatDate(g.receivedDate)}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={GRN_TONE[g.status] ?? "neutral"}>{g.status}</StatusBadge>
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
