import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Mail, Phone, MapPin, User2, Tag, ShoppingCart, FileText } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
import * as t from "@/db/schema";
import { num, formatMoney, formatNumber, formatPercent } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { getVendorStats } from "@/lib/queries";
import { PO_STATUS_TONE } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge, StatusPill } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/app/action-button";
import { EditVendorDialog } from "../dialogs";
import { setVendorActive } from "../actions";

const OPEN_PO = new Set([
  "draft",
  "pending_approval",
  "approved",
  "released",
  "partially_received",
]);

const QUOTE_TONE: Record<string, "neutral" | "info" | "good" | "critical"> = {
  pending: "neutral",
  received: "info",
  awarded: "good",
  rejected: "critical",
};

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCapability("vendors.manage");
  const currency = user.currencyCode;

  const result = await db(async (tx) => {
    const [vendor] = await tx
      .select()
      .from(t.vendors)
      .where(eq(t.vendors.id, id))
      .limit(1);
    if (!vendor) return null;

    const orders = await tx
      .select({
        id: t.purchaseOrders.id,
        number: t.purchaseOrders.number,
        title: t.purchaseOrders.title,
        type: t.purchaseOrders.type,
        status: t.purchaseOrders.status,
        totalAmount: t.purchaseOrders.totalAmount,
        projectName: t.projects.name,
      })
      .from(t.purchaseOrders)
      .leftJoin(t.projects, eq(t.projects.id, t.purchaseOrders.projectId))
      .where(eq(t.purchaseOrders.vendorId, id))
      .orderBy(desc(t.purchaseOrders.createdAt));

    const quotes = await tx
      .select({
        id: t.vendorQuotes.id,
        status: t.vendorQuotes.status,
        totalAmount: t.vendorQuotes.totalAmount,
        technicalCompliance: t.vendorQuotes.technicalCompliance,
        leadTimeDays: t.vendorQuotes.leadTimeDays,
        deliveryDate: t.vendorQuotes.deliveryDate,
        rfqNumber: t.rfqs.number,
        rfqTitle: t.rfqs.title,
      })
      .from(t.vendorQuotes)
      .innerJoin(t.rfqs, eq(t.rfqs.id, t.vendorQuotes.rfqId))
      .where(eq(t.vendorQuotes.vendorId, id))
      .orderBy(desc(t.vendorQuotes.createdAt));

    const stats = (await getVendorStats(tx)).get(id) ?? {
      spend: 0,
      orders: 0,
      onTimeRate: null,
      defectRate: null,
      receipts: 0,
    };
    return { vendor, orders, quotes, stats };
  });

  if (!result) notFound();
  const { vendor, orders, quotes, stats } = result;

  const canManage = can(user.role, "vendors.manage");
  const openPOs = orders.filter((o) => OPEN_PO.has(o.status)).length;
  const poSpend = stats.spend;
  const compliant = quotes.filter((q) => num(q.technicalCompliance) > 0);
  const avgCompliance = compliant.length
    ? compliant.reduce((s, q) => s + num(q.technicalCompliance), 0) / compliant.length
    : 0;

  return (
    <div>
      <PageHeader
        backHref="/vendors"
        backLabel="All vendors"
        eyebrow="Vendor"
        title={
          <span className="flex items-center gap-2">
            {vendor.name}
            {vendor.isSubcontractor && <StatusBadge tone="info">Subcontractor</StatusBadge>}
            {!vendor.isActive && <StatusBadge tone="neutral">Inactive</StatusBadge>}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {vendor.code && <span>{vendor.code}</span>}
            <span className="inline-flex items-center gap-1">
              <Tag className="size-3.5" /> {vendor.category ?? "Uncategorized"}
            </span>
            {num(vendor.rating) > 0 && (
              <span>{formatNumber(num(vendor.rating), 1)} ★ rating</span>
            )}
          </span>
        }
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              <EditVendorDialog vendor={vendor} />
              <ActionButton
                action={setVendorActive}
                fields={{ vendorId: vendor.id, active: vendor.isActive ? "false" : "true" }}
                confirm={
                  vendor.isActive
                    ? `Deactivate ${vendor.name}?${
                        openPOs
                          ? ` They have ${openPOs} open order${openPOs === 1 ? "" : "s"} that will remain, but no new orders can be raised.`
                          : " They'll be hidden from RFQ/PO pickers."
                      }`
                    : undefined
                }
                variant="outline"
                size="sm"
              >
                {vendor.isActive ? "Deactivate" : "Reactivate"}
              </ActionButton>
            </div>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total spend" value={formatMoney(poSpend, currency, { compact: true })} />
        <StatCard
          label="Open orders"
          value={openPOs}
          sub={`${orders.length} total`}
          tone={openPOs ? "info" : "neutral"}
        />
        <StatCard
          label="On-time delivery"
          value={stats.onTimeRate !== null ? formatPercent(stats.onTimeRate) : "—"}
          sub={stats.receipts > 0 ? `${stats.receipts} receipt${stats.receipts === 1 ? "" : "s"}` : "no receipts yet"}
          tone={
            stats.onTimeRate === null
              ? "neutral"
              : stats.onTimeRate >= 90
                ? "good"
                : stats.onTimeRate >= 75
                  ? "warning"
                  : "critical"
          }
        />
        <StatCard
          label="Avg compliance"
          value={avgCompliance > 0 ? formatPercent(avgCompliance) : "—"}
          sub={`${compliant.length} of ${quotes.length} scored`}
          tone={
            avgCompliance === 0
              ? "neutral"
              : avgCompliance >= 90
                ? "good"
                : avgCompliance >= 75
                  ? "warning"
                  : "critical"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Contact" className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            <ContactRow icon={<User2 className="size-4" />} label="Contact" value={vendor.contactName} />
            <ContactRow
              icon={<Mail className="size-4" />}
              label="Email"
              value={vendor.email}
              href={vendor.email ? `mailto:${vendor.email}` : undefined}
            />
            <ContactRow
              icon={<Phone className="size-4" />}
              label="Phone"
              value={vendor.phone}
              href={vendor.phone ? `tel:${vendor.phone}` : undefined}
            />
            <ContactRow icon={<MapPin className="size-4" />} label="Address" value={vendor.address} />
            <div className="flex items-start gap-3 border-t pt-3">
              <Tag className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Defect rate</dt>
                <dd className={`font-medium ${stats.defectRate !== null && stats.defectRate > 5 ? "text-critical" : ""}`}>
                  {stats.defectRate !== null ? formatPercent(stats.defectRate) : "—"}
                </dd>
              </div>
            </div>
          </dl>
          {vendor.notes && (
            <p className="mt-4 border-t pt-3 text-sm text-muted-foreground whitespace-pre-line">
              {vendor.notes}
            </p>
          )}
        </SectionCard>

        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Purchase orders" noPadding>
            {orders.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<ShoppingCart className="size-5" />}
                  title="No orders yet"
                  description="Purchase orders and subcontracts raised to this vendor appear here."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Order</th>
                      <th className="px-4 py-2.5 font-medium">Project</th>
                      <th className="px-4 py-2.5 text-right font-medium">Total</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2.5">
                          <Link href={`/orders/${o.id}`} className="block">
                            <span className="font-medium text-foreground hover:underline">
                              {o.number}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {o.type === "subcontract" ? "Subcontract" : "PO"} · {o.title}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{o.projectName ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(o.totalAmount, currency)}</td>
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

          <SectionCard title="Quotes" description="Bids submitted in response to RFQs." noPadding>
            {quotes.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<FileText className="size-5" />}
                  title="No quotes yet"
                  description="Quotes this vendor submitted against RFQs appear here."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">RFQ</th>
                      <th className="px-4 py-2.5 text-right font-medium">Quoted</th>
                      <th className="px-4 py-2.5 text-right font-medium">Compliance</th>
                      <th className="px-4 py-2.5 text-right font-medium">Lead</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr key={q.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2.5">
                          <span className="font-medium">{q.rfqNumber}</span>
                          <span className="block text-xs text-muted-foreground">{q.rfqTitle}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(q.totalAmount, currency)}</td>
                        <td className="px-4 py-2.5 text-right tabular">
                          {num(q.technicalCompliance) > 0 ? formatPercent(q.technicalCompliance) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular text-muted-foreground">
                          {q.leadTimeDays != null ? `${q.leadTimeDays}d` : formatDate(q.deliveryDate)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge tone={QUOTE_TONE[q.status] ?? "neutral"}>{q.status}</StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium break-words">
          {value ? (
            href ? (
              <a href={href} className="hover:underline">{value}</a>
            ) : (
              value
            )
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </dd>
      </div>
    </div>
  );
}
