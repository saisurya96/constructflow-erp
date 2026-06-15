import { redirect } from "next/navigation";
import { HardHat, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/context";

const SPINE = [
  "Plan the project — schedule, WBS budget, milestones",
  "Raise material needs right on the task that needs them",
  "Source it — RFQ, compare vendors, release the PO",
  "Receive at the gate — stock, cost and the blocked task all update",
  "Track progress, manage changes, and bill — automatically",
];

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <HardHat className="size-5" />
          </div>
          <span className="text-lg font-semibold">ConstructFlow</span>
        </div>
        <div className="space-y-6">
          <h2 className="text-3xl font-semibold leading-tight">
            The first ERP a small construction team actually wants to use.
          </h2>
          <p className="max-w-md text-sidebar-foreground/70">
            One woven workflow — from planning to procurement to stores to cost.
            Enter data once; it flows to everyone who needs it.
          </p>
          <ul className="space-y-2.5">
            {SPINE.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-sidebar-foreground/80">
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-sidebar-primary" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/50">
          Built for firms running on spreadsheets, WhatsApp and paper.
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
