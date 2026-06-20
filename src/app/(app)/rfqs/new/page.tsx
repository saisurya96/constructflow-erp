import { asc, eq } from "drizzle-orm";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { num } from "@/lib/money";
import { PageHeader } from "@/components/app/page-header";
import { NewRfqForm } from "../new-form";

export default async function NewRfqPage({
  searchParams,
}: {
  searchParams: Promise<{ requirementId?: string }>;
}) {
  await requireCapability("procurement.manage");
  const { requirementId } = await searchParams;

  const data = await db(async (tx) => {
    const projects = await tx
      .select({ id: t.projects.id, code: t.projects.code, name: t.projects.name })
      .from(t.projects)
      .orderBy(asc(t.projects.code));

    const vendors = await tx
      .select({
        id: t.vendors.id,
        name: t.vendors.name,
        category: t.vendors.category,
      })
      .from(t.vendors)
      .where(eq(t.vendors.isActive, true))
      .orderBy(asc(t.vendors.name));

    let requirement = null as
      | {
          id: string;
          itemName: string;
          unit: string;
          quantity: string;
          projectId: string;
        }
      | null;
    if (requirementId) {
      const [req] = await tx
        .select({
          id: t.projectRequirements.id,
          itemName: t.projectRequirements.itemName,
          unit: t.projectRequirements.unit,
          quantity: t.projectRequirements.quantity,
          projectId: t.projectRequirements.projectId,
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
          projectId: req.projectId,
        };
      }
    }

    return { projects, vendors, requirement };
  });

  const projectOptions = data.projects.map((p) => ({
    id: p.id,
    label: `${p.code} — ${p.name}`,
  }));
  const vendorOptions = data.vendors.map((v) => ({
    id: v.id,
    label: v.name,
    category: v.category,
  }));

  return (
    <div>
      <PageHeader
        backHref="/rfqs"
        backLabel="All RFQs"
        eyebrow="Request for quote"
        title="New RFQ"
        description={
          data.requirement
            ? `Sourcing ${data.requirement.itemName} for the linked requirement.`
            : "Request quotes from invited vendors and compare them side by side."
        }
      />

      <div className="max-w-3xl">
        <NewRfqForm
          projectOptions={projectOptions}
          vendorOptions={vendorOptions}
          requirement={data.requirement}
        />
      </div>
    </div>
  );
}
