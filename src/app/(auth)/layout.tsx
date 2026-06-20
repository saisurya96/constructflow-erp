import Link from "next/link";
import { redirect } from "next/navigation";
import { HardHat, ArrowUpRight } from "lucide-react";
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
      {/* blueprint hero */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-10 text-background lg:flex">
        <div
          aria-hidden
          className="blueprint-grid pointer-events-none absolute inset-0 text-background/[0.07]"
        />
        {/* corner registration marks */}
        <div aria-hidden className="pointer-events-none absolute right-8 top-8 size-3 border-r border-t border-background/20" />
        <div aria-hidden className="pointer-events-none absolute bottom-8 left-8 size-3 border-b border-l border-background/20" />

        <Link href="/" className="relative flex w-fit items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-md bg-brand text-brand-foreground">
            <HardHat className="size-4.5" strokeWidth={2.25} />
          </div>
          <span className="font-display text-base font-semibold tracking-tight">
            ConstructFlow
          </span>
        </Link>

        <div className="relative space-y-7">
          <span className="eyebrow block text-background/45">
            Construction ERP — v1
          </span>
          <h2 className="max-w-md font-display text-[2.15rem] font-semibold leading-[1.12] tracking-tight">
            The first ERP a small construction team actually wants to use.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-background/55">
            One woven workflow — from planning to procurement to stores to cost.
            Enter data once; it flows to everyone who needs it.
          </p>
          <ul className="space-y-3 border-t border-background/10 pt-5">
            {SPINE.map((line, i) => (
              <li
                key={line}
                className="flex items-start gap-3 text-sm text-background/85"
              >
                <span className="mt-px font-mono text-xs tabular text-brand">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-1.5 text-xs text-background/40">
          <ArrowUpRight className="size-3.5" />
          Built for firms running on spreadsheets, WhatsApp and paper.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* brand + way home for small screens, where the hero is hidden */}
          <Link
            href="/"
            className="mb-8 flex w-fit items-center gap-2.5 lg:hidden"
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-brand text-brand-foreground">
              <HardHat className="size-4.5" strokeWidth={2.25} />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">
              ConstructFlow
            </span>
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
