import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { num } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { titleCase } from "@/lib/constants";
import { DocumentSheet } from "@/components/app/document-sheet";

export default async function RfqPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCapability("procurement.manage");

  const result = await db(async (tx) => {
    const [rfq] = await tx
      .select({
        number: t.rfqs.number,
        title: t.rfqs.title,
        status: t.rfqs.status,
        dueDate: t.rfqs.dueDate,
        notes: t.rfqs.notes,
        createdAt: t.rfqs.createdAt,
        projectName: t.projects.name,
        projectCode: t.projects.code,
      })
      .from(t.rfqs)
      .leftJoin(t.projects, eq(t.projects.id, t.rfqs.projectId))
      .where(eq(t.rfqs.id, id))
      .limit(1);
    if (!rfq) return null;

    const lines = await tx
      .select({
        id: t.rfqLines.id,
        itemName: t.rfqLines.itemName,
        unit: t.rfqLines.unit,
        quantity: t.rfqLines.quantity,
      })
      .from(t.rfqLines)
      .where(eq(t.rfqLines.rfqId, id))
      .orderBy(asc(t.rfqLines.sortOrder));

    const vendors = await tx
      .select({ name: t.vendors.name })
      .from(t.rfqVendors)
      .innerJoin(t.vendors, eq(t.vendors.id, t.rfqVendors.vendorId))
      .where(eq(t.rfqVendors.rfqId, id));

    const [company] = await tx
      .select({
        name: t.companies.name,
        address: t.companies.address,
        country: t.companies.country,
      })
      .from(t.companies)
      .limit(1);

    return { rfq, lines, vendors, company };
  });

  if (!result) notFound();
  const { rfq, lines, vendors, company } = result;

  return (
    <DocumentSheet
      company={company ?? { name: "Company" }}
      docType="Request for Quote"
      number={rfq.number}
      meta={[
        { label: "Status", value: titleCase(rfq.status) },
        { label: "Issued", value: formatDate(rfq.createdAt) },
        { label: "Respond by", value: formatDate(rfq.dueDate) },
      ]}
      parties={[
        ...(rfq.projectName
          ? [{ label: "Project", lines: [rfq.projectName, rfq.projectCode] }]
          : []),
        ...(vendors.length
          ? [{ label: "Invited vendors", lines: vendors.map((v) => v.name) }]
          : []),
      ]}
      footer={
        <div className="space-y-2">
          {rfq.notes && <p>{rfq.notes}</p>}
          <p>
            Please submit your best price and lead time for the items below by the
            response date. Prices should be inclusive of delivery unless noted.
          </p>
        </div>
      }
    >
      <p className="mb-3 text-sm font-medium text-foreground">{rfq.title}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <th className="py-2 pr-2 font-medium w-10">#</th>
            <th className="py-2 px-2 font-medium">Item</th>
            <th className="py-2 px-2 text-right font-medium">Quantity</th>
            <th className="py-2 pl-2 text-right font-medium w-40">Your unit price</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="border-b">
              <td className="py-2 pr-2 text-muted-foreground tabular">{i + 1}</td>
              <td className="py-2 px-2 font-medium text-foreground">{l.itemName}</td>
              <td className="py-2 px-2 text-right tabular">
                {num(l.quantity)} {l.unit}
              </td>
              <td className="py-2 pl-2" />
            </tr>
          ))}
        </tbody>
      </table>
    </DocumentSheet>
  );
}
