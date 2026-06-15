import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { CalendarClock, FolderKanban, Flag } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { num, formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { daysUntil } from "@/lib/severity";
import { INVOICE_STATUS_TONE } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusPill, StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/app/action-button";
import { RecordPaymentDialog } from "../dialogs";
import { sendInvoice, voidInvoice } from "../actions";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCapability("billing.manage");

  const result = await db(async (tx) => {
    const [invoice] = await tx
      .select({
        id: t.invoices.id,
        number: t.invoices.number,
        type: t.invoices.type,
        title: t.invoices.title,
        status: t.invoices.status,
        subtotal: t.invoices.subtotal,
        taxAmount: t.invoices.taxAmount,
        totalAmount: t.invoices.totalAmount,
        amountPaid: t.invoices.amountPaid,
        progressPercent: t.invoices.progressPercent,
        issueDate: t.invoices.issueDate,
        dueDate: t.invoices.dueDate,
        milestoneId: t.invoices.milestoneId,
        createdAt: t.invoices.createdAt,
        projectId: t.invoices.projectId,
        projectCode: t.projects.code,
        projectName: t.projects.name,
        clientName: t.projects.clientName,
        createdByName: t.users.fullName,
      })
      .from(t.invoices)
      .innerJoin(t.projects, eq(t.projects.id, t.invoices.projectId))
      .leftJoin(t.users, eq(t.users.id, t.invoices.createdBy))
      .where(eq(t.invoices.id, id))
      .limit(1);
    if (!invoice) return null;

    const lines = await tx
      .select({
        id: t.invoiceLines.id,
        description: t.invoiceLines.description,
        amount: t.invoiceLines.amount,
        wbsCode: t.wbsCodes.code,
        wbsName: t.wbsCodes.name,
      })
      .from(t.invoiceLines)
      .leftJoin(t.wbsCodes, eq(t.wbsCodes.id, t.invoiceLines.wbsId))
      .where(eq(t.invoiceLines.invoiceId, id))
      .orderBy(asc(t.invoiceLines.sortOrder));

    const payments = await tx
      .select({
        id: t.payments.id,
        amount: t.payments.amount,
        paidDate: t.payments.paidDate,
        method: t.payments.method,
        reference: t.payments.reference,
        recordedByName: t.users.fullName,
      })
      .from(t.payments)
      .leftJoin(t.users, eq(t.users.id, t.payments.recordedBy))
      .where(eq(t.payments.invoiceId, id))
      .orderBy(desc(t.payments.paidDate), desc(t.payments.createdAt));

    let milestoneName: string | null = null;
    if (invoice.milestoneId) {
      const [ms] = await tx
        .select({ name: t.milestones.name })
        .from(t.milestones)
        .where(eq(t.milestones.id, invoice.milestoneId))
        .limit(1);
      milestoneName = ms?.name ?? null;
    }

    return { invoice, lines, payments, milestoneName };
  });

  if (!result) notFound();
  const { invoice, lines, payments, milestoneName } = result;

  const total = num(invoice.totalAmount);
  const paid = num(invoice.amountPaid);
  const outstanding = total - paid;
  const d = daysUntil(invoice.dueDate);
  const overdue =
    d !== null &&
    d < 0 &&
    outstanding > 0 &&
    (invoice.status === "sent" || invoice.status === "partially_paid");

  const canSend = invoice.status === "draft";
  const canPay = invoice.status === "sent" || invoice.status === "partially_paid";
  const canVoid = invoice.status !== "paid" && invoice.status !== "void";

  return (
    <div>
      <PageHeader
        title={invoice.number}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{invoice.title}</span>
            <Link
              href={`/projects/${invoice.projectId}`}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <FolderKanban className="size-3.5" /> {invoice.projectCode}
            </Link>
            {invoice.clientName && <span>{invoice.clientName}</span>}
            <span className="inline-flex items-center gap-1 capitalize">
              <Flag className="size-3.5" /> {invoice.type}
              {invoice.type === "progress" && invoice.progressPercent != null
                ? ` · ${num(invoice.progressPercent)}%`
                : milestoneName
                  ? ` · ${milestoneName}`
                  : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              Issued {formatDate(invoice.issueDate)} · Due {formatDate(invoice.dueDate)}
            </span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={invoice.status} tones={INVOICE_STATUS_TONE} />
            {canSend && (
              <ActionButton action={sendInvoice} fields={{ invoiceId: invoice.id }} size="sm">
                Send
              </ActionButton>
            )}
            {canPay && (
              <RecordPaymentDialog invoiceId={invoice.id} outstanding={outstanding} />
            )}
            {canVoid && (
              <ActionButton
                action={voidInvoice}
                fields={{ invoiceId: invoice.id }}
                variant="destructive"
                size="sm"
                confirm="Void this invoice? This cannot be undone."
              >
                Void
              </ActionButton>
            )}
          </div>
        }
      />

      {overdue && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">
          <CalendarClock className="size-4" />
          Overdue by {Math.abs(d!)} day{Math.abs(d!) === 1 ? "" : "s"} — {formatMoney(outstanding)} outstanding.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Subtotal" value={formatMoney(invoice.subtotal)} />
        <StatCard label="Total (incl. tax)" value={formatMoney(total)} />
        <StatCard label="Paid" value={formatMoney(paid)} tone="good" />
        <StatCard
          label="Outstanding"
          value={formatMoney(Math.max(0, outstanding))}
          tone={outstanding > 0 ? (overdue ? "critical" : "warning") : "good"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Line items" noPadding>
            {lines.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No line items" description="This invoice has no lines." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Description</th>
                      <th className="px-4 py-2.5 font-medium">Cost code</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="px-4 py-2.5">{l.description}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {l.wbsCode ? `${l.wbsCode} ${l.wbsName}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular">{formatMoney(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t">
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground" colSpan={2}>
                        Subtotal
                      </td>
                      <td className="px-4 py-2 text-right tabular">{formatMoney(invoice.subtotal)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground" colSpan={2}>
                        Tax
                      </td>
                      <td className="px-4 py-2 text-right tabular">{formatMoney(invoice.taxAmount)}</td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-4 py-2.5 text-right text-sm font-medium" colSpan={2}>
                        Total
                      </td>
                      <td className="px-4 py-2.5 text-right tabular font-semibold">
                        {formatMoney(total)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground" colSpan={2}>
                        Paid
                      </td>
                      <td className="px-4 py-2 text-right tabular text-good">{formatMoney(paid)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground" colSpan={2}>
                        Outstanding
                      </td>
                      <td className="px-4 py-2 text-right tabular font-medium">
                        {formatMoney(Math.max(0, outstanding))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Payments" description={`${payments.length} recorded`} noPadding>
          {payments.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No payments"
                description={
                  canPay
                    ? "Record a payment when the client settles this invoice."
                    : "Send the invoice to start collecting payments."
                }
              />
            </div>
          ) : (
            <div className="divide-y">
              {payments.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular">{formatMoney(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.paidDate)}
                      {p.method ? ` · ${p.method.replace(/_/g, " ")}` : ""}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                    {p.recordedByName && (
                      <p className="text-xs text-muted-foreground">by {p.recordedByName}</p>
                    )}
                  </div>
                  <StatusBadge tone="good">Received</StatusBadge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
