import { redirect } from "next/navigation";
import { aliasedTable, asc, desc, eq, ne } from "drizzle-orm";
import { BadgeCheck, Check, History } from "lucide-react";
import { requireUser, db } from "@/lib/auth/context";
import { can } from "@/lib/rbac";
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
  const user = await requireUser();
  const currency = user.currencyCode;
  const canDecide = can(user.role, "approvals.decide");
  // Deciders (finance/admin) act here; requesters (PM/buyer) get a read-only
  // view so they can see the status and reason for their own submissions.
  if (
    !canDecide &&
    !can(user.role, "requirements.raise") &&
    !can(user.role, "procurement.manage")
  ) {
    redirect("/forbidden");
  }

  const { pending, decided } = await db(async (tx) => {
    const requester = aliasedTable(t.users, "requester");
    const decider = aliasedTable(t.users, "decider");
    const cols = {
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
    };
    // Pending: never capped, oldest first (so nothing silently drops off a
    // recent-N window). Decided: a recent slice for context.
    const pending = await tx
      .select(cols)
      .from(t.approvals)
      .leftJoin(t.projects, eq(t.projects.id, t.approvals.projectId))
      .leftJoin(requester, eq(requester.id, t.approvals.requestedBy))
      .leftJoin(decider, eq(decider.id, t.approvals.decidedBy))
      .where(eq(t.approvals.status, "pending"))
      .orderBy(asc(t.approvals.createdAt));
    const decided = await tx
      .select(cols)
      .from(t.approvals)
      .leftJoin(t.projects, eq(t.projects.id, t.approvals.projectId))
      .leftJoin(requester, eq(requester.id, t.approvals.requestedBy))
      .leftJoin(decider, eq(decider.id, t.approvals.decidedBy))
      .where(ne(t.approvals.status, "pending"))
      .orderBy(desc(t.approvals.decidedAt))
      .limit(50);
    return { pending, decided };
  });

  const pendingValue = pending.reduce((s, a) => s + num(a.amount), 0);
  const today = todayISO();
  const isToday = (d: Date | null) =>
    !!d && new Date(d).toISOString().slice(0, 10) === today;
  const approvedToday = decided.filter((a) => a.status === "approved" && isToday(a.decidedAt)).length;
  const rejectedToday = decided.filter((a) => a.status === "rejected" && isToday(a.decidedAt)).length;

  return (
    <div>
      <PageHeader
        eyebrow="Authorisations"
        title="Approvals"
        description={
          canDecide
            ? "Authorize purchase orders and change orders that exceed the approval threshold."
            : "Track the status of submissions awaiting authorisation."
        }
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
          value={formatMoney(pendingValue, currency, { compact: true })}
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
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Request</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Requested by</th>
                  <th className="px-4 py-2.5 font-medium">Age</th>
                  <th className="px-4 py-2.5 text-right font-medium">{canDecide ? "Decision" : "Status"}</th>
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
                    <td className="px-4 py-2.5 text-right tabular">{formatMoney(a.amount, currency)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {a.requestedByName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {fromNow(a.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {canDecide ? (
                        <>
                          <ActionButton
                            action={decideApproval}
                            fields={{ approvalId: a.id, decision: "approve" }}
                            confirm={`Approve "${a.title}"? This will take effect immediately.`}
                            size="xs"
                          >
                            <Check className="size-3.5" /> Approve
                          </ActionButton>
                          <RejectDialog approvalId={a.id} title={a.title} />
                        </>
                      ) : (
                        <StatusPill status={a.status} tones={APPROVAL_STATUS_TONE} />
                      )}
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
                <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
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
                    <td className="px-4 py-2.5 text-right tabular">{formatMoney(a.amount, currency)}</td>
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
