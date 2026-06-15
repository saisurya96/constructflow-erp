import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { Receipt } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { num, formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { daysUntil } from "@/lib/severity";
import { INVOICE_STATUS_TONE } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusPill } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { CreateInvoiceDialog, type ProjectOption } from "./dialogs";

export default async function BillingPage() {
  const user = await requireCapability("billing.manage");
  const currency = user.currencyCode;

  const data = await db(async (tx) => {
    const invoices = await tx
      .select({
        id: t.invoices.id,
        number: t.invoices.number,
        type: t.invoices.type,
        title: t.invoices.title,
        status: t.invoices.status,
        totalAmount: t.invoices.totalAmount,
        amountPaid: t.invoices.amountPaid,
        dueDate: t.invoices.dueDate,
        issueDate: t.invoices.issueDate,
        projectId: t.invoices.projectId,
        projectCode: t.projects.code,
        projectName: t.projects.name,
      })
      .from(t.invoices)
      .innerJoin(t.projects, eq(t.projects.id, t.invoices.projectId))
      .orderBy(desc(t.invoices.createdAt))
      .limit(200);

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
        sortOrder: t.wbsCodes.sortOrder,
      })
      .from(t.wbsCodes)
      .orderBy(asc(t.wbsCodes.sortOrder), asc(t.wbsCodes.code));

    const milestones = await tx
      .select({
        id: t.milestones.id,
        projectId: t.milestones.projectId,
        name: t.milestones.name,
        status: t.milestones.status,
        billingAmount: t.milestones.billingAmount,
        sortOrder: t.milestones.sortOrder,
      })
      .from(t.milestones)
      .orderBy(asc(t.milestones.sortOrder));

    return { invoices, projects, wbs, milestones };
  });

  // Build the per-project option payload for the create dialog.
  const projectOptions: ProjectOption[] = data.projects.map((p) => ({
    id: p.id,
    label: `${p.code} — ${p.name}`,
    wbs: data.wbs
      .filter((w) => w.projectId === p.id)
      .map((w) => ({ id: w.id, label: `${w.code} — ${w.name}` })),
    milestones: data.milestones
      .filter((m) => m.projectId === p.id && (m.status === "reached" || m.status === "pending"))
      .map((m) => ({ id: m.id, label: m.name, amount: num(m.billingAmount) })),
  }));

  const rows = data.invoices.map((inv) => {
    const total = num(inv.totalAmount);
    const paid = num(inv.amountPaid);
    const outstanding = total - paid;
    const d = daysUntil(inv.dueDate);
    const overdue =
      d !== null &&
      d < 0 &&
      outstanding > 0 &&
      (inv.status === "sent" || inv.status === "partially_paid");
    return { inv, total, paid, outstanding, overdue };
  });

  const open = rows.filter((r) => r.inv.status !== "void");
  const billed = open.reduce((s, r) => s + r.total, 0);
  const collected = open.reduce((s, r) => s + r.paid, 0);
  const outstanding = open.reduce((s, r) => s + Math.max(0, r.outstanding), 0);
  const overdueCount = rows.filter((r) => r.overdue).length;

  return (
    <div>
      <PageHeader
        eyebrow="Revenue · billing"
        title="Billing"
        description="Client invoicing — milestone and progress applications, payments and collections."
        actions={<CreateInvoiceDialog projects={projectOptions} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Billed" value={formatMoney(billed, currency, { compact: true })} />
        <StatCard
          label="Collected"
          value={formatMoney(collected, currency, { compact: true })}
          tone="good"
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstanding, currency, { compact: true })}
          tone={outstanding > 0 ? "warning" : "good"}
        />
        <StatCard
          label="Overdue"
          value={overdueCount}
          tone={overdueCount ? "critical" : "good"}
          sub={overdueCount ? "past due date" : "none overdue"}
        />
      </div>

      <SectionCard noPadding>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Receipt className="size-5" />}
              title="No invoices yet"
              description="Raise milestone or progress invoices to bill clients and track collections."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Invoice</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                  <th className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                  <th className="px-4 py-2.5 font-medium">Due</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ inv, total, paid, outstanding, overdue }) => (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/billing/${inv.id}`} className="block">
                        <span className="font-medium text-foreground hover:underline">
                          {inv.number}
                        </span>
                        <span className="block text-xs text-muted-foreground">{inv.title}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/projects/${inv.projectId}`}
                        className="text-muted-foreground hover:underline"
                      >
                        {inv.projectCode}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 capitalize text-muted-foreground">{inv.type}</td>
                    <td className="px-4 py-2.5 text-right tabular">{formatMoney(total, currency)}</td>
                    <td className="px-4 py-2.5 text-right tabular text-good">{formatMoney(paid, currency)}</td>
                    <td
                      className={`px-4 py-2.5 text-right tabular ${
                        outstanding > 0 ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {formatMoney(Math.max(0, outstanding), currency)}
                    </td>
                    <td className={`px-4 py-2.5 ${overdue ? "text-critical font-medium" : ""}`}>
                      {formatDate(inv.dueDate)}
                      {overdue && <span className="block text-xs">overdue</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={inv.status} tones={INVOICE_STATUS_TONE} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
