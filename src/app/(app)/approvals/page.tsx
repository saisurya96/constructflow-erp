import { aliasedTable, desc, eq } from "drizzle-orm";
import { BadgeCheck, Check, History } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { num, formatMoney } from "@/lib/money";
import { formatDateTime, fromNow, todayISO } from "@/lib/dates";
import { APPROVAL_STATUS_TONE, type BadgeTone } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusPill } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/app/action-button";
import { decideApproval } from "./actions";
import { RejectDialog } from "./dialogs";

/** Tone per approval type (no shared map exists for this enum). */
const APPROVAL_TYPE_TONE: Record<string, BadgeTone> = {
  purchase_order: "info",
  subcontract: "info",
  change_order: "warning",
  invoice: "good",
};

export default async function ApprovalsPage() {
  await requireCapability("approvals.decide");

  const data = await db(async (tx) => {
    const requester = aliasedTable(t.users, "requester");
    const decider = aliasedTable(t.users, "decider");

    const rows = await tx
      .select({
        id: t.approvals.id,
        type: t.approvals.type,
        title: t.approvals.title,
        amount: t.approvals.amount,
        status: t.approvals.status,
        projectId: t.approvals.projectId,
        projectCode: t.projects.code,
        projectName: t.projects.name,
        requestedByName: requester.fullName,
        decidedByName: decider.fullName,
        decisionNote: t.approvals.decisionNote,
        decidedAt: t.approvals.decidedAt,
        createdAt: t.approvals.createdAt,
      })
      .from(t.approvals)
      .leftJoin(t.projects, eq(t.projects.id, t.approvals.projectId))
      .leftJoin(requester, eq(requester.id, t.approvals.requestedBy))
      .leftJoin(decider, eq(decider.id, t.approvals.decidedBy))
      .orderBy(desc(t.approvals.createdAt));

    return rows;
  });

  const pending = data.filter((a) => a.status === "pending");
  const decided = data.filter((a) => a.status !== "pending").slice(0, 15);

  const pendingValue = pending.reduce((s, a) => s + num(a.amount), 0);
  const today = todayISO();
  const approvedToday = data.filter(
    (a) =>
      a.status === "approved" &&
      a.decidedAt &&
      new Date(a.decidedAt).toISOString().slice(0, 10) === today,
  ).length;
  const rejectedToday = data.filter(
    (a) =>
      a.status === "rejected" &&
      a.decidedAt &&
      new Date(a.decidedAt).toISOString().slice(0, 10) === today,
  ).length;

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Authorize purchase orders, change orders and invoices that exceed the approval threshold."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Pending"
          value={pending.length}
          tone={pending.length ? "warning" : "good"}
          sub="awaiting decision"
        />
        <StatCard
          label="Pending value"
          value={formatMoney(pendingValue, "AED", { compact: true })}
          tone={pendingValue > 0 ? "warning" : "neutral"}
        />
        <StatCard label="Approved today" value={approvedToday} tone={approvedToday ? "good" : "neutral"} />
        <StatCard label="Rejected today" value={rejectedToday} tone={rejectedToday ? "critical" : "neutral"} />
      </div>

      <SectionCard
        title="Pending approvals"
        description="Approving a PO releases it and commits cost; approving a change order applies it to the budget."
        noPadding
        className="mb-6"
      >
        {pending.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<BadgeCheck className="size-5" />}
              title="Nothing awaiting approval"
              description="Requests above the approval threshold land here for a decision."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Request</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Requested by</th>
                  <th className="px-4 py-2.5 font-medium">Age</th>
                  <th className="px-4 py-2.5 text-right font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <StatusPill status={a.type} tones={APPROVAL_TYPE_TONE} />
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-foreground">{a.title}</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {a.projectCode ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{formatMoney(a.amount)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {a.requestedByName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {fromNow(a.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <ActionButton
                        action={decideApproval}
                        fields={{ approvalId: a.id, decision: "approve" }}
                        confirm={`Approve "${a.title}"? This will take effect immediately.`}
                        size="xs"
                      >
                        <Check className="size-3.5" /> Approve
                      </ActionButton>
                      <RejectDialog approvalId={a.id} title={a.title} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recently decided" description="Latest decisions across all request types." noPadding>
        {decided.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<History className="size-5" />}
              title="No decisions yet"
              description="Approved and rejected requests will appear here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Request</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Outcome</th>
                  <th className="px-4 py-2.5 font-medium">Decided by</th>
                  <th className="px-4 py-2.5 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <StatusPill status={a.type} tones={APPROVAL_TYPE_TONE} />
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-foreground">{a.title}</span>
                      {a.decisionNote && (
                        <span className="block text-xs text-muted-foreground">
                          {a.decisionNote}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">{formatMoney(a.amount)}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={a.status} tones={APPROVAL_STATUS_TONE} />
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {a.decidedByName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {formatDateTime(a.decidedAt)}
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
