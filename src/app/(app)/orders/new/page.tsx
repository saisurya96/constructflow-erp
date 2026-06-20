import { asc, eq } from "drizzle-orm";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { num } from "@/lib/money";
import { PageHeader } from "@/components/app/page-header";
import { NewPoForm } from "../dialogs";

export default async function NewPoPage({
  searchParams,
}: {
  searchParams: Promise<{ requirementId?: string }>;
}) {
  const user = await requireCapability("procurement.manage");
  const { requirementId } = await searchParams;

  const data = await db(async (tx) => {
    const vendors = await tx
      .select({ id: t.vendors.id, name: t.vendors.name })
      .from(t.vendors)
      .where(eq(t.vendors.isActive, true))
      .orderBy(asc(t.vendors.name));

    const projects = await tx
      .select({ id: t.projects.id, code: t.projects.code, name: t.projects.name })
      .from(t.projects)
      .orderBy(asc(t.projects.code));

    const wbs = await tx
      .select({
        id: t.wbsCodes.id,
        projectId: t.wbsCodes.projectId,
        code: t.wbsCodes.code,
        name: t.wbsCodes.name,
      })
      .from(t.wbsCodes)
      .orderBy(asc(t.wbsCodes.sortOrder), asc(t.wbsCodes.code));

    let requirement = null as
      | {
          id: string;
          itemName: string;
          unit: string;
          quantity: string;
          unitCost: string;
          projectId: string;
          wbsId: string | null;
        }
      | null;
    if (requirementId) {
      const [req] = await tx
        .select({
          id: t.projectRequirements.id,
          itemName: t.projectRequirements.itemName,
          unit: t.projectRequirements.unit,
          quantity: t.projectRequirements.quantity,
          estimatedUnitCost: t.projectRequirements.estimatedUnitCost,
          projectId: t.projectRequirements.projectId,
          wbsId: t.projectRequirements.wbsId,
        })
        .from(t.projectRequirements)
        .where(eq(t.projectRequirements.id, requirementId))
        .limit(1);
      if (req) {
        requirement = {
          id: req.id,
          itemName: req.itemName,
          unit: req.unit,
          quantity: String(num(req.quantity)),
          unitCost: String(num(req.estimatedUnitCost)),
          projectId: req.projectId,
          wbsId: req.wbsId,
        };
      }
    }

    return { vendors, projects, wbs, requirement };
  });

  const vendorOptions = data.vendors.map((v) => ({ id: v.id, label: v.name }));
  const projectOptions = data.projects.map((p) => ({
    id: p.id,
    label: `${p.code} — ${p.name}`,
  }));
  const wbsByProject: Record<string, { id: string; label: string }[]> = {};
  for (const w of data.wbs) {
    (wbsByProject[w.projectId] ??= []).push({ id: w.id, label: `${w.code} — ${w.name}` });
  }

  const req = data.requirement;
  // Pre-fill a single line linked to the requirement; the buyer only picks the
  // vendor and confirms the price. Releasing this PO clears the requirement's
  // shortage — the same coverage path an RFQ award uses, without the bidding.
  const defaults = req
    ? {
        type: "purchase_order",
        vendorId: "",
        projectId: req.projectId,
        title: `Supply: ${req.itemName}`,
        expectedDate: null,
        paymentTerms: null,
        notes: null,
        lines: [
          {
            itemName: req.itemName,
            unit: req.unit,
            quantity: req.quantity,
            unitPrice: req.unitCost,
            wbsId: req.wbsId,
            requirementId: req.id,
          },
        ],
      }
    : undefined;

  return (
    <div>
      <PageHeader
        backHref="/orders"
        backLabel="All orders"
        eyebrow="Purchase order"
        title="New purchase order"
        description={
          req
            ? `Ordering ${req.itemName} against the linked requirement — coverage updates when the order is released.`
            : "Raise a purchase order or subcontract directly."
        }
      />

      <div className="max-w-3xl">
        <NewPoForm
          vendorOptions={vendorOptions}
          projectOptions={projectOptions}
          wbsByProject={wbsByProject}
          defaults={defaults}
          currency={user.currencyCode}
        />
      </div>
    </div>
  );
}
