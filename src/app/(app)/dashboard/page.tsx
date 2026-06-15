import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { requireUser, db } from "@/lib/auth/context";
import { ROLE_LABELS, ROLE_TAGLINES } from "@/lib/rbac";
import type { UserRole } from "@/db/schema";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { ActionItemCard } from "@/components/app/action-item-card";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

/** Where each role goes to start work — surfaced on an empty dashboard. */
const PRIMARY_DESTINATION: Record<UserRole, { href: string; label: string }> = {
  admin: { href: "/projects", label: "Set up a project" },
  pm: { href: "/projects", label: "Set up a project" },
  buyer: { href: "/requirements", label: "Open the sourcing inbox" },
  storekeeper: { href: "/deliveries", label: "Go to deliveries" },
  finance: { href: "/billing", label: "Go to billing" },
};
import {
  pmDashboard,
  buyerDashboard,
  storekeeperDashboard,
  financeDashboard,
  type DashboardView,
} from "./views";

export default async function DashboardPage() {
  const user = await requireUser();

  const view: DashboardView = await db(async (tx) => {
    switch (user.role) {
      case "buyer":
        return buyerDashboard(tx);
      case "storekeeper":
        return storekeeperDashboard(tx);
      case "finance":
        return financeDashboard(tx);
      case "pm":
      case "admin":
      default:
        return pmDashboard(tx);
    }
  });

  const firstName = user.fullName.split(" ")[0];
  const kpiCols =
    view.kpis.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";

  return (
    <div>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={`${ROLE_LABELS[user.role]} — ${ROLE_TAGLINES[user.role]}`}
      />

      <div className={`mb-6 grid grid-cols-2 gap-3 ${kpiCols}`}>
        {view.kpis.map((kpi) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            sub={kpi.sub}
            tone={kpi.tone}
          />
        ))}
      </div>

      <SectionCard
        title={view.queueTitle}
        description={view.queueDescription}
        contentClassName="space-y-2.5"
      >
        {view.queue.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="size-5" />}
            title="You're all caught up"
            description="Nothing needs your attention right now. New items appear here as work flows through — jump in to get started."
            action={
              <Button size="sm" render={<Link href={PRIMARY_DESTINATION[user.role].href} />}>
                {PRIMARY_DESTINATION[user.role].label} <ArrowRight className="size-4" />
              </Button>
            }
          />
        ) : (
          view.queue.map((item, i) => (
            <ActionItemCard
              key={`${item.title}-${i}`}
              tone={item.tone}
              title={item.title}
              detail={item.detail}
              impact={item.impact}
              owner={item.owner}
              href={item.href}
              actionLabel={item.actionLabel}
            />
          ))
        )}
      </SectionCard>
    </div>
  );
}
