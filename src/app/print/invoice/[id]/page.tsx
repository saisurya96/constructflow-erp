import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { num, formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { titleCase } from "@/lib/constants";
import { DocumentSheet } from "@/components/app/document-sheet";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCapability("billing.manage");

  const result = await db(async (tx) => {
    const [inv] = await tx
      .select({
        number: t.invoices.number,
        title: t.invoices.title,
        type: t.invoices.type,
        status: t.invoices.status,
        subtotal: t.invoices.subtotal,
        taxAmount: t.invoices.taxAmount,
        totalAmount: t.invoices.totalAmount,
        amountPaid: t.invoices.amountPaid,
        issueDate: t.invoices.issueDate,
        dueDate: t.invoices.dueDate,
        projectName: t.projects.name,
        projectCode: t.projects.code,
        clientName: t.projects.clientName,
      })
      .from(t.invoices)
      .innerJoin(t.projects, eq(t.projects.id, t.invoices.projectId))
      .where(eq(t.invoices.id, id))
      .limit(1);
    if (!inv) return null;

    const lines = await tx
      .select({
        id: t.invoiceLines.id,
        description: t.invoiceLines.description,
        amount: t.invoiceLines.amount,
        wbsCode: t.wbsCodes.code,
      })
      .from(t.invoiceLines)
      .leftJoin(t.wbsCodes, eq(t.wbsCodes.id, t.invoiceLines.wbsId))
      .where(eq(t.invoiceLines.invoiceId, id))
      .orderBy(asc(t.invoiceLines.sortOrder));

    const [company] = await tx
      .select({
        name: t.companies.name,
        address: t.companies.address,
        country: t.companies.country,
      })
      .from(t.companies)
      .limit(1);

    return { inv, lines, company };
  });

  if (!result) notFound();
  const { inv, lines, company } = result;
  const balance = num(inv.totalAmount) - num(inv.amountPaid);

  return (
    <DocumentSheet
      company={company ?? { name: "Company" }}
      docType="Tax Invoice"
      number={inv.number}
      meta={[
        { label: "Status", value: titleCase(inv.status) },
        { label: "Issued", value: formatDate(inv.issueDate) },
        { label: "Due", value: formatDate(inv.dueDate) },
      ]}
      parties={[
        {
          label: "Bill to",
          lines: [inv.clientName ?? inv.projectName, inv.projectName, inv.projectCode],
        },
      ]}
      footer={
        <p>
          Please remit payment by the due date, quoting invoice {inv.number}.
          Thank you for your business.
        </p>
      }
    >
      <p className="mb-3 text-sm font-medium text-foreground">{inv.title}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <th className="py-2 pr-2 font-medium">Description</th>
            <th className="py-2 pl-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr className="border-b">
              <td className="py-2 pr-2 text-foreground">{inv.title}</td>
              <td className="py-2 pl-2 text-right tabular">
                {formatMoney(inv.subtotal)}
              </td>
            </tr>
          ) : (
            lines.map((l) => (
              <tr key={l.id} className="border-b">
                <td className="py-2 pr-2">
                  <span className="text-foreground">{l.description}</span>
                  {l.wbsCode && (
                    <span className="block text-xs text-muted-foreground">
                      {l.wbsCode}
                    </span>
                  )}
                </td>
                <td className="py-2 pl-2 text-right tabular">
                  {formatMoney(l.amount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <dl className="w-64 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular">{formatMoney(inv.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">VAT</dt>
            <dd className="tabular">{formatMoney(inv.taxAmount)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <dt>Total</dt>
            <dd className="tabular">{formatMoney(inv.totalAmount)}</dd>
          </div>
          {num(inv.amountPaid) > 0 && (
            <>
              <div className="flex justify-between text-muted-foreground">
                <dt>Paid</dt>
                <dd className="tabular">−{formatMoney(inv.amountPaid)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1.5 font-semibold">
                <dt>Balance due</dt>
                <dd className="tabular">{formatMoney(balance)}</dd>
              </div>
            </>
          )}
        </dl>
      </div>
    </DocumentSheet>
  );
}
