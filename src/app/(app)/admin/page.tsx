import { asc, desc, eq } from "drizzle-orm";
import { Users, ShieldCheck, UserCheck, Building2 } from "lucide-react";
import { requireCapability, db } from "@/lib/auth/context";
import * as t from "@/db/schema";
import { ROLE_LABELS } from "@/lib/rbac";
import { formatMoney, formatPercent } from "@/lib/money";
import { fromNow } from "@/lib/dates";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  InviteUserDialog,
  RoleControl,
  ActiveControl,
  EditUserDialog,
  ResetPasswordDialog,
  CompanySettingsForm,
} from "./dialogs";

export default async function AdminPage() {
  const user = await requireCapability("admin.manage");

  const data = await db(async (tx, ctx) => {
    const users = await tx
      .select()
      .from(t.users)
      .orderBy(desc(t.users.isActive), asc(t.users.fullName));
    const [company] = await tx
      .select()
      .from(t.companies)
      .where(eq(t.companies.id, ctx.companyId))
      .limit(1);
    return { users, company };
  });

  const activeCount = data.users.filter((u) => u.isActive).length;
  const adminCount = data.users.filter((u) => u.role === "admin" && u.isActive).length;
  const everSignedIn = data.users.filter((u) => u.lastLoginAt).length;
  const loginRate =
    data.users.length > 0 ? (everSignedIn / data.users.length) * 100 : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Administration"
        description="Manage your team, their access, and company-wide settings."
        actions={<InviteUserDialog />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Team members"
          value={data.users.length}
          sub={`${activeCount} active`}
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Active users"
          value={activeCount}
          sub={`${data.users.length - activeCount} inactive`}
          tone="good"
          icon={<UserCheck className="size-4" />}
        />
        <StatCard
          label="Administrators"
          value={adminCount}
          sub="with full access"
          tone={adminCount > 0 ? "info" : "warning"}
          icon={<ShieldCheck className="size-4" />}
        />
        <StatCard
          label="Have signed in"
          value={formatPercent(loginRate)}
          sub={`${everSignedIn} of ${data.users.length}`}
          icon={<Building2 className="size-4" />}
        />
      </div>

      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="company">Company settings</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="space-y-4">
          <SectionCard
            title="Team & access"
            description="Set each person's role to control what they can see and do."
            noPadding
          >
            {data.users.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Users className="size-5" />}
                  title="No team members yet"
                  description="Add your first colleague to give them access to ConstructFlow."
                  action={<InviteUserDialog />}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left font-mono text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Member</th>
                      <th className="px-4 py-2.5 font-medium w-48">Role</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Last login</th>
                      <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => {
                      const isSelf = u.id === user.userId;
                      return (
                        <tr
                          key={u.id}
                          className="border-b last:border-0 hover:bg-muted/40"
                        >
                          <td className="px-4 py-2.5">
                            <span className="block font-medium text-foreground">
                              {u.fullName}
                              {isSelf && (
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                  (you)
                                </span>
                              )}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {u.email}
                              {u.title ? ` · ${u.title}` : ""}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {isSelf ? (
                              <StatusBadge tone="info">
                                {ROLE_LABELS[u.role]}
                              </StatusBadge>
                            ) : (
                              <RoleControl userId={u.id} role={u.role} />
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {u.isActive ? (
                              <StatusBadge tone="good">Active</StatusBadge>
                            ) : (
                              <StatusBadge tone="neutral">Inactive</StatusBadge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {u.lastLoginAt ? fromNow(u.lastLoginAt) : "Never"}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <EditUserDialog
                                user={{
                                  id: u.id,
                                  fullName: u.fullName,
                                  email: u.email,
                                  title: u.title,
                                  phone: u.phone,
                                }}
                              />
                              <ResetPasswordDialog userId={u.id} userName={u.fullName} />
                              <ActiveControl
                                userId={u.id}
                                active={u.isActive}
                                disabled={isSelf}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="company">
          <SectionCard
            title="Company settings"
            description="These defaults drive currency, tax and procurement approvals across every module."
          >
            {data.company ? (
              <div className="max-w-2xl">
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <SettingStat
                    label="Currency"
                    value={data.company.currencyCode}
                  />
                  <SettingStat
                    label="VAT rate"
                    value={formatPercent(data.company.vatRate, 2)}
                  />
                  <SettingStat
                    label="Approval threshold"
                    value={formatMoney(
                      data.company.poApprovalThreshold,
                      data.company.currencyCode,
                      { compact: true },
                    )}
                  />
                </div>
                <CompanySettingsForm
                  company={{
                    name: data.company.name,
                    currencyCode: data.company.currencyCode,
                    vatRate: data.company.vatRate,
                    poApprovalThreshold: data.company.poApprovalThreshold,
                    address: data.company.address,
                  }}
                />
              </div>
            ) : (
              <EmptyState
                icon={<Building2 className="size-5" />}
                title="Company not found"
                description="We couldn't load your company record."
              />
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SettingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular text-foreground">{value}</div>
    </div>
  );
}
