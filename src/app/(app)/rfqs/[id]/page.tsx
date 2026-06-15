import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  FileText,
  Trophy,
  Clock,
  ShieldCheck,
  BadgeDollarSign,
} from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { num, formatMoney, formatNumber, formatPercent } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { RFQ_STATUS_TONE } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusPill, StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { EnterQuoteDialog } from "../dialogs";
import { issueRfq, awardQuote } from "../actions";

export default async function RfqDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCapability("procurement.manage");

  const result = await db(async (tx) => {
    const [rfq] = await tx
      .select({
        id: t.rfqs.id,
        number: t.rfqs.number,
        title: t.rfqs.title,
        status: t.rfqs.status,
        dueDate: t.rfqs.dueDate,
        notes: t.rfqs.notes,
        awardedQuoteId: t.rfqs.awardedQuoteId,
        projectId: t.rfqs.projectId,
        projectCode: t.projects.code,
        projectName: t.projects.name,
        createdAt: t.rfqs.createdAt,
      })
      .from(t.rfqs)
      .leftJoin(t.projects, eq(t.projects.id, t.rfqs.projectId))
      .where(eq(t.rfqs.id, id))
      .limit(1);
    if (!rfq) return null;

    const lines = await tx
      .select()
      .from(t.rfqLines)
      .where(eq(t.rfqLines.rfqId, id))
      .orderBy(asc(t.rfqLines.sortOrder));

    const quotes = await tx
      .select({
        id: t.vendorQuotes.id,
        vendorId: t.vendorQuotes.vendorId,
        vendorName: t.vendors.name,
        vendorCategory: t.vendors.category,
        status: t.vendorQuotes.status,
        leadTimeDays: t.vendorQuotes.leadTimeDays,
        deliveryDate: t.vendorQuotes.deliveryDate,
        paymentTerms: t.vendorQuotes.paymentTerms,
        technicalCompliance: t.vendorQuotes.technicalCompliance,
        totalAmount: t.vendorQuotes.totalAmount,
        submittedAt: t.vendorQuotes.submittedAt,
      })
      .from(t.vendorQuotes)
      .innerJoin(t.vendors, eq(t.vendors.id, t.vendorQuotes.vendorId))
      .where(eq(t.vendorQuotes.rfqId, id))
      .orderBy(asc(t.vendors.name));

    // Award produces a PO referencing this RFQ; surface it when present.
    const [po] = await tx
      .select({ id: t.purchaseOrders.id, number: t.purchaseOrders.number, status: t.purchaseOrders.status })
      .from(t.purchaseOrders)
      .where(eq(t.purchaseOrders.rfqId, id))
      .limit(1);

    return { rfq, lines, quotes, po };
  });

  if (!result) notFound();
  const { rfq, lines, quotes, po } = result;

  const received = quotes.filter((q) => q.status !== "pending");
  const isAwarded = rfq.status === "awarded";
  const canAward = !isAwarded;

  // Comparison highlights — best price, earliest delivery, highest compliance.
  const bestPrice = received.length
    ? Math.min(...received.map((q) => num(q.totalAmount)))
    : null;
  const leadValues = received
    .map((q) => q.leadTimeDays)
    .filter((v): v is number => v !== null && v !== undefined);
  const bestLead = leadValues.length ? Math.min(...leadValues) : null;
  const bestCompliance = received.length
    ? Math.max(...received.map((q) => num(q.technicalCompliance)))
    : null;

  const totalQty = lines.reduce((s, l) => s + num(l.quantity), 0);

  return (
    <div>
      <PageHeader
        title={rfq.title}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{rfq.number}</span>
            {rfq.projectId && (
              <Link href={`/projects/${rfq.projectId}`} className="hover:underline">
                {rfq.projectCode} · {rfq.projectName}
              </Link>
            )}
            <span>Quotes due {formatDate(rfq.dueDate)}</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" render={<Link href="/rfqs" />}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <StatusPill status={rfq.status} tones={RFQ_STATUS_TONE} />
            {rfq.status === "draft" && (
              <ActionButton action={issueRfq} fields={{ rfqId: rfq.id }} size="sm">
                Issue RFQ
              </ActionButton>
            )}
          </div>
        }
      />

      {isAwarded && po && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-good/30 bg-good/5 px-3 py-2.5 text-sm">
          <span className="inline-flex items-center gap-2 text-good">
            <Trophy className="size-4" /> Awarded — purchase order {po.number} created.
          </span>
          <Button size="xs" variant="outline" render={<Link href={`/orders/${po.id}`} />}>
            View {po.number}
          </Button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Invited vendors" value={quotes.length} />
        <StatCard
          label="Quotes received"
          value={`${received.length}/${quotes.length}`}
          tone={received.length ? "good" : "warning"}
        />
        <StatCard
          label="Best price"
          value={bestPrice !== null ? formatMoney(bestPrice) : "—"}
          tone={bestPrice !== null ? "good" : "neutral"}
          icon={<BadgeDollarSign className="size-4" />}
        />
        <StatCard
          label="Earliest lead"
          value={bestLead !== null ? `${bestLead} days` : "—"}
          icon={<Clock className="size-4" />}
        />
      </div>

      {/* ─── Line items ─── */}
      <SectionCard title="Requested items" className="mb-4" noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 font-medium">Linked requirement</th>
                <th className="px-4 py-2.5 text-right font-medium">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium">{l.itemName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {l.requirementId ? "Linked" : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {formatNumber(l.quantity, 3)} {l.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ─── Quote comparison ─── */}
      <SectionCard
        title="Vendor quotes"
        description="Best price, earliest delivery and highest compliance are highlighted."
        noPadding
      >
        {quotes.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<FileText className="size-5" />}
              title="No vendors invited"
              description="This RFQ has no invited vendors."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Vendor</th>
                  <th className="px-4 py-2.5 font-medium">Quote</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unit</th>
                  <th className="px-4 py-2.5 text-right font-medium">Lead</th>
                  <th className="px-4 py-2.5 font-medium">Delivery</th>
                  <th className="px-4 py-2.5 text-right font-medium">Compliance</th>
                  <th className="px-4 py-2.5 text-right" />
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const total = num(q.totalAmount);
                  const lead = q.leadTimeDays ?? null;
                  const compliance = num(q.technicalCompliance);
                  const unitPrice = totalQty > 0 ? total / totalQty : 0;
                  const isPending = q.status === "pending";
                  const isWinner = q.id === rfq.awardedQuoteId;
                  const isBestPrice =
                    !isPending && bestPrice !== null && total === bestPrice;
                  const isBestLead =
                    !isPending && bestLead !== null && lead === bestLead;
                  const isBestCompliance =
                    !isPending && bestCompliance !== null && compliance === bestCompliance && compliance > 0;
                  return (
                    <tr
                      key={q.id}
                      className={`border-b last:border-0 ${isWinner ? "bg-good/5" : "hover:bg-muted/40"}`}
                    >
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          {isWinner && <Trophy className="size-3.5 text-good" />}
                          {q.vendorName}
                        </span>
                        {q.vendorCategory && (
                          <span className="block text-xs text-muted-foreground">
                            {q.vendorCategory}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          tone={
                            q.status === "awarded"
                              ? "good"
                              : q.status === "rejected"
                                ? "neutral"
                                : q.status === "received"
                                  ? "info"
                                  : "warning"
                          }
                        >
                          {q.status === "pending" ? "Awaiting" : q.status}
                        </StatusBadge>
                      </td>
                      {isPending ? (
                        <td className="px-4 py-2.5 text-muted-foreground" colSpan={5}>
                          No quote submitted yet
                        </td>
                      ) : (
                        <>
                          <td
                            className={`px-4 py-2.5 text-right tabular ${isBestPrice ? "font-semibold text-good" : ""}`}
                          >
                            {formatMoney(total)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular text-muted-foreground">
                            {formatMoney(unitPrice)}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right tabular ${isBestLead ? "font-semibold text-good" : ""}`}
                          >
                            {lead !== null ? `${lead}d` : "—"}
                          </td>
                          <td className="px-4 py-2.5">{formatDate(q.deliveryDate)}</td>
                          <td
                            className={`px-4 py-2.5 text-right tabular ${isBestCompliance ? "font-semibold text-good" : ""}`}
                          >
                            {formatPercent(compliance)}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {canAward && isPending && (
                          <EnterQuoteDialog quoteId={q.id} vendorName={q.vendorName} />
                        )}
                        {canAward && q.status === "received" && (
                          <span className="inline-flex items-center gap-1">
                            <EnterQuoteDialog
                              quoteId={q.id}
                              vendorName={q.vendorName}
                              defaults={{
                                totalAmount: String(num(q.totalAmount)),
                                leadTimeDays:
                                  q.leadTimeDays !== null && q.leadTimeDays !== undefined
                                    ? String(q.leadTimeDays)
                                    : "",
                                deliveryDate: q.deliveryDate,
                                technicalCompliance: String(num(q.technicalCompliance)),
                                paymentTerms: q.paymentTerms,
                              }}
                            />
                            <ActionButton
                              action={awardQuote}
                              fields={{ quoteId: q.id }}
                              confirm={`Award to ${q.vendorName}? Other quotes will be rejected and a draft PO created.`}
                              variant="default"
                              size="xs"
                            >
                              <Trophy className="size-3.5" /> Award
                            </ActionButton>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {received.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-4 px-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BadgeDollarSign className="size-3.5 text-good" /> lowest price
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5 text-good" /> shortest lead time
          </span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3.5 text-good" /> highest compliance
          </span>
        </div>
      )}
    </div>
  );
}
