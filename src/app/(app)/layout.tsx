import { requireUser, db } from "@/lib/auth/context";
import { companies } from "@/db/schema";
import { navForRole, ROLE_LABELS } from "@/lib/rbac";
import { AppShell } from "@/components/app/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [company] = await db((tx) =>
    tx.select({ name: companies.name }).from(companies).limit(1),
  );
  const nav = navForRole(user.role);

  return (
    <AppShell
      company={{ name: company?.name ?? "Workspace" }}
      user={{
        fullName: user.fullName,
        email: user.email,
        roleLabel: ROLE_LABELS[user.role],
      }}
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
