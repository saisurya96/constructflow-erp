import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { RFQ_STATUS_TONE } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusPill } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export default async function RfqsPage() {
  await requireCapability("procurement.manage");

  const data = await db(async (tx) => {
    const rfqs = await tx
      .select({
        id: t.rfqs.id,
        number: t.rfqs.number,
        title: t.rfqs.title,
        status: t.rfqs.status,
        dueDate: t.rfqs.dueDate,
        projectCode: t.projects.code,
        projectId: t.rfqs.projectId,
      })
      .from(t.rfqs)
      .leftJoin(t.projects, eq(t.projects.id, t.rfqs.projectId))
      .orderBy(desc(t.rfqs.createdAt))
      .limit(200);

    const invited = await tx
      .select({
        rfqId: t.rfqVendors.rfqId,
        c: sql<string>`count(*)`,
      })
      .from(t.rfqVendors)
      .groupBy(t.rfqVendors.rfqId);

    const received = await tx
      .select({
        rfqId: t.vendorQuotes.rfqId,
        c: sql<string>`count(*) filter (where ${t.vendorQuotes.status} <> 'pending')`,
      })
      .from(t.vendorQuotes)
      .groupBy(t.vendorQuotes.rfqId);

    return { rfqs, invited, received };
  });

  const invitedMap = new Map(data.invited.map((r) => [r.rfqId, Number(r.c)]));
  const receivedMap = new Map(data.received.map((r) => [r.rfqId, Number(r.c)]));

  const open = data.rfqs.filter((r) => !["awarded", "cancelled"].includes(r.status));
  const awaiting = data.rfqs.filter(
    (r) => ["draft", "issued"].includes(r.status) && (receivedMap.get(r.id) ?? 0) === 0,
  );
  const awarded = data.rfqs.filter((r) => r.status === "awarded");

  return (
    <div>
      <PageHeader
        eyebrow="Sourcing · RFQ"
        title="RFQs & sourcing"
        description="Send requests for quotation, compare vendor bids and award the winner."
        actions={
          <Button size="sm" render={<Link href="/rfqs/new" />}>
            <Plus className="size-4" /> New RFQ
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open RFQs" value={open.length} tone={open.length ? "info" : "neutral"} />
        <StatCard
          label="Awaiting quotes"
          value={awaiting.length}
          tone={awaiting.length ? "warning" : "good"}
        />
        <StatCard label="Awarded" value={awarded.length} tone="good" />
        <StatCard label="Total RFQs" value={data.rfqs.length} />
      </div>

      <SectionCard noPadding>
        {data.rfqs.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<FileText className="size-5" />}
              title="No RFQs yet"
              description="Raise an RFQ from a requirement, or start a fresh one to source material."
              action={
                <Button size="sm" render={<Link href="/rfqs/new" />}>
                  <Plus className="size-4" /> New RFQ
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">RFQ</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Due</th>
                  <th className="px-4 py-2.5 text-right font-medium">Invited</th>
                  <th className="px-4 py-2.5 text-right font-medium">Quotes</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rfqs.map((r) => {
                  const inv = invitedMap.get(r.id) ?? 0;
                  const rec = receivedMap.get(r.id) ?? 0;
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <Link href={`/rfqs/${r.id}`} className="block">
                          <span className="font-medium text-foreground hover:underline">
                            {r.title}
                          </span>
                          <span className="block text-xs text-muted-foreground">{r.number}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {r.projectId ? (
                          <Link href={`/projects/${r.projectId}`} className="hover:underline">
                            {r.projectCode ?? "—"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5">{formatDate(r.dueDate)}</td>
                      <td className="px-4 py-2.5 text-right tabular">{inv}</td>
                      <td className="px-4 py-2.5 text-right tabular">
                        <span className={rec > 0 ? "text-good" : "text-muted-foreground"}>
                          {rec}/{inv}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={r.status} tones={RFQ_STATUS_TONE} />
                      </td>
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
