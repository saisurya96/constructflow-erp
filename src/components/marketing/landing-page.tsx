import Link from "next/link";
import {
  HardHat,
  ArrowRight,
  ArrowUpRight,
  FolderKanban,
  Boxes,
  ShoppingCart,
  Calculator,
  Receipt,
  ScrollText,
  CalendarClock,
  Truck,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";

/* The five-step spine — the product's whole thesis, mirrored from the auth hero. */
const SPINE: { title: string; body: string }[] = [
  {
    title: "Plan the job",
    body: "Schedule, WBS budget and milestones — board, table and Gantt in one plan.",
  },
  {
    title: "Raise the need",
    body: "Flag materials right on the task that needs them. No side spreadsheet.",
  },
  {
    title: "Source & order",
    body: "Send an RFQ, compare vendors side by side, release the PO with approvals.",
  },
  {
    title: "Receive at the gate",
    body: "Book the delivery — stock, cost and the blocked task all update together.",
  },
  {
    title: "Cost & bill",
    body: "Track budget vs actual live, manage changes, and invoice — automatically.",
  },
];

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: FolderKanban,
    title: "Projects & schedule",
    body: "Board, table and Gantt views. WBS budgets, milestones and tasks in one living plan.",
  },
  {
    icon: Boxes,
    title: "The material loop",
    body: "A need raised on a task flows to procurement, to the gate, to stock, to cost — and unblocks the task.",
  },
  {
    icon: ShoppingCart,
    title: "Procurement & RFQ",
    body: "Invite vendors, compare quotes side by side, and release POs through threshold-based approvals.",
  },
  {
    icon: Calculator,
    title: "Live job costing",
    body: "Budget vs committed vs actual vs forecast — per cost code and per job, updated in real time.",
  },
  {
    icon: Receipt,
    title: "Billing & payments",
    body: "Progress and milestone invoices, payment tracking, and a clean approvals inbox for the owner.",
  },
  {
    icon: ScrollText,
    title: "Full audit trail",
    body: "Every action logged and exportable. Always know who did what, and when, across the whole job.",
  },
];

const ROLES: { role: string; gets: string }[] = [
  { role: "Owner", gets: "One pane of every job's margin, plus an approvals inbox." },
  { role: "Project manager", gets: "Schedule, tasks and the WBS budget that drives cost." },
  { role: "Procurement", gets: "Requirements queued, RFQs compared, POs released." },
  { role: "Stores", gets: "Receive at the gate; stock and allocations stay honest." },
  { role: "Finance", gets: "Invoices, payments and cost — reconciled, not re-keyed." },
];

function Brand({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex size-8 items-center justify-center rounded-md bg-brand text-brand-foreground">
        <HardHat className="size-[1.1rem]" strokeWidth={2.25} />
      </span>
      <span className="font-display text-base font-semibold tracking-tight">
        ConstructFlow
      </span>
    </span>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ───────────────────────── nav ───────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
          <Brand />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#workflow" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#roles" className="transition-colors hover:text-foreground">
              For your team
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden h-9 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90"
            >
              Start free <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ───────────────────────── hero ───────────────────────── */}
        <section className="relative overflow-hidden bg-foreground text-background">
          <div
            aria-hidden
            className="blueprint-grid pointer-events-none absolute inset-0 text-background/[0.06]"
          />
          {/* corner registration marks */}
          <div aria-hidden className="pointer-events-none absolute left-8 top-8 hidden size-3 border-l border-t border-background/20 lg:block" />
          <div aria-hidden className="pointer-events-none absolute right-8 top-8 hidden size-3 border-r border-t border-background/20 lg:block" />
          <div aria-hidden className="pointer-events-none absolute bottom-8 left-8 hidden size-3 border-b border-l border-background/20 lg:block" />
          <div aria-hidden className="pointer-events-none absolute bottom-8 right-8 hidden size-3 border-b border-r border-background/20 lg:block" />

          <div className="relative mx-auto max-w-6xl px-5 py-24 lg:px-8 lg:py-32">
            <div className="mx-auto max-w-3xl text-center">
              <span className="eyebrow inline-flex items-center gap-2 rounded-full border border-background/15 px-3 py-1 text-background/55">
                <span className="size-1.5 rounded-full bg-brand" />
                Construction ERP — for small firms
              </span>
              <h1 className="mx-auto mt-7 max-w-2xl font-display text-[2.5rem] font-semibold leading-[1.08] tracking-tight sm:text-[3.25rem]">
                The first ERP a construction team{" "}
                <span className="text-brand">actually wants to use.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-background/60 sm:text-lg">
                Plan, procure, receive, cost and bill — one woven workflow. Enter
                the data once and it flows to everyone who needs it, all week long.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand px-7 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90 sm:w-auto"
                >
                  Start your workspace <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-background/20 px-7 text-sm font-medium text-background transition-colors hover:bg-background/10 sm:w-auto"
                >
                  Sign in
                </Link>
              </div>
              <p className="mt-7 flex items-center justify-center gap-1.5 text-xs text-background/40">
                <ArrowUpRight className="size-3.5" />
                Built for firms running on spreadsheets, WhatsApp and paper.
              </p>
            </div>
          </div>
        </section>

        {/* ──────────────────── workflow spine ──────────────────── */}
        <section id="workflow" className="border-b border-border bg-background">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="max-w-2xl">
              <span className="eyebrow text-brand">How it works</span>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                One woven workflow, end to end.
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                Most tools cover one box and leave you to re-key the rest. Here, a
                single thread runs from the first task to the final invoice.
              </p>
            </div>

            <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
              {SPINE.map((step, i) => (
                <li
                  key={step.title}
                  className="group relative flex flex-col bg-card p-6 transition-colors hover:bg-muted/40"
                >
                  <span className="font-mono text-xs tabular text-brand">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    aria-hidden
                    className="mt-3 h-px w-8 bg-brand/40 transition-all group-hover:w-12"
                  />
                  <h3 className="mt-4 font-display text-base font-semibold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ───────────────────── feature grid ───────────────────── */}
        <section id="features" className="border-b border-border bg-background">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="max-w-2xl">
              <span className="eyebrow text-brand">What&apos;s inside</span>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Everything the job needs. Nothing it doesn&apos;t.
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                Built around how small contractors actually run — not a watered-down
                enterprise suite no one on site will open.
              </p>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="bg-card p-7">
                    <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/50 text-brand">
                      <Icon className="size-5" strokeWidth={2} />
                    </span>
                    <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">
                      {f.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {f.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ───────── differentiator (enter once) ───────── */}
        <section className="border-b border-border bg-background">
          <div className="mx-auto max-w-4xl px-5 py-20 text-center lg:px-8 lg:py-28">
            <CalendarClock className="mx-auto size-7 text-brand" strokeWidth={1.75} />
            <p className="mx-auto mt-6 max-w-2xl font-display text-2xl font-semibold leading-snug tracking-tight sm:text-[2rem]">
              Enter it once on Monday.{" "}
              <span className="text-muted-foreground">
                The crew, the buyer, the stores and the books all see it by Tuesday —
                no re-typing, no chasing, no version that&apos;s already wrong.
              </span>
            </p>
          </div>
        </section>

        {/* ───────────────────────── roles ───────────────────────── */}
        <section id="roles" className="relative overflow-hidden bg-foreground text-background">
          <div
            aria-hidden
            className="blueprint-grid pointer-events-none absolute inset-0 text-background/[0.05]"
          />
          <div className="relative mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="max-w-2xl">
              <span className="eyebrow text-brand">For your whole team</span>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Every seat, one source of truth.
              </h2>
              <p className="mt-4 text-base text-background/55">
                Role-based access means each person sees their work — and the same
                numbers everyone else is working from.
              </p>
            </div>

            <ul className="mt-12 divide-y divide-background/10 border-y border-background/10">
              {ROLES.map((r, i) => (
                <li
                  key={r.role}
                  className="flex flex-col gap-1 py-5 sm:flex-row sm:items-baseline sm:gap-8"
                >
                  <span className="font-mono text-xs tabular text-brand">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="w-40 shrink-0 font-display text-lg font-semibold tracking-tight">
                    {r.role}
                  </span>
                  <span className="text-sm text-background/65">{r.gets}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─────────────────────── closing CTA ─────────────────────── */}
        <section className="bg-background">
          <div className="mx-auto max-w-4xl px-5 py-24 text-center lg:px-8 lg:py-32">
            <span className="eyebrow text-brand">Get started</span>
            <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-[2.5rem]">
              Ready to get off the spreadsheets?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base text-muted-foreground">
              Spin up a workspace in minutes and run your next job the woven way.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand px-7 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90 sm:w-auto"
              >
                Create your company <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-7 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ───────────────────────── footer ───────────────────────── */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row lg:px-8">
          <Brand />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BadgeCheck className="size-3.5 text-brand" />
            <span>Built for builders.</span>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Truck className="size-3.5" />
            ConstructFlow — construction ERP
          </p>
        </div>
      </footer>
    </div>
  );
}
