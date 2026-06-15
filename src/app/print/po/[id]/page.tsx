import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { num, formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { titleCase } from "@/lib/constants";
import { DocumentSheet } from "@/components/app/document-sheet";

export default async function PoPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCapability("procurement.manage");

  const result = await db(async (tx) => {
    const [po] = await tx
      .select({
        number: t.purchaseOrders.number,
        type: t.purchaseOrders.type,
        title: t.purchaseOrders.title,
        status: t.purchaseOrders.status,
        subtotal: t.purchaseOrders.subtotal,
        taxAmount: t.purchaseOrders.taxAmount,
        totalAmount: t.purchaseOrders.totalAmount,
        expectedDate: t.purchaseOrders.expectedDate,
        paymentTerms: t.purchaseOrders.paymentTerms,
        releasedAt: t.purchaseOrders.releasedAt,
        createdAt: t.purchaseOrders.createdAt,
        notes: t.purchaseOrders.notes,
        vendorName: t.vendors.name,
        vendorCategory: t.vendors.category,
        vendorAddress: t.vendors.address,
        projectCode: t.projects.code,
        projectName: t.projects.name,
      })
      .from(t.purchaseOrders)
      .innerJoin(t.vendors, eq(t.vendors.id, t.purchaseOrders.vendorId))
      .leftJoin(t.projects, eq(t.projects.id, t.purchaseOrders.projectId))
      .where(eq(t.purchaseOrders.id, id))
      .limit(1);
    if (!po) return null;

    const lines = await tx
      .select({
        id: t.purchaseOrderLines.id,
        itemName: t.purchaseOrderLines.itemName,
        unit: t.purchaseOrderLines.unit,
        quantity: t.purchaseOrderLines.quantity,
        unitPrice: t.purchaseOrderLines.unitPrice,
        lineTotal: t.purchaseOrderLines.lineTotal,
        wbsCode: t.wbsCodes.code,
      })
      .from(t.purchaseOrderLines)
      .leftJoin(t.wbsCodes, eq(t.wbsCodes.id, t.purchaseOrderLines.wbsId))
      .where(eq(t.purchaseOrderLines.poId, id))
      .orderBy(asc(t.purchaseOrderLines.sortOrder));

    const [company] = await tx
      .select({
        name: t.companies.name,
        address: t.companies.address,
        country: t.companies.country,
        currencyCode: t.companies.currencyCode,
      })
      .from(t.companies)
      .limit(1);

    return { po, lines, company };
  });

  if (!result) notFound();
  const { po, lines, company } = result;
  const currency = company?.currencyCode ?? "AED";
  const isSub = po.type === "subcontract";

  return (
    <DocumentSheet
      company={company ?? { name: "Company" }}
      docType={isSub ? "Subcontract" : "Purchase Order"}
      number={po.number}
      meta={[
        { label: "Status", value: titleCase(po.status) },
        { label: "Issued", value: formatDate(po.releasedAt ?? po.createdAt) },
        { label: "Expected", value: formatDate(po.expectedDate) },
      ]}
      parties={[
        {
          label: "Vendor",
          lines: [
            po.vendorName,
            po.vendorCategory ? titleCase(po.vendorCategory) : null,
            po.vendorAddress,
          ],
        },
        ...(po.projectName
          ? [
              {
                label: "Project",
                lines: [po.projectName, po.projectCode],
              },
            ]
          : []),
      ]}
      footer={
        <div className="space-y-2">
          {po.paymentTerms && (
            <p>
              <span className="font-medium text-foreground">Payment terms:</span>{" "}
              {po.paymentTerms}
            </p>
          )}
          {po.notes && <p>{po.notes}</p>}
          <p>
            This {isSub ? "subcontract" : "purchase order"} is issued subject to
            the agreed terms. Please confirm acceptance and advise delivery.
          </p>
        </div>
      }
    >
      <p className="mb-3 text-sm font-medium text-foreground">{po.title}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <th className="py-2 pr-2 font-medium">Item</th>
            <th className="py-2 px-2 text-right font-medium">Qty</th>
            <th className="py-2 px-2 text-right font-medium">Unit price</th>
            <th className="py-2 pl-2 text-right font-medium">Line total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2 pr-2">
                <span className="font-medium text-foreground">{l.itemName}</span>
                {l.wbsCode && (
                  <span className="block text-xs text-muted-foreground">
                    {l.wbsCode}
                  </span>
                )}
              </td>
              <td className="py-2 px-2 text-right tabular">
                {num(l.quantity)} {l.unit}
              </td>
              <td className="py-2 px-2 text-right tabular">
                {formatMoney(l.unitPrice, currency)}
              </td>
              <td className="py-2 pl-2 text-right tabular">
                {formatMoney(l.lineTotal, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <dl className="w-64 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular">{formatMoney(po.subtotal, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">VAT</dt>
            <dd className="tabular">{formatMoney(po.taxAmount, currency)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <dt>Total</dt>
            <dd className="tabular">{formatMoney(po.totalAmount, currency)}</dd>
          </div>
        </dl>
      </div>
    </DocumentSheet>
  );
}
