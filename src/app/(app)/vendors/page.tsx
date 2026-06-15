import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { Building2, HardHat } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { num, formatMoney, formatNumber, formatPercent } from "@/lib/money";
import { getVendorStats, type VendorStats } from "@/lib/queries";
import { StatusBadge } from "@/components/app/status-badge";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/app/action-button";
import { CreateVendorDialog } from "./dialogs";
import { setVendorActive } from "./actions";

const EMPTY_STATS: VendorStats = { spend: 0, orders: 0, onTimeRate: null, defectRate: null, receipts: 0 };

export default async function VendorsPage() {
  const user = await requireCapability("vendors.manage");
  const currency = user.currencyCode;

  const { vendors, stats } = await db(async (tx) => {
    const vendors = await tx
      .select()
      .from(t.vendors)
      .orderBy(desc(t.vendors.isActive), asc(t.vendors.name));
    const stats = await getVendorStats(tx);
    return { vendors, stats };
  });

  const canManage = can(user.role, "vendors.manage");
  const subcontractors = vendors.filter((v) => v.isSubcontractor).length;
  const rated = vendors.filter((v) => num(v.rating) > 0);
  const avgRating = rated.length
    ? rated.reduce((s, v) => s + num(v.rating), 0) / rated.length
    : 0;
  const totalSpend = vendors.reduce((s, v) => s + (stats.get(v.id)?.spend ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Supply base"
        title="Vendors"
        description="Suppliers and subcontractors — performance, compliance and spend."
        actions={canManage ? <CreateVendorDialog /> : null}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Vendors" value={vendors.length} sub={`${rated.length} rated`} />
        <StatCard
          label="Subcontractors"
          value={subcontractors}
          tone="info"
          icon={<HardHat className="size-4" />}
        />
        <StatCard
          label="Avg rating"
          value={`${formatNumber(avgRating, 1)} / 5`}
          tone={avgRating >= 4 ? "good" : avgRating >= 3 ? "warning" : "neutral"}
        />
        <StatCard label="Total spend" value={formatMoney(totalSpend, currency, { compact: true })} />
      </div>

      <SectionCard noPadding>
        {vendors.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Building2 className="size-5" />}
              title="No vendors yet"
              description="Add suppliers and subcontractors to source quotes and raise orders."
              action={canManage ? <CreateVendorDialog /> : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Vendor</th>
                  <th className="px-4 py-2.5 font-medium">Rating</th>
                  <th className="px-4 py-2.5 text-right font-medium">On-time</th>
                  <th className="px-4 py-2.5 text-right font-medium">Defects</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total spend</th>
                  {canManage && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => {
                  const s = stats.get(v.id) ?? EMPTY_STATS;
                  return (
                  <tr key={v.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/vendors/${v.id}`} className="block">
                        <span className="inline-flex items-center gap-2">
                          <span className="font-medium text-foreground hover:underline">
                            {v.name}
                          </span>
                          {v.isSubcontractor && (
                            <StatusBadge tone="info">Subcontractor</StatusBadge>
                          )}
                          {!v.isActive && <StatusBadge tone="neutral">Inactive</StatusBadge>}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {[v.code, v.category ?? "Uncategorized"].filter(Boolean).join(" · ")}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 tabular">
                      {num(v.rating) > 0 ? `${formatNumber(num(v.rating), 1)} ★` : "—"}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular ${
                        s.onTimeRate !== null && s.onTimeRate < 85 ? "text-warning-foreground" : ""
                      }`}
                    >
                      {s.onTimeRate !== null ? formatPercent(s.onTimeRate) : "—"}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular ${
                        s.defectRate !== null && s.defectRate > 5 ? "text-critical" : ""
                      }`}
                    >
                      {s.defectRate !== null ? formatPercent(s.defectRate) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{formatMoney(s.spend, currency)}</td>
                    {canManage && (
                      <td className="px-4 py-2.5 text-right">
                        <ActionButton
                          action={setVendorActive}
                          fields={{ vendorId: v.id, active: v.isActive ? "false" : "true" }}
                          confirm={v.isActive ? `Deactivate ${v.name}? It will be hidden from RFQ/PO pickers.` : undefined}
                          variant="ghost"
                          size="xs"
                        >
                          {v.isActive ? "Deactivate" : "Reactivate"}
                        </ActionButton>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
