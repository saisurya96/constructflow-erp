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
  Printer,
  Ban,
  RotateCcw,
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
import { EnterQuoteDialog, EditRfqDialog, InviteVendorDialog } from "../dialogs";
import { issueRfq, awardQuote, cancelRfq, reopenRfq } from "../actions";

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

    // Per-line quote prices for the line-by-line comparison + edit defaults.
    const quoteLines = await tx
      .select({
        quoteId: t.vendorQuoteLines.quoteId,
        rfqLineId: t.vendorQuoteLines.rfqLineId,
        unitPrice: t.vendorQuoteLines.unitPrice,
        lineTotal: t.vendorQuoteLines.lineTotal,
        available: t.vendorQuoteLines.available,
      })
      .from(t.vendorQuoteLines)
      .innerJoin(t.vendorQuotes, eq(t.vendorQuotes.id, t.vendorQuoteLines.quoteId))
      .where(eq(t.vendorQuotes.rfqId, id));

    // Award produces a PO referencing this RFQ; surface it when present.
    const [po] = await tx
      .select({ id: t.purchaseOrders.id, number: t.purchaseOrders.number, status: t.purchaseOrders.status })
      .from(t.purchaseOrders)
      .where(eq(t.purchaseOrders.rfqId, id))
      .limit(1);

    // Active vendors not already invited — for the "invite vendor" picker.
    const invited = await tx
      .select({ vendorId: t.vendorQuotes.vendorId })
      .from(t.vendorQuotes)
      .where(eq(t.vendorQuotes.rfqId, id));
    const invitedIds = new Set(invited.map((i) => i.vendorId));
    const allVendors = await tx
      .select({ id: t.vendors.id, name: t.vendors.name, category: t.vendors.category })
      .from(t.vendors)
      .where(eq(t.vendors.isActive, true))
      .orderBy(asc(t.vendors.name));
    const invitableVendors = allVendors.filter((v) => !invitedIds.has(v.id));

    return { rfq, lines, quotes, quoteLines, po, invitableVendors };
  });

  if (!result) notFound();
  const { rfq, lines, quotes, quoteLines, po, invitableVendors } = result;

  const received = quotes.filter((q) => q.status !== "pending");
  const isAwarded = rfq.status === "awarded";
  const isCancelled = rfq.status === "cancelled";
  const canAward = !isAwarded && !isCancelled;
  const canEdit = rfq.status === "draft" || rfq.status === "issued" || rfq.status === "comparing";
  const poLive = !!po && po.status !== "cancelled";

  // Per-line quote prices: quoteLineMap[quoteId] = Map<rfqLineId, cell>.
  const quoteLineMap = new Map<
    string,
    Map<string, { unitPrice: number; lineTotal: number; available: boolean }>
  >();
  for (const ql of quoteLines) {
    if (!quoteLineMap.has(ql.quoteId)) quoteLineMap.set(ql.quoteId, new Map());
    quoteLineMap.get(ql.quoteId)!.set(ql.rfqLineId, {
      unitPrice: num(ql.unitPrice),
      lineTotal: num(ql.lineTotal),
      available: ql.available,
    });
  }
  // Lowest available unit price per RFQ line, across received quotes.
  const bestUnitByLine = new Map<string, number>();
  for (const l of lines) {
    let best: number | null = null;
    for (const q of received) {
      const cell = quoteLineMap.get(q.id)?.get(l.id);
      if (cell?.available && cell.unitPrice > 0)
        best = best === null ? cell.unitPrice : Math.min(best, cell.unitPrice);
    }
    if (best !== null) bestUnitByLine.set(l.id, best);
  }
  // Shape RFQ lines + each quote's prices for the entry dialog.
  const dialogLines = lines.map((l) => ({
    id: l.id,
    itemName: l.itemName,
    unit: l.unit,
    quantity: String(l.quantity),
  }));
  const pricesForQuote = (quoteId: string): Record<string, string> => {
    const out: Record<string, string> = {};
    const m = quoteLineMap.get(quoteId);
    if (m) for (const [lineId, cell] of m) out[lineId] = String(cell.unitPrice);
    return out;
  };

  // Quote completeness — how many of the RFQ's lines a vendor actually priced.
  const lineCount = lines.length;
  const pricedCountOf = (quoteId: string): number => {
    const m = quoteLineMap.get(quoteId);
    if (!m) return 0;
    return lines.filter((l) => {
      const c = m.get(l.id);
      return !!c?.available && c.unitPrice > 0;
    }).length;
  };
  const isComplete = (quoteId: string) =>
    lineCount > 0 && pricedCountOf(quoteId) === lineCount;

  // Comparison highlights — only quotes that price EVERY line compete on "best
  // price", so a partial quote can never masquerade as the cheapest.
  const comparable = received.filter((q) => isComplete(q.id) && num(q.totalAmount) > 0);
  const bestPrice = comparable.length
    ? Math.min(...comparable.map((q) => num(q.totalAmount)))
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
        eyebrow="Request for quote"
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
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" render={<Link href="/rfqs" />}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/print/rfq/${rfq.id}`} target="_blank" />}
            >
              <Printer className="size-4" /> PDF
            </Button>
            <StatusPill status={rfq.status} tones={RFQ_STATUS_TONE} />
            {canEdit && (
              <>
                <EditRfqDialog rfq={{ id: rfq.id, title: rfq.title, dueDate: rfq.dueDate, notes: rfq.notes }} />
                <InviteVendorDialog rfqId={rfq.id} vendors={invitableVendors} />
              </>
            )}
            {rfq.status === "draft" && (
              <ActionButton action={issueRfq} fields={{ rfqId: rfq.id }} size="sm">
                Issue RFQ
              </ActionButton>
            )}
            {canAward && (
              <ActionButton
                action={cancelRfq}
                fields={{ rfqId: rfq.id }}
                confirm="Cancel this RFQ? Invited quotes will be rejected."
                variant="outline"
                size="sm"
              >
                <Ban className="size-4" /> Cancel
              </ActionButton>
            )}
            {isAwarded && !poLive && (
              <ActionButton
                action={reopenRfq}
                fields={{ rfqId: rfq.id }}
                confirm="Reopen this RFQ to award a different vendor?"
                variant="outline"
                size="sm"
              >
                <RotateCcw className="size-4" /> Reopen
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
              <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
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

      {/* ─── Line-by-line comparison ─── */}
      {received.length > 0 && lines.length > 0 && (
        <SectionCard
          eyebrow="Compare"
          title="Line-by-line comparison"
          description="Lowest unit price per line is highlighted."
          className="mb-4"
          noPadding
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  {received.map((q) => (
                    <th key={q.id} className="px-4 py-2.5 text-right font-medium">
                      {q.vendorName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const best = bestUnitByLine.get(l.id);
                  return (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{l.itemName}</span>
                        <span className="block text-xs text-muted-foreground tabular">
                          {formatNumber(l.quantity, 3)} {l.unit}
                        </span>
                      </td>
                      {received.map((q) => {
                        const cell = quoteLineMap.get(q.id)?.get(l.id);
                        const has = !!cell?.available && cell.unitPrice > 0;
                        const isBest =
                          has && best !== undefined && cell!.unitPrice === best;
                        return (
                          <td
                            key={q.id}
                            className={`px-4 py-2.5 text-right tabular ${
                              isBest
                                ? "font-semibold text-good"
                                : has
                                  ? ""
                                  : "text-muted-foreground"
                            }`}
                          >
                            {has ? formatMoney(cell!.unitPrice) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="px-4 py-2.5">Quote total</td>
                  {received.map((q) => {
                    const total = num(q.totalAmount);
                    const isLowest = bestPrice !== null && total === bestPrice;
                    return (
                      <td
                        key={q.id}
                        className={`px-4 py-2.5 text-right tabular ${isLowest ? "font-semibold text-good" : ""}`}
                      >
                        {formatMoney(total)}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>
      )}

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
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
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
                  const priced = pricedCountOf(q.id);
                  const complete = isComplete(q.id);
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
                        {!isPending && lineCount > 1 && (
                          <span
                            className={`mt-0.5 block text-xs ${complete ? "text-muted-foreground" : "text-warning"}`}
                          >
                            {priced}/{lineCount} lines{complete ? "" : " · partial"}
                          </span>
                        )}
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
                          <EnterQuoteDialog
                            quoteId={q.id}
                            vendorName={q.vendorName}
                            lines={dialogLines}
                          />
                        )}
                        {canAward && q.status === "received" && (
                          <span className="inline-flex items-center gap-1">
                            <EnterQuoteDialog
                              quoteId={q.id}
                              vendorName={q.vendorName}
                              lines={dialogLines}
                              defaults={{
                                leadTimeDays:
                                  q.leadTimeDays !== null && q.leadTimeDays !== undefined
                                    ? String(q.leadTimeDays)
                                    : "",
                                deliveryDate: q.deliveryDate,
                                technicalCompliance: String(num(q.technicalCompliance)),
                                paymentTerms: q.paymentTerms,
                                prices: pricesForQuote(q.id),
                              }}
                            />
                            {complete ? (
                              <ActionButton
                                action={awardQuote}
                                fields={{ quoteId: q.id }}
                                confirm={`Award to ${q.vendorName}? Other quotes will be rejected and a draft PO created.`}
                                variant="default"
                                size="xs"
                              >
                                <Trophy className="size-3.5" /> Award
                              </ActionButton>
                            ) : (
                              <span className="text-xs text-muted-foreground" title="Price every line to award">
                                price all lines
                              </span>
                            )}
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
